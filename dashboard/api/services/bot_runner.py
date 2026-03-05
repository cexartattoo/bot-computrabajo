"""
Bot Runner – Launches bot.py as a subprocess and streams output via WebSocket.
Manages bot lifecycle: start, stop, status, and semi-auto confirmation queue.

Uses subprocess.Popen + threading instead of asyncio.create_subprocess_exec
because Windows SelectorEventLoop (used by uvicorn) does not support
asyncio subprocesses (raises NotImplementedError).
"""
import asyncio
import subprocess
import sys
import os
import logging
import traceback
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)


class BotStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    STOPPING = "stopping"


class BotManager:
    """Singleton that manages the bot subprocess."""

    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.status: BotStatus = BotStatus.IDLE
        self.current_mode: str = "apply"
        self.session_start: Optional[datetime] = None
        self.apps_this_session: int = 0
        self.log_lines: list[str] = []
        self.max_log_lines: int = 2000
        self.ws_clients: set = set()
        self.confirm_queue: asyncio.Queue = asyncio.Queue()
        self.pending_confirmation: Optional[dict] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._project_root = Path(__file__).resolve().parent.parent.parent.parent

    async def start(self, mode: str = "apply", max_apps: int = None,
                    keyword: str = None, cv: str = None) -> dict:
        """Launch the bot as a subprocess."""
        if self.status in (BotStatus.RUNNING, BotStatus.PAUSED, BotStatus.STOPPING):
            return {"error": "Bot ya esta corriendo o pausado", "status": self.status}

        cmd = [sys.executable, "-m", "bot.bot", "--mode", mode]
        if max_apps:
            cmd += ["--max", str(max_apps)]
        if keyword:
            cmd += ["--keyword", keyword]
        if cv:
            cmd += ["--cv", cv]

        self.current_mode = mode
        self.session_start = datetime.now()
        self.apps_this_session = 0
        self.log_lines.clear()

        # Force UTF-8 to avoid UnicodeEncodeError on Windows (CP1252)
        subprocess_env = {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }

        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                cwd=str(self._project_root),
                env=subprocess_env,
            )
            self.status = BotStatus.RUNNING

            # Capture the current event loop for thread-safe scheduling
            self._loop = asyncio.get_running_loop()

            # Start a background thread to read stdout lines
            self._reader_thread = threading.Thread(
                target=self._read_stdout_thread,
                daemon=True,
                name="bot-stdout-reader",
            )
            self._reader_thread.start()

            await self._broadcast(
                f"[SYSTEM] Bot iniciado en modo {mode} (PID {self.process.pid})"
            )

            try:
                from dashboard.api.services.notifier import send_notification
                await send_notification(f"Bot iniciado - modo: {mode}")
            except Exception:
                pass

            return {"status": self.status, "pid": self.process.pid, "mode": mode}

        except Exception as e:
            self.status = BotStatus.ERROR
            error_detail = f"{type(e).__name__}: {repr(e)}"
            logger.error(f"Bot start failed: {error_detail}")
            logger.error(traceback.format_exc())
            return {"error": error_detail, "status": self.status}

    def _read_stdout_thread(self):
        """
        Runs in a background thread. Reads the subprocess stdout line by line
        and schedules async broadcasts on the main event loop.
        """
        try:
            proc = self.process
            if proc is None or proc.stdout is None:
                return

            for line_bytes in iter(proc.stdout.readline, b""):
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                if not line:
                    continue

                # Prefix with timestamp
                timestamp = datetime.now().strftime("%H:%M:%S")
                line = f"[{timestamp}] {line}"

                self.log_lines.append(line)
                if len(self.log_lines) > self.max_log_lines:
                    self.log_lines = self.log_lines[-self.max_log_lines:]

                if "Registrado:" in line or "aplicaciones procesadas" in line:
                    self.apps_this_session += 1

                if "[SEMI-AUTO]" in line and "confirmar" in line.lower():
                    self.status = BotStatus.PAUSED
                    self.pending_confirmation = {
                        "line": line,
                        "timestamp": datetime.now().isoformat()
                    }

                # Detect report generation and broadcast special [REPORT] message
                if "Informe generado" in line or "[REPORT]" in line:
                    import re
                    match = re.search(r'(informe_[\w]+\.html)', line)
                    if match:
                        report_name = match.group(1)
                        report_line = f"[{datetime.now().strftime('%H:%M:%S')}] [REPORT] {report_name}"
                        self.log_lines.append(report_line)
                        if self._loop and self._loop.is_running():
                            asyncio.run_coroutine_threadsafe(
                                self._broadcast(report_line), self._loop
                            )

                # Schedule the async broadcast on the event loop
                if self._loop and self._loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        self._broadcast(line), self._loop
                    )

        except Exception as e:
            logger.error(f"Reader thread error: {e}")
            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self._broadcast(f"[ERROR] Stream: {type(e).__name__}: {e}"),
                    self._loop,
                )
        finally:
            # Wait for the process to finish
            if self.process:
                self.process.wait()
                rc = self.process.returncode
                if self.status != BotStatus.IDLE:
                    self.status = BotStatus.IDLE if rc == 0 else BotStatus.ERROR
                    if self._loop and self._loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            self._broadcast(
                                f"[SYSTEM] Proceso termino (exit code: {rc})"
                            ),
                            self._loop,
                        )
                        try:
                            from dashboard.api.services.notifier import send_notification
                            label = "[OK]" if rc == 0 else "[ERR]"
                            asyncio.run_coroutine_threadsafe(
                                send_notification(
                                    f"{label} Bot termino (exit code: {rc}). "
                                    f"Aplicaciones: {self.apps_this_session}"
                                ),
                                self._loop,
                            )
                        except Exception:
                            pass

    async def stop(self) -> dict:
        """Stop the running bot subprocess gracefully."""
        if self.process is None or self.status not in (BotStatus.RUNNING, BotStatus.PAUSED):
            return {"status": self.status, "message": "No hay bot corriendo"}

        self.status = BotStatus.STOPPING
        await self._broadcast("[SYSTEM] Deteniendo bot...")

        try:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        except ProcessLookupError:
            pass
        except OSError:
            pass
        finally:
            self.status = BotStatus.IDLE
            self.process = None

        duration = ""
        if self.session_start:
            elapsed = datetime.now() - self.session_start
            minutes = int(elapsed.total_seconds() // 60)
            duration = f" ({minutes} min)"

        msg = f"Bot detenido{duration}. Aplicaciones esta sesion: {self.apps_this_session}"
        await self._broadcast(f"[SYSTEM] {msg}")

        try:
            from dashboard.api.services.notifier import send_notification
            await send_notification(msg)
        except Exception:
            pass

        return {"status": self.status, "message": msg}

    async def confirm(self, approved: bool) -> dict:
        """Respond to a semi-auto confirmation request."""
        if self.pending_confirmation is None:
            return {"error": "No hay confirmacion pendiente"}

        await self.confirm_queue.put(approved)
        action = "aprobada" if approved else "rechazada"
        await self._broadcast(f"[SYSTEM] Aplicacion {action} por el usuario")
        self.pending_confirmation = None
        self.status = BotStatus.RUNNING
        return {"message": f"Aplicacion {action}"}

    def get_status(self) -> dict:
        """Return current bot status and session info."""
        return {
            "status": self.status,
            "mode": self.current_mode,
            "session_start": self.session_start.isoformat() if self.session_start else None,
            "apps_this_session": self.apps_this_session,
            "pending_confirmation": self.pending_confirmation,
            "log_tail": self.log_lines[-50:],
        }

    async def _broadcast(self, message: str):
        """Send a message to all connected WebSocket clients."""
        dead = set()
        for ws in self.ws_clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.ws_clients -= dead

    def register_ws(self, ws):
        self.ws_clients.add(ws)

    def unregister_ws(self, ws):
        self.ws_clients.discard(ws)


# Singleton global — importado por las rutas del dashboard
bot_manager = BotManager()
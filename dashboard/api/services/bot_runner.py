"""
Bot Runner — Launches bot.py as a subprocess and streams output via WebSocket.
Manages bot lifecycle: start, stop, status, and semi-auto confirmation queue.
"""
import asyncio
import subprocess
import sys
import signal
import os
from datetime import datetime
from pathlib import Path
from typing import Optional
from enum import Enum


class BotStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    STOPPING = "stopping"


class BotManager:
    """Singleton that manages the bot subprocess."""

    def __init__(self):
        self.process: Optional[asyncio.subprocess.Process] = None
        self.status: BotStatus = BotStatus.IDLE
        self.current_mode: str = "apply"
        self.session_start: Optional[datetime] = None
        self.apps_this_session: int = 0
        self.log_lines: list[str] = []
        self.max_log_lines: int = 2000
        self.ws_clients: set = set()
        self.confirm_queue: asyncio.Queue = asyncio.Queue()
        self.pending_confirmation: Optional[dict] = None
        self._read_task: Optional[asyncio.Task] = None
        self._project_root = Path(__file__).resolve().parent.parent.parent.parent

    async def start(self, mode: str = "apply", max_apps: int = None,
                    keyword: str = None, cv: str = None) -> dict:
        """Launch the bot as a subprocess."""
        if self.status == BotStatus.RUNNING:
            return {"error": "Bot ya está corriendo", "status": self.status}

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

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(self._project_root),
                env={**os.environ},
            )
            self.status = BotStatus.RUNNING
            self._read_task = asyncio.create_task(self._stream_output())

            await self._broadcast(f"[SYSTEM] Bot iniciado en modo {mode} (PID {self.process.pid})")

            # Send Telegram notification
            try:
                from dashboard.api.services.notifier import send_notification
                await send_notification(f"🟢 Bot iniciado — modo: {mode}")
            except Exception:
                pass

            return {"status": self.status, "pid": self.process.pid, "mode": mode}

        except Exception as e:
            self.status = BotStatus.ERROR
            return {"error": str(e), "status": self.status}

    async def stop(self) -> dict:
        """Stop the running bot subprocess gracefully."""
        if self.process is None or self.status not in (BotStatus.RUNNING, BotStatus.PAUSED):
            return {"status": self.status, "message": "No hay bot corriendo"}

        self.status = BotStatus.STOPPING
        await self._broadcast("[SYSTEM] Deteniendo bot...")

        try:
            if sys.platform == "win32":
                self.process.terminate()
            else:
                self.process.send_signal(signal.SIGINT)

            try:
                await asyncio.wait_for(self.process.wait(), timeout=10)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

        except ProcessLookupError:
            pass
        finally:
            self.status = BotStatus.IDLE
            self.process = None
            if self._read_task:
                self._read_task.cancel()
                self._read_task = None

        duration = ""
        if self.session_start:
            elapsed = datetime.now() - self.session_start
            minutes = int(elapsed.total_seconds() // 60)
            duration = f" ({minutes} min)"

        msg = f"⏹ Bot detenido{duration}. Aplicaciones esta sesión: {self.apps_this_session}"
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
            return {"error": "No hay confirmación pendiente"}

        await self.confirm_queue.put(approved)
        action = "aprobada" if approved else "rechazada"
        await self._broadcast(f"[SYSTEM] Aplicación {action} por el usuario")
        self.pending_confirmation = None
        self.status = BotStatus.RUNNING
        return {"message": f"Aplicación {action}"}

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

    async def _stream_output(self):
        """Read subprocess stdout line by line, broadcast via WebSocket."""
        try:
            while self.process and self.process.stdout:
                line_bytes = await self.process.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                if not line:
                    continue

                self.log_lines.append(line)
                if len(self.log_lines) > self.max_log_lines:
                    self.log_lines = self.log_lines[-self.max_log_lines:]

                # Count applications
                if "Registrado:" in line or "aplicaciones procesadas" in line:
                    self.apps_this_session += 1

                # Detect semi-auto pause
                if "[SEMI-AUTO]" in line and "confirmar" in line.lower():
                    self.status = BotStatus.PAUSED
                    self.pending_confirmation = {"line": line, "timestamp": datetime.now().isoformat()}

                await self._broadcast(line)

        except asyncio.CancelledError:
            return
        except Exception as e:
            await self._broadcast(f"[ERROR] Stream: {e}")
        finally:
            # Process finished
            if self.process:
                rc = self.process.returncode
                if self.status != BotStatus.IDLE:
                    self.status = BotStatus.IDLE if rc == 0 else BotStatus.ERROR
                    await self._broadcast(f"[SYSTEM] Proceso terminó (exit code: {rc})")

                    try:
                        from dashboard.api.services.notifier import send_notification
                        emoji = "✅" if rc == 0 else "❌"
                        await send_notification(
                            f"{emoji} Bot terminó (code={rc}). "
                            f"Aplicaciones: {self.apps_this_session}"
                        )
                    except Exception:
                        pass

                self.process = None

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


# Singleton instance
bot_manager = BotManager()

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
        self.pending_missing: Optional[dict] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._project_root = Path(__file__).resolve().parent.parent.parent.parent
        self._log_file = None
        self._logs_dir = self._project_root / "logs"
        self._logs_dir.mkdir(exist_ok=True)
        self._semi_auto_dir = self._project_root / ".semi_auto"
        self._semi_auto_dir.mkdir(exist_ok=True)

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

        # Clean old log files (older than 7 days)
        self._clean_old_logs()

        # Open log file for this session
        log_filename = f"bot_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"
        try:
            if self._log_file:
                self._log_file.close()
            self._log_file = open(
                self._logs_dir / log_filename, "w", encoding="utf-8"
            )
        except Exception as e:
            logger.warning(f"Could not open log file: {e}")
            self._log_file = None

        # Force UTF-8 and UNBUFFERED output for real-time log streaming
        subprocess_env = {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
            "PYTHONUNBUFFERED": "1",  # Critical: forces stdout flush after every print
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

                # Write to log file
                if self._log_file:
                    try:
                        self._log_file.write(line + "\n")
                        self._log_file.flush()
                    except Exception:
                        pass

                if "Registrado:" in line or "aplicaciones procesadas" in line:
                    self.apps_this_session += 1

                if "[SEMI-AUTO]" in line and "confirmar" in line.lower():
                    self.status = BotStatus.PAUSED
                    self.pending_confirmation = {
                        "line": line,
                        "timestamp": datetime.now().isoformat()
                    }

                # Intercept [REVIEW_REQUEST] JSON marker from semi-auto mode
                if "[REVIEW_REQUEST]" in line:
                    import json as _json
                    try:
                        json_str = line.split("[REVIEW_REQUEST]", 1)[1]
                        review_data = _json.loads(json_str)
                        self.status = BotStatus.PAUSED
                        self.pending_confirmation = {
                            "type": "review_request",
                            "data": review_data,
                            "timestamp": datetime.now().isoformat()
                        }
                        # Broadcast structured JSON to WebSocket clients
                        if self._loop and self._loop.is_running():
                            asyncio.run_coroutine_threadsafe(
                                self._broadcast(_json.dumps(review_data, ensure_ascii=False)),
                                self._loop
                            )
                            # Send Telegram notification with Q&A summary
                            try:
                                from dashboard.api.services.telegram_bot import telegram_bot
                                job = review_data.get("job", {})
                                answers = review_data.get("answers", {})
                                dashboard_url = os.environ.get("DASHBOARD_URL", "http://localhost:8000")
                                tg_msg = (
                                    f"Oferta para revision:\n"
                                    f"<b>{job.get('title', '?')}</b>\n"
                                    f"{job.get('company', '')} | {job.get('location', '')}\n\n"
                                )
                                if answers:
                                    tg_msg += "Preguntas y respuestas:\n"
                                    for idx, (q, a) in enumerate(answers.items(), 1):
                                        if isinstance(a, dict):
                                            resp = a.get("answer", a.get("respuesta", "?"))
                                            conf = a.get("confianza", "?")
                                        else:
                                            resp = str(a)
                                            conf = "?"
                                        resp_short = str(resp)[:120]
                                        tg_msg += f"{idx}. {q[:60]}\n   -> {resp_short} (Confianza: {conf})\n"
                                else:
                                    tg_msg += "No hay preguntas para responder en esta oferta.\n"
                                tg_msg += (
                                    f"\n<a href=\"{dashboard_url}/#/review\">Revisar en dashboard</a>\n"
                                    f"O usa /aprobar | /rechazar | /ver_oferta"
                                )
                                asyncio.run_coroutine_threadsafe(
                                    telegram_bot.send(tg_msg[:4000]), self._loop
                                )
                            except Exception:
                                pass
                        # Don't broadcast the raw line (it's huge JSON)
                        continue
                    except Exception as e:
                        logger.warning(f"Failed to parse REVIEW_REQUEST: {e}")

                # Intercept [MISSING_DATA] marker for dato faltante flow
                if "[MISSING_DATA]" in line:
                    import json as _json
                    try:
                        json_str = line.split("[MISSING_DATA]", 1)[1]
                        missing_data = _json.loads(json_str)
                        self.pending_missing = missing_data

                        # Broadcast to WebSocket clients
                        if self._loop and self._loop.is_running():
                            asyncio.run_coroutine_threadsafe(
                                self._broadcast(_json.dumps(missing_data, ensure_ascii=False)),
                                self._loop
                            )
                            # Send Telegram notification
                            try:
                                from dashboard.api.services.telegram_bot import telegram_bot
                                dashboard_url = os.environ.get("DASHBOARD_URL", "http://localhost:8000")
                                tg_msg = (
                                    f"DATO FALTANTE\n"
                                    f"Oferta: <b>{missing_data.get('job_title', '?')}</b> | {missing_data.get('company', '')}\n"
                                    f"Pregunta: <b>{missing_data.get('question', '?')}</b>\n"
                                    f"Respuesta actual: {missing_data.get('current_answer', 'N/A')}\n"
                                    f"Confianza: {missing_data.get('confianza', '?')}\n\n"
                                    f"Responde con /dato [tu respuesta] en los proximos 5 minutos.\n"
                                    f"<a href=\"{dashboard_url}/#/review\">O responde en el dashboard</a>"
                                )
                                asyncio.run_coroutine_threadsafe(
                                    telegram_bot.send(tg_msg), self._loop
                                )
                            except Exception:
                                pass
                        continue
                    except Exception as e:
                        logger.warning(f"Failed to parse MISSING_DATA: {e}")

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

            # Close log file
            if self._log_file:
                try:
                    self._log_file.close()
                except Exception:
                    pass
                self._log_file = None

    def _clean_old_logs(self, max_age_days: int = 7):
        """Remove log files older than max_age_days."""
        import time
        now = time.time()
        cutoff = now - (max_age_days * 86400)
        try:
            for f in self._logs_dir.glob("bot_*.log"):
                if f.stat().st_mtime < cutoff:
                    f.unlink()
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

    async def respond_missing(self, answer: str) -> dict:
        """Respond to a missing data request from the bot."""
        import json as _json
        resp_file = self._semi_auto_dir / "missing_response.json"
        resp_file.write_text(_json.dumps({"answer": answer}, ensure_ascii=False), encoding="utf-8")
        self.pending_missing = None
        await self._broadcast(f"[SYSTEM] Dato proporcionado: {answer[:80]}")
        return {"status": "ok", "message": f"Dato enviado: {answer[:80]}"}

    async def confirm(self, approved: bool, edited_answers: dict = None, cv: str = None) -> dict:
        """Respond to a semi-auto confirmation request."""
        if self.pending_confirmation is None:
            return {"error": "No hay confirmacion pendiente"}

        # Write response file for bot subprocess to read
        import json as _json
        response_file = self._semi_auto_dir / "response.json"
        response_data = {
            "approved": approved,
            "edited_answers": edited_answers or {},
            "cv": cv,
        }
        response_file.write_text(
            _json.dumps(response_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

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
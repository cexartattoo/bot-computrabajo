"""
Telegram Bot — Long-polling command handler for Cesar Bot.
Uses httpx to poll getUpdates, no extra dependencies needed.
"""
import asyncio
import os
import logging
import json
from pathlib import Path
from datetime import datetime

import httpx
import hashlib

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:8000")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _short_id(text: str) -> str:
    """Generate a short 6-char ID from text for callback_data."""
    return hashlib.md5(text.encode()).hexdigest()[:6]


class TelegramBot:
    """Long-polling Telegram bot with bot control commands and inline keyboards."""

    def __init__(self):
        self.token = TELEGRAM_BOT_TOKEN
        self.allowed_chat = TELEGRAM_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.offset = 0
        self.running = False
        self._task = None
        # Offer history: keyed by short offer_id -> review_data
        self.offers_history: dict[str, dict] = {}
        # Latest missing data reference for callback
        self.pending_missing_data: dict | None = None

    @property
    def enabled(self):
        return bool(self.token and self.allowed_chat)

    async def send(self, text: str, parse_mode: str = "HTML"):
        """Send a message to the configured chat."""
        if not self.enabled:
            return
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(f"{self.base_url}/sendMessage", json={
                    "chat_id": self.allowed_chat,
                    "text": text,
                    "parse_mode": parse_mode,
                })
        except Exception as e:
            logger.error(f"Telegram send error: {e}")

    async def send_document(self, file_path: Path, caption: str = ""):
        """Send a file to the configured chat."""
        if not self.enabled or not file_path.exists():
            return
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                with open(file_path, "rb") as f:
                    await client.post(
                        f"{self.base_url}/sendDocument",
                        data={"chat_id": self.allowed_chat, "caption": caption},
                        files={"document": (file_path.name, f)},
                    )
        except Exception as e:
            logger.error(f"Telegram send_document error: {e}")

    async def send_with_inline_keyboard(self, text: str, buttons: list[list[dict]], parse_mode: str = "HTML"):
        """Send a message with an inline keyboard.
        buttons format: [[{"text": "Label", "callback_data": "data"}, ...], ...]
        """
        if not self.enabled:
            return
        try:
            reply_markup = {"inline_keyboard": buttons}
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(f"{self.base_url}/sendMessage", json={
                    "chat_id": self.allowed_chat,
                    "text": text,
                    "parse_mode": parse_mode,
                    "reply_markup": reply_markup,
                })
        except Exception as e:
            logger.error(f"Telegram send_with_keyboard error: {e}")

    async def answer_callback(self, callback_query_id: str, text: str = ""):
        """Answer a callback query (dismiss the loading spinner on the button)."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(f"{self.base_url}/answerCallbackQuery", json={
                    "callback_query_id": callback_query_id,
                    "text": text[:200] if text else "",
                })
        except Exception:
            pass

    def store_offer(self, offer_id: str, review_data: dict):
        """Store an offer in history for later retrieval by ID."""
        self.offers_history[offer_id] = review_data
        # Keep only last 20 offers to avoid memory bloat
        if len(self.offers_history) > 20:
            oldest = list(self.offers_history.keys())[0]
            del self.offers_history[oldest]

    def _get_bot_manager(self):
        from dashboard.api.services.bot_runner import bot_manager
        return bot_manager

    async def _handle_command(self, cmd: str, text: str):
        """Process a received command."""
        bm = self._get_bot_manager()

        if cmd == "/start" or cmd == "/start_auto":
            mode = "apply"
            result = await bm.start(mode=mode)
            await self.send(f"Bot iniciado en modo <b>automatico</b>.\n{result.get('message', result.get('status', ''))}")

        elif cmd == "/start_semi":
            result = await bm.start(mode="semi-auto")
            link = f"{DASHBOARD_URL}/#/review"
            await self.send(
                f"Bot iniciado en modo <b>semi-auto</b>.\n"
                f"<a href=\"{link}\">Abrir revision en dashboard</a>"
            )

        elif cmd == "/stop":
            result = await bm.stop()
            await self.send(f"Bot detenido.\n{result.get('message', '')}")

        elif cmd == "/restart":
            old_mode = bm.current_mode
            await bm.stop()
            await asyncio.sleep(2)
            result = await bm.start(mode=old_mode)
            await self.send(f"Bot reiniciado en modo <b>{old_mode}</b>.\n{result.get('message', result.get('status', ''))}")

        elif cmd == "/pausar":
            result = await bm.pause()
            await self.send(f"Bot pausado.\n{result.get('message', '')}")

        elif cmd == "/reanudar":
            result = await bm.resume()
            await self.send(f"Bot reanudado.\n{result.get('message', '')}")

        elif cmd == "/status":
            s = bm.get_status()
            status = s.get("status", "?")
            mode = s.get("mode", "?")
            apps = s.get("apps_this_session", 0)
            started = s.get("session_start", "N/A")
            pending = "Si" if s.get("pending_confirmation") else "No"
            await self.send(
                f"<b>Estado:</b> {status}\n"
                f"<b>Modo:</b> {mode}\n"
                f"<b>Aplicaciones:</b> {apps}\n"
                f"<b>Inicio sesion:</b> {started}\n"
                f"<b>Pendiente revision:</b> {pending}"
            )

        elif cmd == "/revision":
            link = f"{DASHBOARD_URL}/#/review"
            await self.send(f"<a href=\"{link}\">Abrir pagina de revision</a>")

        elif cmd == "/aprobar":
            if bm.pending_confirmation:
                result = await bm.confirm(approved=True)
                await self.send(f"Aplicacion aprobada. {result.get('message', '')}")
            else:
                await self.send("No hay aplicacion pendiente de revision.")

        elif cmd == "/rechazar":
            if bm.pending_confirmation:
                result = await bm.confirm(approved=False)
                await self.send(f"Aplicacion rechazada. {result.get('message', '')}")
            else:
                await self.send("No hay aplicacion pendiente de revision.")

        elif cmd == "/ver_oferta":
            if bm.pending_confirmation and bm.pending_confirmation.get("type") == "review_request":
                data = bm.pending_confirmation.get("data", {})
                job = data.get("job", {})
                answers = data.get("answers", {})
                msg = (
                    f"<b>{job.get('title', '?')}</b>\n"
                    f"{job.get('company', '')} | {job.get('location', '')}\n"
                    f"{job.get('url', '')}\n\n"
                )
                for q, a in answers.items():
                    ans_text = a.get("answer", a) if isinstance(a, dict) else a
                    conf = a.get("confianza", "?") if isinstance(a, dict) else "?"
                    msg += f"<b>P:</b> {q}\n<b>R:</b> {str(ans_text)[:200]}\n<b>Confianza:</b> {conf}\n\n"
                await self.send(msg[:4000])
            else:
                await self.send("No hay oferta en revision.")

        elif cmd == "/reporte":
            # Trigger report generation via the bot subprocess
            await self.send("Generando informe... usa /ultimo_informe cuando termine.")

        elif cmd == "/informes":
            bot_dir = PROJECT_ROOT / "bot"
            reports = sorted(bot_dir.glob("informe_*.html"), reverse=True)
            if not reports:
                await self.send("No hay informes generados.")
            else:
                msg = "<b>Informes disponibles:</b>\n\n"
                for r in reports[:10]:
                    size_kb = round(r.stat().st_size / 1024, 1)
                    modified = datetime.fromtimestamp(r.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
                    msg += f"- {r.name} ({size_kb} KB, {modified})\n"
                await self.send(msg)

        elif cmd == "/ultimo_informe":
            bot_dir = PROJECT_ROOT / "bot"
            reports = sorted(bot_dir.glob("informe_*.html"), reverse=True)
            if reports:
                await self.send_document(reports[0], caption=f"Ultimo informe: {reports[0].name}")
            else:
                await self.send("No hay informes generados.")

        elif cmd == "/ui":
            await self.send(f"<a href=\"{DASHBOARD_URL}\">Abrir Dashboard</a>")

        elif cmd == "/logs":
            bm = self._get_bot_manager()
            tail = bm.log_lines[-20:]
            if tail:
                msg = "<pre>" + "\n".join(tail) + "</pre>"
                await self.send(msg[:4000])
            else:
                await self.send("Sin logs disponibles.")

        elif cmd == "/ayuda":
            await self.send(
                "<b>Comandos disponibles:</b>\n\n"
                "<b>Control:</b>\n"
                "/start - Iniciar (modo auto)\n"
                "/start_auto - Iniciar automatico\n"
                "/start_semi - Iniciar semi-auto\n"
                "/stop - Detener\n"
                "/pausar - Pausar bot\n"
                "/reanudar - Reanudar bot\n"
                "/status - Estado actual\n"
                "/restart - Reiniciar\n\n"
                "<b>Revision:</b>\n"
                "/revision - Link a revision\n"
                "/aprobar - Aprobar oferta\n"
                "/rechazar - Rechazar oferta\n"
                "/ver_oferta - Ver oferta actual\n\n"
                "<b>Informes:</b>\n"
                "/informes - Listar informes\n"
                "/ultimo_informe - Enviar ultimo\n\n"
                "<b>Otros:</b>\n"
                "/dato - Responder dato faltante\n"
                "/ui - Link al dashboard\n"
                "/logs - Ultimas lineas del log\n"
                "/ayuda - Esta ayuda"
            )

        elif cmd == "/dato":
            if text:
                result = await bm.respond_missing(answer=text)
                await self.send(f"Dato enviado: {text[:100]}")
            else:
                await self.send("Uso: /dato [tu respuesta]\nEjemplo: /dato 15 de marzo de 2020")

        else:
            await self.send(f"Comando no reconocido: {cmd}\nUsa /ayuda para ver comandos.")

    async def _handle_callback_query(self, callback_query: dict):
        """Handle inline keyboard button presses."""
        cb_id = callback_query.get("id", "")
        data = callback_query.get("data", "")
        chat_id = str(callback_query.get("message", {}).get("chat", {}).get("id", ""))

        if chat_id != self.allowed_chat:
            return

        bm = self._get_bot_manager()

        # Offer actions: aprobar_XXXXXX, rechazar_XXXXXX, ver_XXXXXX
        if data.startswith("aprobar_"):
            offer_id = data.split("_", 1)[1]
            if bm.pending_confirmation:
                result = await bm.confirm(approved=True)
                await self.answer_callback(cb_id, "Oferta aprobada")
                await self.send(f"Oferta aprobada. {result.get('message', '')}")
            else:
                await self.answer_callback(cb_id, "Ya no hay oferta pendiente")
                await self.send("Esta oferta ya no esta pendiente de revision.")

        elif data.startswith("rechazar_"):
            offer_id = data.split("_", 1)[1]
            if bm.pending_confirmation:
                result = await bm.confirm(approved=False)
                await self.answer_callback(cb_id, "Oferta rechazada")
                await self.send(f"Oferta rechazada. {result.get('message', '')}")
            else:
                await self.answer_callback(cb_id, "Ya no hay oferta pendiente")
                await self.send("Esta oferta ya no esta pendiente de revision.")

        elif data.startswith("ver_"):
            offer_id = data.split("_", 1)[1]
            offer = self.offers_history.get(offer_id)
            if offer:
                job = offer.get("job", {})
                answers = offer.get("answers", {})
                msg = (
                    f"<b>{job.get('title', '?')}</b>\n"
                    f"{job.get('company', '')} | {job.get('location', '')}\n"
                    f"{job.get('url', '')}\n\n"
                )
                if job.get('description'):
                    msg += f"<b>Descripcion:</b>\n{job['description'][:500]}...\n\n"
                for q, a in answers.items():
                    ans_text = a.get("answer", a) if isinstance(a, dict) else a
                    conf = a.get("confianza", "?") if isinstance(a, dict) else "?"
                    msg += f"<b>P:</b> {q}\n<b>R:</b> {str(ans_text)[:200]}\n<b>Confianza:</b> {conf}\n\n"
                await self.answer_callback(cb_id, "Mostrando oferta")
                await self.send(msg[:4000])
            else:
                await self.answer_callback(cb_id, "Oferta no encontrada")
                await self.send("No se encontro esta oferta en el historial.")

        # Missing data option: dato_OPCION
        elif data.startswith("dato_"):
            answer = data.split("dato_", 1)[1]
            result = await bm.respond_missing(answer=answer)
            await self.answer_callback(cb_id, f"Enviado: {answer}")
            await self.send(f"Dato enviado: <b>{answer}</b>")

    async def _poll_loop(self):
        """Main polling loop — runs forever."""
        logger.info("Telegram bot polling started")
        async with httpx.AsyncClient(timeout=35) as client:
            while self.running:
                try:
                    resp = await client.get(
                        f"{self.base_url}/getUpdates",
                        params={"offset": self.offset, "timeout": 30},
                    )
                    if resp.status_code != 200:
                        await asyncio.sleep(5)
                        continue

                    data = resp.json()
                    for update in data.get("result", []):
                        self.offset = update["update_id"] + 1

                        # Handle inline keyboard button presses
                        cb = update.get("callback_query")
                        if cb:
                            try:
                                await self._handle_callback_query(cb)
                            except Exception as e:
                                logger.error(f"Telegram callback error: {e}")
                            continue

                        # Handle regular text commands
                        msg = update.get("message", {})
                        chat_id = str(msg.get("chat", {}).get("id", ""))
                        text = msg.get("text", "").strip()

                        if chat_id != self.allowed_chat:
                            continue

                        if text.startswith("/"):
                            parts = text.split(maxsplit=1)
                            cmd = parts[0].lower().split("@")[0]  # Remove @bot_name
                            rest = parts[1] if len(parts) > 1 else ""
                            try:
                                await self._handle_command(cmd, rest)
                            except Exception as e:
                                logger.error(f"Telegram command error: {e}")
                                await self.send(f"Error: {e}")

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Telegram poll error: {e}")
                    await asyncio.sleep(5)

    def start_polling(self):
        """Start the polling loop as a background task."""
        if not self.enabled:
            logger.info("Telegram bot not configured, skipping.")
            return
        self.running = True
        self._task = asyncio.create_task(self._poll_loop())

    async def stop_polling(self):
        """Stop the polling loop."""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


# Singleton
telegram_bot = TelegramBot()

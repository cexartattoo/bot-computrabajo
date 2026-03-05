"""
Telegram Notifier — Sends messages to the user's Telegram bot.
Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.
"""
import os
import httpx
import logging

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
TELEGRAM_ENABLED = bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


async def send_notification(message: str) -> bool:
    """Send a message via Telegram Bot API. Returns True if sent."""
    if not TELEGRAM_ENABLED:
        logger.debug("Telegram no configurado, notificación omitida.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": f"🤖 César Bot\n\n{message}",
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            else:
                logger.warning(f"Telegram API error: {resp.status_code} — {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Error enviando a Telegram: {e}")
        return False


def is_telegram_configured() -> bool:
    return TELEGRAM_ENABLED

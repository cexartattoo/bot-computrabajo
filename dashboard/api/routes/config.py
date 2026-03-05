"""
Config Routes — Keywords, API key status, CV list.
"""
import os
import sys
from pathlib import Path
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dashboard.api.services.auth import get_current_user

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _get_config_module():
    """Import bot.config dynamically."""
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    from bot import config
    return config


@router.get("/keywords")
async def get_keywords(user=Depends(get_current_user)):
    config = _get_config_module()
    return {"keywords": config.SEARCH_KEYWORDS}


class KeywordsUpdate(BaseModel):
    keywords: list[str]


@router.put("/keywords")
async def update_keywords(body: KeywordsUpdate, user=Depends(get_current_user)):
    """Update keywords in config.py (runtime only, persistent via .env)."""
    config = _get_config_module()
    config.SEARCH_KEYWORDS = body.keywords
    return {"saved": True, "keywords": config.SEARCH_KEYWORDS}


@router.get("/api-keys")
async def api_keys_status(user=Depends(get_current_user)):
    """Show which API keys are configured (never expose the actual values)."""
    keys = []
    for i in range(1, 6):
        suffix = "" if i == 1 else f"_{i}"
        env_name = f"GEMINI_API_KEY{suffix}"
        value = os.getenv(env_name, "")
        keys.append({
            "name": env_name,
            "configured": bool(value),
            "preview": f"{value[:8]}...{value[-4:]}" if len(value) > 12 else ("***" if value else ""),
        })
    return {"keys": keys}


@router.get("/cvs")
async def list_cvs(user=Depends(get_current_user)):
    """List available CV files."""
    cv_dir = PROJECT_ROOT
    files = []
    for f in cv_dir.glob("*.docx"):
        files.append({
            "filename": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "path": str(f),
        })
    return {"cvs": files}


@router.get("/telegram")
async def telegram_status(user=Depends(get_current_user)):
    from dashboard.api.services.notifier import is_telegram_configured
    return {
        "configured": is_telegram_configured(),
        "bot_token_set": bool(os.getenv("TELEGRAM_BOT_TOKEN", "")),
        "chat_id_set": bool(os.getenv("TELEGRAM_CHAT_ID", "")),
    }


@router.get("/locations")
async def get_locations(user=Depends(get_current_user)):
    config = _get_config_module()
    return {"locations": config.SEARCH_LOCATIONS}


class LocationsUpdate(BaseModel):
    locations: list[str]


@router.put("/locations")
async def update_locations(body: LocationsUpdate, user=Depends(get_current_user)):
    """Update search locations at runtime and persist to .env."""
    config = _get_config_module()
    config.SEARCH_LOCATIONS = [loc.strip() for loc in body.locations if loc.strip()]
    # Also update derived compat values
    config.SEARCH_LOCATION = config.SEARCH_LOCATIONS[0] if config.SEARCH_LOCATIONS else "Bogota"
    config.SEARCH_REMOTE = "teletrabajo" in [l.lower() for l in config.SEARCH_LOCATIONS]
    # Persist to .env
    _update_env("SEARCH_LOCATIONS", ",".join(config.SEARCH_LOCATIONS))
    return {"saved": True, "locations": config.SEARCH_LOCATIONS}


def _update_env(key: str, value: str):
    """Update or add a key=value in the project .env file."""
    env_path = PROJECT_ROOT / ".env"
    lines = []
    found = False
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    new_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}={value}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


# ── Blacklist ────────────────────────────────────────────────

@router.get("/blacklist")
async def get_blacklist(user=Depends(get_current_user)):
    config = _get_config_module()
    return {"blacklist": getattr(config, "BLACKLISTED_COMPANIES", [])}


class BlacklistUpdate(BaseModel):
    blacklist: list[str]


@router.put("/blacklist")
async def update_blacklist(body: BlacklistUpdate, user=Depends(get_current_user)):
    config = _get_config_module()
    config.BLACKLISTED_COMPANIES = [b.strip() for b in body.blacklist if b.strip()]
    _update_env("BLACKLISTED_COMPANIES", ",".join(config.BLACKLISTED_COMPANIES))
    return {"saved": True, "blacklist": config.BLACKLISTED_COMPANIES}


# ── Notifications ────────────────────────────────────────────
import json

NOTIF_FILE = PROJECT_ROOT / "notification_prefs.json"


def _load_notif_prefs():
    if NOTIF_FILE.exists():
        try:
            return json.loads(NOTIF_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"telegram_enabled": False, "browser_enabled": False}


def _save_notif_prefs(prefs):
    NOTIF_FILE.write_text(json.dumps(prefs, indent=2), encoding="utf-8")


@router.get("/notifications")
async def get_notifications(user=Depends(get_current_user)):
    return _load_notif_prefs()


class NotificationsUpdate(BaseModel):
    telegram_enabled: bool = False
    browser_enabled: bool = False


@router.put("/notifications")
async def update_notifications(body: NotificationsUpdate, user=Depends(get_current_user)):
    prefs = {"telegram_enabled": body.telegram_enabled, "browser_enabled": body.browser_enabled}
    _save_notif_prefs(prefs)
    return prefs

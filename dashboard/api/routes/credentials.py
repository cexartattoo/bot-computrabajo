"""
Credentials Routes — Secure .env management.
Never exposes actual password values to the frontend.
"""
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from dashboard.api.services.auth import get_current_user

router = APIRouter()

ENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"


def _read_env() -> dict:
    """Parse .env file into a dict."""
    env = {}
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    env[key.strip()] = value.strip()
    return env


def _write_env(env: dict):
    """Write dict back to .env file, preserving comments."""
    lines = []
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            original_lines = f.readlines()
        written_keys = set()
        for line in original_lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                lines.append(line)
                continue
            if "=" in stripped:
                key = stripped.split("=", 1)[0].strip()
                if key in env:
                    lines.append(f"{key}={env[key]}\n")
                    written_keys.add(key)
                else:
                    lines.append(line)
            else:
                lines.append(line)
        # Add new keys not in original
        for key, value in env.items():
            if key not in written_keys:
                lines.append(f"{key}={value}\n")
    else:
        for key, value in env.items():
            lines.append(f"{key}={value}\n")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)


@router.get("")
async def get_credentials(user=Depends(get_current_user)):
    """Show which credential keys exist (NEVER expose actual values)."""
    env = _read_env()
    safe_keys = [
        "CT_EMAIL", "CT_PASSWORD",
        "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4", "GEMINI_API_KEY_5",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
        "CV_PATH",
    ]
    result = {}
    for key in safe_keys:
        value = env.get(key, "")
        if key == "CT_EMAIL":
            # Email can be shown
            result[key] = {"value": value, "configured": bool(value)}
        elif key == "CV_PATH":
            result[key] = {"value": value, "configured": bool(value)}
        else:
            # Mask secrets
            result[key] = {
                "value": "••••••••" if value else "",
                "configured": bool(value),
            }
    return {"credentials": result}


class CredentialUpdate(BaseModel):
    key: str
    value: str


@router.put("")
async def update_credential(body: CredentialUpdate, user=Depends(get_current_user)):
    """Update a single key in .env."""
    allowed = [
        "CT_EMAIL", "CT_PASSWORD", "CV_PATH",
        "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4", "GEMINI_API_KEY_5",
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
    ]
    if body.key not in allowed:
        raise HTTPException(400, f"Clave '{body.key}' no permitida")

    env = _read_env()
    env[body.key] = body.value
    _write_env(env)

    # Also update os.environ for the running process
    os.environ[body.key] = body.value

    return {"saved": True, "key": body.key}

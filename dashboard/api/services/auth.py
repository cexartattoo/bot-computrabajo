"""
Auth Service — Google OAuth2 + JWT sessions.
For local/dev use: skip auth if DASHBOARD_DEV_MODE=true in .env.
"""
import os
import time
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from fastapi import Request, HTTPException, Depends
from fastapi.responses import RedirectResponse

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
ALLOWED_EMAIL = os.getenv("DASHBOARD_ALLOWED_EMAIL", "")
DEV_MODE = os.getenv("DASHBOARD_DEV_MODE", "true").lower() == "true"

# Token blacklist (in-memory; resets on restart)
_token_blacklist: set[str] = set()


def create_token(email: str) -> str:
    """Create a JWT token for the given email."""
    payload = {
        "sub": email,
        "iat": time.time(),
        "exp": time.time() + TOKEN_EXPIRE_HOURS * 3600,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token. Returns payload or None."""
    if token in _token_blacklist:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except JWTError:
        return None


def blacklist_token(token: str):
    _token_blacklist.add(token)


async def get_current_user(request: Request) -> dict:
    """
    Dependency: extracts and validates auth from the request.
    In DEV_MODE, returns a mock user.
    """
    if DEV_MODE:
        return {"email": "dev@localhost", "dev_mode": True}

    token = request.cookies.get("auth_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")

    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    email = payload.get("sub", "")
    if ALLOWED_EMAIL and email != ALLOWED_EMAIL:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    return {"email": email}

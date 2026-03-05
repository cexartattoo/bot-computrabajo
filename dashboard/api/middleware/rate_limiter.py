"""
Rate Limiter — Configures slowapi to protect endpoints from abuse.
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import FastAPI

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


def setup_rate_limiter(app: FastAPI):
    """Attach slowapi limiter to the FastAPI app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

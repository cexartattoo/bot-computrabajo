"""
César Bot Dashboard — FastAPI Backend
Exposes REST + WebSocket API to control the bot remotely.
"""
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv

# Ensure project root is on sys.path so `bot.*` imports work
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env")

# ── Import routes ────────────────────────────────────────────
from dashboard.api.routes import bot as bot_routes
from dashboard.api.routes import history as history_routes
from dashboard.api.routes import knowledge as knowledge_routes
from dashboard.api.routes import config as config_routes
from dashboard.api.routes import profile as profile_routes
from dashboard.api.routes import credentials as credentials_routes
from dashboard.api.middleware.security import SecurityHeadersMiddleware
from dashboard.api.middleware.rate_limiter import setup_rate_limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    print("  🚀 César Bot Dashboard — API lista")
    yield
    # Shutdown: kill any running bot subprocess
    from dashboard.api.services.bot_runner import bot_manager
    await bot_manager.stop()
    print("  ⏹  Dashboard API detenida")


app = FastAPI(
    title="César Bot Dashboard",
    version="3.0.0",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "change-me-in-production-please"),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
setup_rate_limiter(app)

# ── Routes ───────────────────────────────────────────────────
app.include_router(bot_routes.router, prefix="/api/bot", tags=["Bot"])
app.include_router(history_routes.router, prefix="/api/history", tags=["History"])
app.include_router(knowledge_routes.router, prefix="/api/knowledge", tags=["Knowledge"])
app.include_router(config_routes.router, prefix="/api/config", tags=["Config"])
app.include_router(profile_routes.router, prefix="/api/profile", tags=["Profile"])
app.include_router(credentials_routes.router, prefix="/api/credentials", tags=["Credentials"])

# ── Health check ─────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dashboard.api.main:app", host="0.0.0.0", port=8000, reload=True)

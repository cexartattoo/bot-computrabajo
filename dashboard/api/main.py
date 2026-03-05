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
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv

import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Ensure project root is on sys.path so `bot.*` imports work
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Fix Windows CP1252 crash: force UTF-8 on stdout/stderr
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

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
    print("  [OK] Cesar Bot Dashboard -- API lista")
    yield
    # Shutdown: kill any running bot subprocess
    from dashboard.api.services.bot_runner import bot_manager
    await bot_manager.stop()
    print("  [STOP] Dashboard API detenida")


app = FastAPI(
    title="Cesar Bot Dashboard",
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


# ── Reports ──────────────────────────────────────────────────
BOT_DIR = PROJECT_ROOT / "bot"

@app.get("/api/reports")
async def list_reports():
    """List all generated HTML reports."""
    reports = []
    for f in sorted(BOT_DIR.glob("informe_*.html"), reverse=True):
        reports.append({
            "filename": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "modified": f.stat().st_mtime,
        })
    return {"reports": reports}


@app.get("/api/reports/{filename}")
async def get_report(filename: str):
    """Serve a specific HTML report file."""
    # Security: only allow informe_*.html files
    if not filename.startswith("informe_") or not filename.endswith(".html"):
        return {"error": "Invalid filename"}
    file_path = BOT_DIR / filename
    if not file_path.exists():
        return {"error": "Report not found"}
    return FileResponse(file_path, media_type="text/html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dashboard.api.main:app", host="0.0.0.0", port=8000, reload=True)


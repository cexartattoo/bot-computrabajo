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
    # Start Telegram bot polling
    try:
        from dashboard.api.services.telegram_bot import telegram_bot
        telegram_bot.start_polling()
        if telegram_bot.enabled:
            print("  [OK] Telegram bot polling iniciado")
    except Exception as e:
        print(f"  [WARN] Telegram bot no pudo iniciar: {e}")
    yield
    # Shutdown
    try:
        from dashboard.api.services.telegram_bot import telegram_bot
        await telegram_bot.stop_polling()
    except Exception:
        pass
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


@app.delete("/api/reports/{filename}")
async def delete_report(filename: str):
    """Delete a specific HTML report file."""
    if not filename.startswith("informe_") or not filename.endswith(".html"):
        return {"error": "Invalid filename"}
    file_path = BOT_DIR / filename
    if not file_path.exists():
        return {"error": "Report not found"}
    file_path.unlink()
    return {"deleted": filename}


@app.post("/api/reports/generate")
async def generate_report():
    """Trigger report generation by running the bot with --report flag."""
    import subprocess
    try:
        result = subprocess.run(
            [sys.executable, "-m", "bot.bot", "--report"],
            capture_output=True, text=True, timeout=30,
            cwd=str(PROJECT_ROOT),
        )
        # Find report filename in output
        import re
        match = re.search(r'(informe_[\w]+\.html)', result.stdout + result.stderr)
        if match:
            return {"report": match.group(1)}
        return {"message": "Informe generado", "output": result.stdout[-500:]}
    except Exception as e:
        return {"error": str(e)}

# ── Serve compiled frontend (SPA) ─────────────────────────────
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for any non-API route."""
        # Try to serve the exact file first
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html (SPA client-side routing)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dashboard.api.main:app", host="0.0.0.0", port=8000, reload=True)

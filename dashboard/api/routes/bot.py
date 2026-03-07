"""
Bot Control Routes — start, stop, status, confirm, WebSocket logs.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

from dashboard.api.services.bot_runner import bot_manager
from dashboard.api.services.auth import get_current_user

# Determine project root path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

router = APIRouter()


class BotStartRequest(BaseModel):
    mode: str = "apply"
    max_apps: Optional[int] = None
    keyword: Optional[str] = None
    cv: Optional[str] = None


@router.post("/start")
async def start_bot(body: BotStartRequest, user=Depends(get_current_user)):
    return await bot_manager.start(
        mode=body.mode,
        max_apps=body.max_apps,
        keyword=body.keyword,
        cv=body.cv,
    )


@router.post("/stop")
async def stop_bot(user=Depends(get_current_user)):
    return await bot_manager.stop()


@router.post("/pause")
async def pause_bot(user=Depends(get_current_user)):
    return await bot_manager.pause()


@router.post("/resume")
async def resume_bot(user=Depends(get_current_user)):
    return await bot_manager.resume()



@router.get("/status")
async def bot_status(user=Depends(get_current_user)):
    return bot_manager.get_status()


class ConfirmRequest(BaseModel):
    approved: bool
    edited_answers: Optional[dict] = None
    cv: Optional[str] = None


@router.post("/confirm")
async def confirm_action(body: ConfirmRequest, user=Depends(get_current_user)):
    return await bot_manager.confirm(
        approved=body.approved,
        edited_answers=body.edited_answers,
        cv=body.cv,
    )


class MissingDataResponse(BaseModel):
    answer: str


@router.post("/respond_missing")
async def respond_missing(body: MissingDataResponse, user=Depends(get_current_user)):
    return await bot_manager.respond_missing(answer=body.answer)


@router.get("/screen")
async def get_bot_screen(user=Depends(get_current_user)):
    """Serves the latest bot screenshot for live streaming"""
    screen_path = PROJECT_ROOT / ".semi_auto" / "screen.jpg"
    if not screen_path.exists():
        return {"error": "Screen not available"}
    
    return FileResponse(
        screen_path, 
        media_type="image/jpeg", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )


@router.websocket("/ws")
async def websocket_logs(ws: WebSocket):
    await ws.accept()
    bot_manager.register_ws(ws)
    # Send recent log lines on connect
    for line in bot_manager.log_lines[-100:]:
        await ws.send_text(line)
    try:
        while True:
            # Keep connection alive; client can send pings
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        bot_manager.unregister_ws(ws)

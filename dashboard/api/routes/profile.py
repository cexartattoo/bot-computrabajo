"""
Profile Routes — Read/write cv_data.json with backup.
"""
import json
import shutil
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dashboard.api.services.auth import get_current_user

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CV_DATA_PATH = PROJECT_ROOT / "cv_data.json"


@router.get("/cv")
async def get_cv_data(user=Depends(get_current_user)):
    """Return cv_data.json contents."""
    if not CV_DATA_PATH.exists():
        raise HTTPException(404, "cv_data.json no encontrado")
    with open(CV_DATA_PATH, "r", encoding="utf-8") as f:
        return {"data": json.load(f), "raw": f.read() if False else None}


@router.get("/cv/raw")
async def get_cv_raw(user=Depends(get_current_user)):
    """Return raw JSON string for the Monaco editor."""
    if not CV_DATA_PATH.exists():
        raise HTTPException(404, "cv_data.json no encontrado")
    with open(CV_DATA_PATH, "r", encoding="utf-8") as f:
        return {"raw": f.read()}


class CvDataUpdate(BaseModel):
    raw: str


@router.put("/cv")
async def update_cv_data(body: CvDataUpdate, user=Depends(get_current_user)):
    """Save cv_data.json with automatic backup."""
    # Validate JSON
    try:
        parsed = json.loads(body.raw)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"JSON inválido: {e}")

    # Backup current file
    if CV_DATA_PATH.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = PROJECT_ROOT / f"cv_data.backup_{timestamp}.json"
        shutil.copy2(CV_DATA_PATH, backup_path)

    # Save new content (pretty-printed)
    with open(CV_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)

    return {"saved": True, "keys": len(parsed)}

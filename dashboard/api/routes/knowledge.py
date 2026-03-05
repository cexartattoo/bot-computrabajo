"""
Knowledge Routes — CRUD on persistent_knowledge.json.
"""
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dashboard.api.services.auth import get_current_user

router = APIRouter()

KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "persistent_knowledge.json"


def _load() -> dict:
    if KNOWLEDGE_PATH.exists():
        with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save(data: dict):
    with open(KNOWLEDGE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("")
async def get_knowledge(user=Depends(get_current_user)):
    data = _load()
    return {"count": len(data), "data": data}


class KnowledgeUpdate(BaseModel):
    data: dict


@router.put("")
async def update_knowledge(body: KnowledgeUpdate, user=Depends(get_current_user)):
    _save(body.data)
    return {"saved": True, "count": len(body.data)}


class KnowledgeEntry(BaseModel):
    key: str
    value: str


@router.post("/entry")
async def add_entry(body: KnowledgeEntry, user=Depends(get_current_user)):
    data = _load()
    data[body.key] = body.value
    _save(data)
    return {"saved": True, "count": len(data)}


@router.delete("/entry/{key}")
async def delete_entry(key: str, user=Depends(get_current_user)):
    data = _load()
    if key not in data:
        raise HTTPException(404, "Clave no encontrada")
    del data[key]
    _save(data)
    return {"deleted": key, "count": len(data)}

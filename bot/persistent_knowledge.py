import json
import os
from pathlib import Path

KNOWLEDGE_FILE = Path(__file__).parent.parent / "persistent_knowledge.json"

def load_persistent_knowledge() -> dict:
    if not KNOWLEDGE_FILE.exists():
        return {}
    try:
        with open(KNOWLEDGE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  [!] Error cargando persistent_knowledge.json: {e}")
        return {}

def save_persistent_knowledge(data: dict):
    try:
        # Load existing first to merge
        existing = load_persistent_knowledge()
        existing.update(data)
        with open(KNOWLEDGE_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"  [!] Error guardando persistent_knowledge.json: {e}")

def get_knowledge_summary() -> str:
    """Returns a formatted string of the persistent knowledge for the LLM prompt"""
    data = load_persistent_knowledge()
    if not data:
        return ""
    
    summary = "\\n[DATOS ADICIONALES APRENDIDOS (usar si son relevantes)]:\\n"
    for q, a in data.items():
        summary += f"• Para preguntas sobre '{q}': {a}\\n"
    return summary

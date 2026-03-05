"""
Bot Configuration — Edit this file before running the bot
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

# ─── Computrabajo Credentials ───────────────────────
CT_EMAIL    = os.getenv("CT_EMAIL", "")       # tu email de Computrabajo
CT_PASSWORD = os.getenv("CT_PASSWORD", "")    # tu contraseña

# ─── Gemini API ──────────────────────────────────────
# Puedes poner varias API keys para que roten cuando se agote el cupo:
# GEMINI_API_KEY=key1
# GEMINI_API_KEY_2=key2
# GEMINI_API_KEY_3=key3
_raw_keys = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
    os.getenv("GEMINI_API_KEY_4", ""),
]
GEMINI_API_KEYS = [k for k in _raw_keys if k.strip()]  # Lista de keys disponibles
GEMINI_API_KEY  = GEMINI_API_KEYS[0] if GEMINI_API_KEYS else ""  # compatibilidad

# ─── Candidate Contact ───────────────────────────────
CANDIDATE_PHONE = "+57 321 9121216"  # Tu número de WhatsApp/teléfono real

# ─── Search Parameters ───────────────────────────────
SEARCH_KEYWORDS = [
    "ingeniero mecatrónico",
    "automatización industrial",
    "visión artificial",
    "programador Python",
    "ingeniero robótica",
    "desarrollador Python",
    "ingeniero control",
]
SEARCH_LOCATION  = "Bogotá"    # Ciudad principal
SEARCH_REMOTE    = True        # Incluir trabajos remotos
MIN_SALARY       = 0           # Filtrar por salario mínimo (0 = sin filtro)

# ─── Bot Behavior ────────────────────────────────────
MAX_APPLICATIONS_PER_RUN = 10  # Límite de aplicaciones por sesión
DELAY_MIN_SECONDS = 3          # Delay mínimo entre acciones (anti-bot)
DELAY_MAX_SECONDS = 8          # Delay máximo
HEADLESS = False               # True = sin ventana, False = ver el browser

# ─── CV Profiles ─────────────────────────────────────
_PROJECT_ROOT = Path(__file__).parent.parent

CV_PROFILES = {
    "general": {
        "archivo": "CV_ATS_César.docx",
        "descripcion": "CV general para la mayoría de vacantes en Colombia",
        "ideal_para": ["administración", "coordinación", "gestión de proyectos"],
        "idioma": "es",
    },
    "tecnico": {
        "archivo": "CV_ATS_César.docx",  # mismo por ahora, se puede especializar
        "descripcion": "CV técnico enfocado en stack de desarrollo y automatización",
        "ideal_para": ["python", "automatización", "robótica", "visión artificial", "plc"],
        "idioma": "es",
    },
    "ingles": {
        "archivo": "CV_ATS_César.docx",  # placeholder hasta crear versión en inglés
        "descripcion": "CV en inglés para multinacionales o vacantes que lo requieran",
        "ideal_para": ["multinacional", "remoto internacional", "empresa extranjera"],
        "idioma": "en",
    },
}

def get_cv_path(profile_key: str = "general") -> Path:
    """Devuelve el Path del CV según el perfil seleccionado."""
    profile = CV_PROFILES.get(profile_key, CV_PROFILES["general"])
    return _PROJECT_ROOT / profile["archivo"]

# ─── Output ──────────────────────────────────────────
DB_PATH  = Path(__file__).parent / "applications.db"
LOG_PATH = Path(__file__).parent / "bot.log"
CV_PATH  = get_cv_path("general")  # default, overridable via --cv flag

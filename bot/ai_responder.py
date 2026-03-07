"""
AI Responder — Uses Gemini API to answer job application questions.

Strategy:
  - Tries models in order of preference (best → fastest)
  - For each model, iterates over all configured API keys
  - Falls back to rule-based templates if everything fails

Modes (set via bot CLI):
  --mode apply       → Normal: fills form and submits (default)
  --mode dry-run-llm → LLM answers questions, generates report, but NEVER submits
  --mode semi-auto   → LLM answers, user reviews/edits each answer before submitting
"""
import json
from datetime import datetime
from pathlib import Path

try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
import re

from bot.config import GEMINI_API_KEYS, CANDIDATE_PHONE
from bot.persistent_knowledge import get_knowledge_summary

# ─── Datos duros del candidato (NUNCA se fabrican, siempre se usan literales) ───
# Estos valores son la "fuente de verdad" para datos de contacto y ubicación.
# Si cv_data.json los tiene, los toma de allí; si no, usa estos defaults.
CANDIDATE_HARD_DATA = {
    "telefono":   CANDIDATE_PHONE,
    "direccion":  "La Candelaria, Bogotá D.C., Colombia",
    "localidad":  "La Candelaria",
    "barrio":     "La Candelaria",
    "ciudad":     "Bogotá D.C.",
    "pais":       "Colombia",
}

# Load CV data once at module level
_CV_DATA = None

# Try models from best to fastest/cheapest
GEMINI_MODELS = [
    "gemma-3-4b-it",
    "gemma-3-12b-it",
    "gemma-3-27b-it",
    "gemma-3n-e4b-it",
    "gemma-3n-e2b-it",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-robotics-er-1.5-preview",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemma-3-27b-it",
    "gemma-3-12b-it",
    "gemma-3-4b-it",
]


# ══════════════════════════════════════════════════════════════
#  CV LOADING & SUMMARY
# ══════════════════════════════════════════════════════════════

def _load_cv() -> dict:
    global _CV_DATA
    if _CV_DATA is None:
        cv_path = Path(__file__).parent.parent / "cv_data.json"
        with open(cv_path, "r", encoding="utf-8") as f:
            _CV_DATA = json.load(f)
    return _CV_DATA


def _cv_summary() -> str:
    """
    Build a detailed yet compact CV summary for the LLM prompt.
    Merges cv_data.json with CANDIDATE_HARD_DATA so datos duros nunca fallan.
    """
    d = _load_cv()
    p = d.get("informacion_personal", {})
    exp = d.get("experiencia", [])
    skills = d.get("habilidades", {})
    edu = d.get("educacion", [])

    # Prioriza cv_data.json pero cae a CANDIDATE_HARD_DATA si está vacío
    telefono  = p.get("telefono") or CANDIDATE_HARD_DATA["telefono"]
    ciudad    = p.get("ciudad")   or CANDIDATE_HARD_DATA["ciudad"]
    direccion = p.get("direccion") or CANDIDATE_HARD_DATA["direccion"]
    localidad = p.get("localidad") or CANDIDATE_HARD_DATA["localidad"]

    exp_text = "\n".join(
        f"  • {e['cargo']} en {e['empresa']} ({e.get('fecha_inicio', '')}–{e.get('fecha_fin', '')})"
        + (f"\n    Logros: {e.get('logros', [''])[0]}" if e.get("logros") else "")
        for e in exp
    )

    edu_text = "\n".join(
        f"  • {e['titulo']} — {e['institucion']} ({e.get('fecha_fin', '')})"
        + (f" | GPA: {e['gpa']}" if e.get("gpa") else "")
        for e in edu
    )

    lang_items   = list(skills.get("lenguajes_programacion", {}).keys())
    robot_items  = list(skills.get("robotica_automatizacion", {}).keys())
    vision_items = list(skills.get("vision_artificial", {}).keys())
    soft_items   = list(skills.get("habilidades_blandas", {}).keys())

    projects = "\n".join(
        f"  • {pr['nombre']}: {pr.get('descripcion', '')[:150]}"
        for pr in d.get("proyectos", [])
    )

    return f"""
CANDIDATO: {p.get('nombre', 'César Javier Ramírez Hormaza')}
TELÉFONO / WHATSAPP: {telefono}
EMAIL: {p.get('email', '')}
DIRECCIÓN: {direccion}
LOCALIDAD / BARRIO: {localidad}
CIUDAD: {ciudad}
LINKEDIN: {p.get('linkedin', '')}

RESUMEN PROFESIONAL:
{d.get('resumen_profesional', '')}

EDUCACIÓN:
{edu_text}

EXPERIENCIA LABORAL:
{exp_text}

HABILIDADES TÉCNICAS:
  Programación: {', '.join(lang_items)}
  Robótica / Automatización: {', '.join(robot_items)}
  Visión Artificial: {', '.join(vision_items)}

HABILIDADES BLANDAS: {', '.join(soft_items)}

PROYECTOS DESTACADOS:
{projects}

DISPONIBILIDAD: {d.get('informacion_adicional', {}).get('disponibilidad', 'Inmediata')}
MODALIDAD PREFERIDA: {', '.join(d.get('informacion_adicional', {}).get('tipo_empleo', []))}
IDIOMAS: {', '.join(f"{k}: {v}" for k, v in d.get('idiomas', {}).items())}
""".strip()


# ══════════════════════════════════════════════════════════════
#  PROMPT BUILDER
# ══════════════════════════════════════════════════════════════

def _build_prompt_batch(
    questions: list[str],
    job_title: str = "",
    company: str = "",
    job_description: str = "",
    job_url: str = "",
) -> str:
    """
    Construye el prompt completo para el LLM.

    Jerarquía de veracidad (MUY IMPORTANTE):
      NIVEL 1 — DATOS DUROS: teléfono, dirección, nombre, email.
               El LLM SIEMPRE usa el valor literal. Nunca inventa, nunca mejora.
      NIVEL 2 — DATOS DE CV: experiencia, logros, educación.
               El LLM puede mejorar redacción y resaltar lo más relevante,
               pero NO puede inventar cargos, empresas, fechas ni tecnologías
               que no estén en el CV.
      NIVEL 3 — RESPUESTAS NARRATIVAS: motivación, por qué esta empresa, etc.
               El LLM puede redactar con libertad usando el perfil real como base.
               Puede conectar puntos del CV con la oferta de forma creativa.
    """
    # Filtra preguntas vacías o que solo tengan espacios
    valid_questions = [q.strip() for q in questions if q and q.strip()]
    skipped_questions = [q for q in questions if not q or not q.strip()]

    if not valid_questions:
        return ""  # nada que preguntar

    # Numera las preguntas para el LLM
    questions_numbered = "\n".join(
        f"{i+1}. {q}" for i, q in enumerate(valid_questions)
    )

    # Agrega contexto de la oferta solo si hay descripción
    job_context_block = ""
    if job_description:
        job_context_block = f"""
DESCRIPCIÓN DE LA OFERTA (úsala para personalizar las respuestas):
{job_description[:1500]}
"""

    # Nota sobre preguntas saltadas (para debug interno, no va al LLM)
    skipped_note = ""
    if skipped_questions:
        skipped_note = f"# NOTA INTERNA: Se saltaron {len(skipped_questions)} pregunta(s) vacía(s)."

    phone = CANDIDATE_HARD_DATA["telefono"]
    address = CANDIDATE_HARD_DATA["direccion"]
    localidad = CANDIDATE_HARD_DATA["localidad"]

    fecha_actual = datetime.now().strftime("%d de %B de %Y")

    prompt = f"""Eres un experto en recursos humanos y coach de carrera especializado en el mercado laboral colombiano. Tu mision es ayudar a Cesar a conseguir este trabajo redactando respuestas de postulacion que sean honestas, especificas y orientadas a resultados.

FECHA ACTUAL: {fecha_actual} -- estamos en 2026.

══════════════════════════════════════════
CONTEXTO DE EDUCACION (usar SIEMPRE, no inventar):
══════════════════════════════════════════
Cesar es Ingeniero Mecatronico graduado en octubre de 2025, Universidad de Pamplona, GPA 4.06, con Tarjeta Profesional COPNIA vigente. Formacion tecnica SENA: Mantenimiento de Motores 2 y 4 Tiempos, mayo 2016, GPA 5.0. NO mencionar que esta estudiando -- es profesional titulado.

══════════════════════════════════════════
DATOS REALES DEL CANDIDATO (fuente de verdad):
══════════════════════════════════════════
{_cv_summary()}

{get_knowledge_summary()}
══════════════════════════════════════════
OFERTA A LA QUE SE APLICA:
══════════════════════════════════════════
Cargo: {job_title or "No especificado"}
Empresa: {company or "No especificada"}
Enlace: {job_url or "No disponible"}
{job_context_block}
══════════════════════════════════════════
PREGUNTAS DEL FORMULARIO:
══════════════════════════════════════════
{questions_numbered}

══════════════════════════════════════════
REGLAS DE RESPUESTA (CRÍTICAS — léelas antes de responder):
══════════════════════════════════════════

[DATOS DUROS — responde SOLO con el valor exacto, sin agregar nada]:
• Teléfono / Celular / WhatsApp → responde ÚNICAMENTE: {phone}
• Nombre completo → responde ÚNICAMENTE el nombre del CV
• Email / Correo → responde ÚNICAMENTE el email del CV
• Dirección / Residencia → responde ÚNICAMENTE: {address}
• Localidad / Barrio → responde ÚNICAMENTE: {localidad}
• Ciudad → responde ÚNICAMENTE: Bogotá D.C.

[DATOS DE CV — puedes mejorar redacción, pero NO inventes]:
• Si preguntan experiencia: usa SOLO las empresas y cargos reales del CV
• Si preguntan tecnologías: menciona SOLO las del CV (Python, C++, Siemens S7-1200, OpenCV, ROS, etc.)
• Si preguntan SCADA / HMI / PLC / Siemens → confirma con experiencia real de la tesis (S7-1200, nota 5.0)
• Si no hay información suficiente en el CV para responder bien → indica "DATO_FALTANTE" como valor

[RESPUESTAS NARRATIVAS — redacta con libertad usando el perfil real]:
• Motivación, por qué esta empresa, fortalezas: redacta naturalmente, máximo 120 palabras
• Conecta la experiencia real de César con los requisitos de ESTA oferta específica
• Usa español profesional colombiano, primera persona, tono confiado pero no arrogante
• Evita clichés: "soy apasionado", "trabajo en equipo", "me gusta aprender"
• Orienta hacia resultados: menciona el 25% de reducción en tiempos de ciclo, los 25 proyectos internacionales, el Robot Tatuador 360, cuando sea relevante

[SALARIO Y DISPONIBILIDAD]:
• Pretensiones salariales → "Entre 2.5 y 3.5 millones, negociable según responsabilidades del cargo"
• Disponibilidad → "Disponibilidad inmediata"

[SELECCION DE CV / ARCHIVO ADJUNTO]:
• Si la pregunta es sobre selección de CV, hoja de vida o archivo adjunto,
  responde UNICAMENTE con el nombre exacto del archivo principal: "Cesar_Ramirez_Ingeniero_Mecatronico_CV-1.pdf"
  Sin ninguna explicación adicional.

[REGLA CRITICA — NO INVENTES PREGUNTAS]:
• Responde UNICAMENTE las preguntas listadas arriba. NO agregues preguntas extra.
• El array "respuestas" debe tener EXACTAMENTE {len(valid_questions)} elementos, uno por cada pregunta.
• Si inventas preguntas que no están en la lista, tu respuesta será descartada.

══════════════════════════════════════════
FORMATO DE RESPUESTA (OBLIGATORIO):
══════════════════════════════════════════
Devuelve ÚNICAMENTE un objeto JSON con esta estructura exacta.
NO incluyas markdown, bloques ```json, explicaciones ni texto fuera del JSON.

Cada elemento del array "respuestas" debe tener:
  - "pregunta": texto EXACTO de la pregunta original (cópialo sin modificar)
  - "respuesta": tu respuesta
  - "tipo": "dato_duro" | "cv_real" | "narrativa" | "dato_faltante"
  - "confianza": "alta" | "media" | "baja" (qué tan seguro estás de la respuesta)

Ejemplo:
{{
  "respuestas": [
    {{
      "pregunta": "¿Cuál es tu número de celular?",
      "respuesta": "{phone}",
      "tipo": "dato_duro",
      "confianza": "alta"
    }},
    {{
      "pregunta": "¿Por qué quieres trabajar con nosotros?",
      "respuesta": "Me interesa esta oportunidad porque...",
      "tipo": "narrativa",
      "confianza": "alta"
    }},
    {{
      "pregunta": "¿Tienes certificación en X?",
      "respuesta": "DATO_FALTANTE",
      "tipo": "dato_faltante",
      "confianza": "baja"
    }}
  ]
}}

JSON A CONTINUACIÓN:"""

    return prompt, valid_questions, skipped_questions


# ══════════════════════════════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════════════════════════════

def summarize_job(job_title: str, company: str, job_description: str, quick_facts: dict = None) -> dict:
    """Extrae un resumen estructurado de la oferta usando IA.
    
    Retorna un dict con campos clave de la oferta interpretados por el modelo.
    Si el parsing falla, retorna dict con clave 'description' como fallback.
    """
    if not job_description or not GEMINI_AVAILABLE or not GEMINI_API_KEYS:
        return {"description": "Resumen IA no disponible."}
        
    quick_facts_text = ""
    if quick_facts:
        quick_facts_text = "DATOS ADICIONALES EXTRAÍDOS PREVIAMENTE:\n" + "\n".join(f"- {k}: {v}" for k, v in quick_facts.items()) + "\n\n"

    prompt = f"""Analiza el siguiente texto de una oferta laboral para el cargo de "{job_title}" en la empresa "{company}".

{quick_facts_text}TEXTO DE LA OFERTA:
{job_description[:4000]}

Extrae la informacion y genera un resumen estructurado en español.
Devuelve UNICAMENTE un objeto JSON (sin markdown, sin ```) con los siguientes campos.
Si un campo no esta disponible en el texto, OMITELO del JSON (no pongas null ni vacio).

{{
  "cargo": "Titulo exacto del cargo",
  "empresa": "Nombre de la empresa",
  "salario": "Rango salarial si aparece, ej: $6.000.000 + $2.000.000 variable",
  "contrato": "Tipo de contrato, ej: Termino fijo, Obra o labor, Indefinido",
  "modalidad": "Presencial / Remoto / Hibrido",
  "jornada": "Tiempo completo, Medio tiempo, horarios si los hay",
  "ubicacion": "Ciudad, departamento, direccion si aparece",
  "educacion": "Nivel educativo minimo requerido",
  "experiencia": "Anos de experiencia requeridos + area",
  "fecha": "Fecha de publicacion o actualizacion si aparece",
  "keywords": "Palabras clave separadas por coma",
  "description": "Resumen breve y claro del cargo en 2-3 oraciones. Que hace la persona en este rol.",
  "requirements": "Requisitos clave del perfil: formacion, tecnologias, conocimientos. Formato de lista con viñetas.",
  "responsibilities": "Principales responsabilidades y funciones del cargo. Formato de lista con viñetas.",
  "benefits": "Beneficios, compensacion variable, prestaciones si se mencionan."
}}

Se directo y conciso. No inventes datos que no esten en el texto. Solo JSON."""
    
    print(f"[PROMPT IA] {prompt}")

    for model_name in GEMINI_MODELS:
        for idx, api_key in enumerate(GEMINI_API_KEYS):
            try:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt, 
                    config=types.GenerateContentConfig(temperature=0.2)
                )
                if response and response.text:
                    raw = response.text.strip()
                    print(f"[RESPUESTA IA] {raw}")
                    # Intentar parsear JSON
                    if raw.startswith("```"):
                        lines = raw.split("\n")
                        first = 1 if lines[0].strip().startswith("```") else 0
                        last = len(lines) - 1
                        if lines[last].strip() == "```":
                            last -= 1
                        raw = "\n".join(lines[first:last+1]).strip()
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        # Intentar extraer JSON embebido
                        match = re.search(r'\{.*\}', raw, re.DOTALL)
                        if match:
                            try:
                                parsed = json.loads(match.group(0))
                                if isinstance(parsed, dict):
                                    return parsed
                            except json.JSONDecodeError:
                                pass
                    # Si no se pudo parsear como JSON, usar texto crudo
                    return {"description": raw}
            except Exception:
                continue
    return {"description": "No se pudo generar el resumen (la IA fallo)."}


def answer_question(
    question: str,
    job_title: str = "",
    company: str = "",
    job_description: str = "",
    job_url: str = "",
) -> tuple[str, str]:
    """
    Wrapper para una sola pregunta (compatibilidad con código legacy).
    Devuelve (respuesta_texto, modelo_usado).
    """
    batch_ans, model, _ = answer_questions_batch(
        [question], job_title, company, job_description, job_url
    )
    return batch_ans.get(question, ""), model


def answer_questions_batch(
    questions: list[str],
    job_title: str = "",
    company: str = "",
    job_description: str = "",
    job_url: str = "",
) -> tuple[dict[str, dict], str, list[str]]:
    """
    Genera respuestas a múltiples preguntas en una sola llamada al LLM.

    Devuelve:
      - answers_dict: {pregunta_original: {"respuesta": ..., "tipo": ..., "confianza": ...}}
      - model_used: nombre del modelo que respondió (o "plantilla" / "none")
      - skipped: lista de preguntas vacías que se saltaron

    La estructura enriquecida permite al reporte HTML mostrar más contexto
    y al modo semi-auto mostrar advertencias de confianza baja.
    """
    if not questions:
        return {}, "none", []

    prompt_result = _build_prompt_batch(
        questions, job_title, company, job_description, job_url
    )
    if not prompt_result:
        return {}, "none", []

    prompt, valid_questions, skipped = prompt_result

    if GEMINI_AVAILABLE and GEMINI_API_KEYS:
        result_dict, model_used = _answer_with_gemini_batch(
            prompt, valid_questions, job_title, company
        )
        if result_dict:
            # Marca las preguntas saltadas en el resultado
            for q in skipped:
                result_dict[q] = {
                    "respuesta": "",
                    "tipo": "pregunta_vacia",
                    "confianza": "baja",
                    "_nota": "Pregunta vacía detectada — saltada automáticamente",
                }
            return result_dict, model_used, skipped

    # Fallback: plantillas por pregunta
    fallback_answers = {}
    for q in valid_questions:
        ans, _ = _answer_with_templates(q)
        fallback_answers[q] = {
            "respuesta": ans,
            "tipo": "plantilla",
            "confianza": "media",
        }
    for q in skipped:
        fallback_answers[q] = {
            "respuesta": "",
            "tipo": "pregunta_vacia",
            "confianza": "baja",
            "_nota": "Pregunta vacía detectada — saltada automáticamente",
        }
    return fallback_answers, "plantilla", skipped


# ══════════════════════════════════════════════════════════════
#  GEMINI INTERNAL
# ══════════════════════════════════════════════════════════════

def _parse_json_response(text: str, valid_questions: list[str] = None) -> list[dict] | dict | None:
    """
    Extrae las respuestas del JSON devuelto por el LLM.
    
    Soporta DOS formatos:
      1. NUEVO: {"respuestas": [{"pregunta": ..., "respuesta": ..., "tipo": ..., "confianza": ...}, ...]}
      2. LEGACY: {"pregunta1": "respuesta1", "pregunta2": "respuesta2", ...}
    
    Devuelve:
      - list[dict] si encontró formato nuevo (array de respuestas)
      - dict si encontró formato legacy (flat key-value)
      - None si el parsing falla completamente
    """
    text = text.strip()

    # Quita bloque markdown si existe
    if text.startswith("```"):
        # Simply strip the opening and closing ``` lines
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        first = 0
        last = len(lines) - 1
        if lines[first].strip().startswith("```"):
            first += 1
        if last > first and lines[last].strip() == "```":
            last -= 1
        text = "\n".join(lines[first:last+1]).strip()

    def _try_parse(raw: str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                # Formato nuevo: tiene clave "respuestas" con array
                if "respuestas" in parsed and isinstance(parsed["respuestas"], list):
                    return parsed["respuestas"]
                # Formato legacy: flat dict {pregunta: respuesta}
                # Verificar que las claves parecen preguntas (no metadata keys)
                if all(isinstance(v, str) for v in parsed.values()):
                    return parsed  # devuelve el dict plano
            return None
        except json.JSONDecodeError:
            return None

    result = _try_parse(text)
    if result is not None:
        return result

    # Intenta extraer JSON embebido en texto libre
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        result = _try_parse(match.group(0))
        if result is not None:
            return result

    return None


def _answer_with_gemini_batch(
    prompt: str,
    valid_questions: list[str],
    job_title: str,
    company: str,
) -> tuple[dict[str, dict], str]:
    """
    Intenta todas las combinaciones (modelo × api_key) hasta obtener JSON válido.
    Devuelve (answers_dict, model_name_used).
    """
    print(f"[PROMPT PREGUNTAS IA] {prompt}")

    for model_name in GEMINI_MODELS:
        for idx, api_key in enumerate(GEMINI_API_KEYS):
            try:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.35,
                        max_output_tokens=2000,
                    ),
                )
                text = response.text.strip()
                if not text:
                    continue

                # Debug: log respuesta completa
                print(f"[RESPUESTA PREGUNTAS IA] {text}")

                parsed = _parse_json_response(text, valid_questions)
                if parsed is None:
                    print(f"  [AI] [WARN] {model_name} (key #{idx+1}): respuesta no es JSON valido. Reintentando...")
                    continue

                # ── Post-validation: build set of normalized valid questions ──
                valid_norm = {}
                for vq in valid_questions:
                    # Normalize: lowercase, strip, remove leading question marks
                    norm = vq.lower().strip().lstrip("?").rstrip("?").strip()
                    valid_norm[norm] = vq

                def _match_question(pregunta_ai: str) -> str | None:
                    """Match AI-returned pregunta to a valid question. Returns the original valid_question or None."""
                    norm_ai = pregunta_ai.lower().strip().lstrip("?").rstrip("?").strip()
                    # Exact match
                    if norm_ai in valid_norm:
                        return valid_norm[norm_ai]
                    # Substring match (AI might add/remove question marks or small diffs)
                    for norm_vq, orig_vq in valid_norm.items():
                        if norm_ai in norm_vq or norm_vq in norm_ai:
                            return orig_vq
                    return None

                # Formato NUEVO: lista de dicts con pregunta/respuesta/tipo/confianza
                if isinstance(parsed, list):
                    result = {}
                    discarded = 0
                    for item in parsed:
                        pregunta = item.get("pregunta", "").strip()
                        if not pregunta:
                            continue
                        matched = _match_question(pregunta)
                        if matched is None:
                            print(f"  [AI] [WARN] Descartada pregunta inventada: {pregunta[:80]}")
                            discarded += 1
                            continue
                        result[matched] = {
                            "respuesta":  item.get("respuesta", ""),
                            "tipo":       item.get("tipo", "narrativa"),
                            "confianza":  item.get("confianza", "media"),
                        }
                    if discarded:
                        print(f"  [AI] [WARN] {discarded} preguntas inventadas descartadas de {len(parsed)} totales")
                    if result:
                        print(f"  [AI] [OK] {len(result)} respuestas validas (formato nuevo) con {model_name} (key #{idx+1})")
                        return result, model_name

                # Formato LEGACY: flat dict {pregunta: respuesta_texto}
                elif isinstance(parsed, dict):
                    result = {}
                    for q_text, answer_text in parsed.items():
                        matched = _match_question(q_text)
                        if matched is None:
                            print(f"  [AI] [WARN] Descartada pregunta inventada: {q_text[:80]}")
                            continue
                        result[matched] = {
                            "respuesta":  str(answer_text),
                            "tipo":       "narrativa",
                            "confianza":  "media",
                        }
                    if result:
                        print(f"  [AI] [OK] {len(result)} respuestas validas (formato legacy) con {model_name} (key #{idx+1})")
                        return result, model_name

            except Exception as e:
                err = str(e)
                if any(x in err for x in ["403", "429", "quota", "RESOURCE_EXHAUSTED", "leaked"]):
                    # Retry with exponential backoff for rate limits
                    import time as _time
                    for attempt in range(3):
                        wait = 2 ** attempt  # 1s, 2s, 4s
                        print(f"  [AI] Rate limit ({model_name}, key #{idx+1}). Reintentando en {wait}s... (intento {attempt+1}/3)")
                        _time.sleep(wait)
                        try:
                            client = genai.Client(api_key=api_key)
                            response = client.models.generate_content(
                                model=model_name,
                                contents=prompt,
                                config=config,
                            )
                            text = response.text.strip()
                            if text:
                                parsed = _parse_json_response(text, valid_questions)
                                if parsed is not None:
                                    if isinstance(parsed, list):
                                        result = {}
                                        for item in parsed:
                                            pregunta = item.get("pregunta", "").strip()
                                            if pregunta:
                                                result[pregunta] = {
                                                    "respuesta": item.get("respuesta", ""),
                                                    "tipo": item.get("tipo", "narrativa"),
                                                    "confianza": item.get("confianza", "media"),
                                                }
                                        if result:
                                            print(f"  [AI] [OK] Retry exitoso: {len(result)} respuestas con {model_name}")
                                            return result, model_name
                                    elif isinstance(parsed, dict):
                                        result = {}
                                        for q_text, answer_text in parsed.items():
                                            result[q_text] = {
                                                "respuesta": str(answer_text),
                                                "tipo": "narrativa",
                                                "confianza": "media",
                                            }
                                        if result:
                                            return result, model_name
                        except Exception:
                            continue
                    continue  # All retries failed, try next key
                elif any(x in err.lower() for x in ["not found", "not supported"]):
                    print(f"  [AI] [X] Modelo {model_name} no disponible. Probando siguiente...")
                    break
                else:
                    print(f"  [AI] [X] Error inesperado ({model_name}, key #{idx+1}): {e}")
                    continue

    print("  [AI] [X] Todas las combinaciones (modelo x key) fallaron. Usando plantillas.")
    return {}, ""


# ══════════════════════════════════════════════════════════════
#  TEMPLATE FALLBACK
# ══════════════════════════════════════════════════════════════

def _answer_with_templates(question: str) -> tuple[str, str]:
    """
    Respuestas basadas en reglas para patrones de preguntas comunes.
    Devuelve (respuesta_texto, 'plantilla').
    Siempre usa datos duros literales para campos de contacto/ubicación.
    """
    q = question.lower()
    cv = _load_cv()
    p = cv.get("informacion_personal", {})

    # ── Datos duros (literales, nunca modificar) ──────────────
    if any(w in q for w in ["teléfono", "telefono", "celular", "whatsapp", "número de contacto", "numero de contacto"]):
        return CANDIDATE_HARD_DATA["telefono"], "plantilla"

    if any(w in q for w in ["dirección", "direccion", "residencia", "domicilio", "dónde vives", "donde vives"]):
        return CANDIDATE_HARD_DATA["direccion"], "plantilla"

    if any(w in q for w in ["localidad", "barrio"]):
        return CANDIDATE_HARD_DATA["localidad"], "plantilla"

    if any(w in q for w in ["ciudad", "municipio"]) and "experiencia" not in q:
        return CANDIDATE_HARD_DATA["ciudad"], "plantilla"

    if any(w in q for w in ["nombre", "apellido", "cómo te llamas"]):
        return p.get("nombre", "César Javier Ramírez Hormaza"), "plantilla"

    if any(w in q for w in ["correo", "email", "mail"]):
        return p.get("email", ""), "plantilla"

    # ── Datos de CV ───────────────────────────────────────────
    if any(w in q for w in ["salario", "sueldo", "pretensiones", "remuner", "aspira", "económ"]):
        return (
            "Mis pretensiones salariales están entre 2.5 y 3.5 millones de pesos, "
            "negociables según las responsabilidades del cargo y las condiciones de la empresa."
        ), "plantilla"

    if any(w in q for w in ["disponibilidad", "cuándo", "iniciar", "empezar", "incorporar"]):
        return "Disponibilidad inmediata.", "plantilla"

    if any(w in q for w in ["scada", "hmi", "plc", "siemens", "wincc", "step 7", "tia portal"]):
        return (
            "Sí, tengo experiencia con automatización industrial. En mi tesis de grado diseñé "
            "e implementé un sistema automatizado con PLC Siemens S7-1200, obteniendo calificación "
            "de 5.0. He trabajado con interfaces HMI para supervisión y control de procesos."
        ), "plantilla"

    if any(w in q for w in ["experiencia", "trayectoria", "años de"]):
        return (
            "Tengo experiencia en automatización industrial (PLC Siemens S7-1200, reducción del 25% "
            "en tiempos de ciclo), asesoría de más de 25 proyectos internacionales de robótica y visión "
            "artificial en Colombia, México, Argentina y España, y soy creador del Robot Tatuador 360."
        ), "plantilla"

    if any(w in q for w in ["habilidades", "conocimientos", "dominas", "maneja", "skills"]):
        return (
            "Python, C++, OpenCV, YOLO, PLC Siemens S7-1200, ROS, SolidWorks y desarrollo de interfaces "
            "web para control de procesos. En habilidades blandas: liderazgo técnico y comunicación efectiva."
        ), "plantilla"

    if any(w in q for w in ["por qué", "motivaci", "interés", "quieres trabajar"]):
        return (
            "Me motiva esta oportunidad para aplicar mis competencias en automatización y visión artificial "
            "en un entorno de impacto real. Mi experiencia con PLC Siemens, ROS, OpenCV y Python, "
            "junto a la asesoría de proyectos en 4 países, me posiciona para aportar valor desde el primer día."
        ), "plantilla"

    # ── Fallback genérico ─────────────────────────────────────
    return (
        "Como Ingeniero Mecatrónico con enfoque en automatización industrial y visión artificial, "
        "puedo aportar solidez técnica y resultados medibles desde el inicio. "
        "Disponibilidad inmediata."
    ), "plantilla"
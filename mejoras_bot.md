# 🗺️ Guía de Mejoras — Computrabajo Bot

Documento técnico y funcional para implementar los nuevos modos y mejoras discutidas.

---

## 1. Cambios en `ai_responder.py` (ya aplicados)

### Qué cambió y por qué

| Problema anterior                      | Solución implementada                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Teléfono/dirección a veces fallaban  | `CANDIDATE_HARD_DATA` como fuente de verdad separada del CV                  |
| La pregunta no aparecía en el reporte | El nuevo JSON incluye `"pregunta"` explícita en cada item                   |
| Preguntas vacías causaban errores     | Se filtran antes del prompt; se marcan como `pregunta_vacia` en el resultado |
| Sin contexto de la oferta              | Se agrega `job_description` y `job_url` al prompt                          |
| Sin jerarquía de veracidad            | Reglas NIVEL 1 / NIVEL 2 / NIVEL 3 explícitas en el prompt                    |
| JSON keyed por pregunta era frágil    | Nuevo schema con array `respuestas` + campos `tipo` y `confianza`        |
| Logs ruidosos mezclados                | Prefijos `✓`, `⚠`, `✗` para filtrar fácilmente                       |

### Nuevo schema de respuesta del LLM

```json
{
  "respuestas": [
    {
      "pregunta":   "¿Cuál es tu número de celular?",
      "respuesta":  "3219121216",
      "tipo":       "dato_duro",
      "confianza":  "alta"
    },
    {
      "pregunta":   "¿Por qué quieres trabajar con nosotros?",
      "respuesta":  "Me interesa esta oportunidad porque...",
      "tipo":       "narrativa",
      "confianza":  "alta"
    },
    {
      "pregunta":   "¿Tienes certificación ISO 9001?",
      "respuesta":  "DATO_FALTANTE",
      "tipo":       "dato_faltante",
      "confianza":  "baja"
    }
  ]
}
```

**Tipos posibles:**

- `dato_duro` → teléfono, email, dirección: siempre literal
- `cv_real` → experiencia, logros, tecnologías del CV
- `narrativa` → motivación, por qué esta empresa
- `dato_faltante` → LLM no tiene info suficiente → **debes revisar manualmente**
- `pregunta_vacia` → pregunta sin texto detectada en el formulario

---

## 2. Los 3 Modos de Ejecución

### Modo `apply` (normal)

```bash
python -m bot.bot
# o explícitamente:
python -m bot.bot --mode apply
```

Comportamiento actual: llena y envía automáticamente.

---

### Modo `dry-run-llm` (prueba del LLM)

```bash
python -m bot.bot --mode dry-run-llm
```

**Qué hace:**

1. Navega a la oferta normalmente
2. Detecta preguntas del formulario
3. Llama al LLM con todo el contexto
4. Guarda en el reporte: pregunta, respuesta, tipo, confianza, enlace de la oferta
5. **NO toca el formulario. NO aplica.**

**Para qué sirve:** ver si el LLM está respondiendo con coherencia antes de usarlo en real.
**No afecta** la base de datos `applications.db` (la oferta no se marca como aplicada).

**Cambio en `bot.py`:**

```python
# En la función que llama a apply():
if mode == "dry-run-llm":
    job_tracker.save_dry_run(job_url, job_title, company, answers_dict)
    continue  # no llama a browser.apply()
```

---

### Modo `semi-auto` (revisión humana)

```bash
python -m bot.bot --mode semi-auto
```

**Qué hace:**

1. Llena el formulario con las respuestas del LLM
2. **Pausa antes de enviar** y muestra cada respuesta en terminal
3. Permite editar, mejorar con LLM, o aprobar
4. Solo envía cuando el usuario confirma

**Flujo en terminal:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Oferta: Ingeniero de Automatización — TecnoGroup S.A.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/3] ¿Por qué quieres trabajar con nosotros?
      Tipo: narrativa | Confianza: alta
      Respuesta actual:
      "Me motiva esta oportunidad para aplicar mis competencias en automatización..."

      [Enter] Aprobar  [e] Editar  [m] Mejorar con IA  [s] Saltar pregunta
```

**Opción `m` — Mejorar con IA:**

- Muestra la respuesta actual
- Pide al usuario instrucción: `"hazla más corta"`, `"enfócala en Python"`, `"tono más formal"`
- Llama al LLM con: respuesta actual + instrucción + contexto de la oferta
- Muestra versión mejorada para aprobar o rechazar

**Implementación sugerida en `semi_auto.py`:**

```python
def refine_answer(current_answer: str, instruction: str, job_context: dict) -> str:
    prompt = f"""
Tienes esta respuesta para una postulación laboral:
"{current_answer}"

El candidato quiere mejorarla con la siguiente instrucción:
"{instruction}"

Contexto de la oferta: {job_context['title']} en {job_context['company']}

Devuelve SOLO la respuesta mejorada, sin explicaciones.
"""
    # llamada al LLM...
```

---

## 3. Sistema de CVs con Resúmenes

### Estructura sugerida en `config.py`

```python
CV_PROFILES = {
    "general": {
        "archivo": "CV_ATS_César_General.docx",
        "descripcion": "CV general para la mayoría de vacantes en Colombia",
        "ideal_para": ["administración", "coordinación", "gestión de proyectos"],
        "idioma": "es",
    },
    "tecnico": {
        "archivo": "CV_ATS_César_Técnico.docx",
        "descripcion": "CV técnico enfocado en stack de desarrollo y automatización",
        "ideal_para": ["python", "automatización", "robótica", "visión artificial", "plc"],
        "idioma": "es",
    },
    "ingles": {
        "archivo": "CV_ATS_César_English.docx",
        "descripcion": "CV en inglés para multinacionales o vacantes que lo requieran",
        "ideal_para": ["multinacional", "remoto internacional", "empresa extranjera"],
        "idioma": "en",
    },
}
```

### Selección automática de CV

```python
def select_cv(job_title: str, job_description: str, company: str) -> str:
    """
    El LLM decide qué CV usar basado en el contexto de la oferta.
    Devuelve la clave del perfil ('general', 'tecnico', 'ingles').
    """
    prompt = f"""
Dado este perfil de CVs disponibles:
{json.dumps(CV_PROFILES, ensure_ascii=False, indent=2)}

Y esta oferta laboral:
- Cargo: {job_title}
- Empresa: {company}
- Descripción: {job_description[:500]}

¿Cuál CV usar? Responde SOLO con la clave: general, tecnico, o ingles.
"""
    # llamada rápida al LLM flash...
```

### ¿Agregar CV en inglés?

**Sí, recomendado.** Señales que debería detectar el bot para sugerirlo:

- El anuncio está en inglés
- La empresa tiene nombre en inglés o es multinacional conocida
- La descripción menciona "bilingual", "English required", "B2+"

---

## 4. Mejoras al Reporte HTML

### Qué agregar al reporte actual

**Por oferta:**

- Enlace clicable a la vacante (para revisión manual si falló)
- Tabla de preguntas con columnas: Pregunta | Respuesta | Tipo | Confianza
- Badge de color por confianza: 🟢 alta | 🟡 media | 🔴 baja / dato_faltante
- Sección "Advertencias" si hay `dato_faltante` o `pregunta_vacia`

**Por sesión:**

- Modo usado (`apply` / `dry-run-llm` / `semi-auto`)
- CV seleccionado por oferta
- Score de compatibilidad (ver sección 5)

**En errores:**

- Mensaje de error completo (no solo "Fallo al enviar")
- Tipo de error: `timeout` | `no_button` | `captcha` | `login_failed` | `llm_failed`
- Screenshot si Playwright captura uno

---

## 5. Mejoras Adicionales Recomendadas

### 5.1 Scoring de vacante (antes de aplicar)

```python
def score_job(job_title: str, job_description: str) -> dict:
    """
    El LLM puntúa la vacante del 1 al 10 y da razones.
    Útil en modo semi-auto para priorizar cuáles revisar primero.
    """
    # Devuelve: {"score": 8, "razon": "Requiere Python y PLC, ajuste alto", "alerta": None}
    # O:        {"score": 4, "razon": "Requiere 5 años experiencia", "alerta": "Requisito difícil de cumplir"}
```

En modo `semi-auto`, si el score es < 5, pregunta: `"Score bajo (4/10): ¿Aplicar de todas formas? [s/N]"`

### 5.2 Detección de preguntas trampa

Preguntas que pueden perjudicarte si no se manejan bien:

- "¿Cuánto ganas actualmente?" → el bot debe flaggear y sugerir respuesta estratégica
- "¿Tienes vehículo propio?" → puede descalificarte si dices no
- "¿Estarías dispuesto a reubicarte?" → pregunta al candidato en modo semi-auto

### 5.3 Historial enriquecido en `applications.db`

Agregar columnas:

- `cv_used` → qué CV se adjuntó
- `mode` → apply / dry-run-llm / semi-auto
- `score` → puntuación de compatibilidad
- `has_dato_faltante` → boolean, para filtrar en reportes
- `job_description` → descripción completa guardada

### 5.4 Comando `--review`

```bash
python -m bot.bot --review
```

Abre una vista HTML interactiva de las últimas aplicaciones donde puedes:

- Ver el reporte completo de cada una
- Marcar como "interesante" o "descartar"
- Abrir el enlace de la oferta directamente

---

## 6. Sobre la base de conocimiento del LLM

### Pregunta: ¿base de datos de respuestas frecuentes?

**Recomendación:** no hace falta una base de datos separada si `cv_data.json` está bien estructurado.

Lo que sí conviene agregar a `cv_data.json`:

```json
"datos_contacto_duros": {
  "telefono":   "3XXXXXXXXX",
  "direccion":  "La Candelaria, Bogotá D.C., Colombia",
  "localidad":  "La Candelaria",
  "barrio":     "La Candelaria",
  "ciudad":     "Bogotá D.C.",
  "pais":       "Colombia"
},
"respuestas_frecuentes": {
  "salario": "Entre 2.5 y 3.5 millones, negociable",
  "disponibilidad": "Inmediata",
  "vehiculo": "No tengo vehículo propio, pero cuento con excelente acceso a transporte público",
  "reubicacion": "Estoy abierto a discutirlo según las condiciones del cargo"
}
```

Esto hace que el prompt incluya respuestas pre-aprobadas para preguntas sensibles, sin depender 100% de la creatividad del LLM.

---

## 7. Resumen de Comandos CLI (estado objetivo)

```
python -m bot.bot                          → modo apply normal
python -m bot.bot --mode dry-run-llm       → prueba LLM sin aplicar
python -m bot.bot --mode semi-auto         → revisión humana antes de enviar
python -m bot.bot --max 5                  → limita a 5 aplicaciones
python -m bot.bot --keyword "mecatrónica"  → keyword específica esta sesión
python -m bot.bot --report                 → genera reporte sin ejecutar bot
python -m bot.bot --review                 → vista interactiva del historial
python -m bot.bot --summary                → resumen rápido en terminal
python -m bot.bot --cv tecnico             → fuerza uso de CV técnico
```

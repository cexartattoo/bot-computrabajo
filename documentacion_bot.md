# Documentación del Bot Computrabajo (César v3.0)

Este bot automatiza el proceso de búsqueda y aplicación a ofertas laborales en Computrabajo utilizando **Playwright** para la navegación y **Modelos de Lenguaje (LLM)** como Gemini/Gemma para responder preguntas obligatorias de las empresas.

---

## 🚀 Flujo de Trabajo (Workflow)

1. **Arranque**: El bot carga las credenciales desde `.env` e inicializa la base de datos SQLite (`applications.db`).
2. **Búsqueda**: Navega a Computrabajo, inicia sesión y realiza búsquedas basadas en las `KEYWORDS` definidas en `config.py`.
3. **Filtrado**: Revisa cada oferta y omite aquellas a las que ya se aplicó anteriormente (validación por URL).
4. **Análisis de Preguntas**:
   - Si la oferta tiene preguntas, las extrae y las envía a la IA en un solo lote para ahorrar tiempo.
   - El prompt de la IA incluye el contenido de tu **CV** y el **Conocimiento Persistente** acumulado.
5. **Interacción Dinámica**:
   - Si la IA detecta que falta un dato (ej. "fecha de expedición de cédula"), el bot **pausa la ejecución y te pregunta en la terminal**.
   - Tu respuesta se guarda permanentemente para no volver a preguntarte.
6. **Aplicación**: Completa los formularios, selecciona el CV correspondiente y realiza la aplicación (o simula en modo dry-run).
7. **Reporte**: Al finalizar (o si se detiene manualmente), genera un informe HTML interactivo con el resumen de la sesión.

---

## 📂 Estructura de Archivos

- **`bot/bot.py`**: El orquestador principal. Maneja los argumentos de la línea de comandos (CLI).
- **`bot/browser.py`**: Motor de automatización. Maneja clics, navegación y el llenado de formularios.
- **`bot/ai_responder.py`**: El "cerebro" IA. Gestiona la lógica de los prompts, los modelos Gemini y el parsing de respuestas.
- **`bot/job_tracker.py`**: Gestiona la base de datos `applications.db` y crea los reportes HTML.
- **`bot/config.py`**: Configuración central (keywords, tiempos de espera, rutas de CVs).
- **`bot/persistent_knowledge.py`**: Módulo para leer/guardar datos aprendidos del usuario.
- **`bot/test_models.py`**: Herramienta de diagnóstico para validar qué modelos de IA están activos.
- **`.env`**: Archivo crítico donde guardas tus contraseñas y API Keys (no compartir).

---

## 🛠 Opciones de Ejecución (Comandos)

Desde la carpeta raíz del proyecto, usa:

```bash
# Modo normal (aplica a todo)
python -m bot.bot

# Modo Prueba (evalúa preguntas pero NO envía la aplicación)
python -m bot.bot --mode dry-run-llm

# Modo Semi-Automático (te pide confirmación antes de cada envío)
python -m bot.bot --mode semi-auto

# Limitar aplicaciones (ej: aplicar solo a 5)
python -m bot.bot --max 5

# Usar un CV específico
python -m bot.bot --cv tecnico
```

---

## 🔑 Configuración (`.env`)

Variables necesarias para el funcionamiento:

- `CT_EMAIL`: Tu correo de Computrabajo.
- `CT_PASSWORD`: Tu contraseña de Computrabajo.
- `CV_PATH`: Ruta absoluta al archivo `.docx` de tu CV principal.
- `GEMINI_API_KEY`: Tu llave de Google AI Studio (puedes añadir `_2`, `_3`, etc. para rotación).

---

## ✨ Características Especiales

- **Resiliencia**: Si una API Key falla o llega a su límite, el bot cambia automáticamente a la siguiente disponible.
- **Reportes Inteligentes**: Informes HTML con menús desplegables, badges de "Reciente" y marcas de tiempo exactas.
- **Base de Datos**: Todo queda registrado en `applications.db` para evitar duplicados, incluso entre diferentes sesiones.
- **Conocimiento Persistente**: "Aprende" de tus respuestas manuales para volverse 100% autónomo con el tiempo.

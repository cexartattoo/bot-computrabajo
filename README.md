# 🤖 Computrabajo Job Bot + CV Generator

## Estructura del Proyecto
```
computrabajo/
├── cv_data.json              # 📋 Tu CV completo (fuente de verdad)
├── generate_docx.py          # 📝 Genera los 2 DOCX
├── CV_Visual_César.docx      # 👀 Para enviar a reclutadores humanos
├── CV_ATS_César.docx         # 🤖 Para subir a Computrabajo/LinkedIn
├── requirements.txt          # 📦 Dependencias
├── .env.example              # 🔑 Template de credenciales (renombrar a .env)
└── bot/
    ├── bot.py                # 🚀 Punto de entrada principal
    ├── browser.py            # 🌐 Automatización Playwright
    ├── ai_responder.py       # 🧠 Respuestas con Gemini AI
    ├── job_tracker.py        # 💾 Base de datos SQLite
    └── config.py             # ⚙️  Configuración y keywords
```

## Instalación (1 vez)

```powershell
cd c:\Users\ramir\Desktop\computrabajo

# Instalar dependencias
pip install -r requirements.txt

# Instalar navegador para Playwright
playwright install chromium
```

## Configuración (1 vez)

1. Copia `.env.example` → `.env`
2. Edita `.env` con tus datos:
```
CT_EMAIL=tucorreo@gmail.com
CT_PASSWORD=tucontraseña
GEMINI_API_KEY=tu_key_de_aistudio.google.com
```

## Uso

### Generar/Actualizar los DOCX
```powershell
python generate_docx.py
# Genera: CV_ATS_César.docx  y  CV_Visual_César.docx
```

### Probar el bot (sin aplicar realmente)
```powershell
python -m bot.bot --dry-run
```

### Correr el bot (aplica realmente)
```powershell
python -m bot.bot
```

### Buscar solo una keyword específica
```powershell
python -m bot.bot --keyword "ingeniero automatizacion" --max 5
```

### Ver historial de aplicaciones
```powershell
python -m bot.bot --summary
```

## Cómo funciona el bot

1. **Login** automático a Computrabajo
2. **Búsqueda** por keywords de tu perfil + ubicación
3. **Filtro** de ofertas ya aplicadas (no aplica dos veces al mismo trabajo)
4. **Aplicación** automática con:
   - Adjunto del CV (`CV_ATS_César.docx`)
   - Respuestas IA a preguntas del formulario (via Gemini)
5. **Registro** en `applications.db` de cada intento

## Notas importantes

- El bot incluye delays aleatorios para evitar detección
- Límite por defecto: 10 aplicaciones por sesión (editar en `config.py`)
- Las respuestas de Gemini funcionan sin API key (usa plantillas predefinidas)
- Tu `.env` nunca debe subirse a GitHub — ya está en `.gitignore`

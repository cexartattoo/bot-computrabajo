# Prompt Completo — Dashboard Web para César Bot v3.0

> Usa este prompt con Claude Projects, Cursor, o cualquier LLM con contexto largo.
> Sube también tus archivos del bot como contexto adicional antes de enviarlo.

---

## PARTE 1 — Estructura base del dashboard

Eres un desarrollador fullstack experto en Python, React y Node.js/Express.

Tengo un bot llamado "César v3.0" que automatiza la búsqueda y aplicación
a empleos en Computrabajo usando Playwright y LLMs (Gemini). Aquí está su
documentación completa:

---

[documentacion_bot.md]
----------------------

Necesito que me ayudes a construir un DASHBOARD WEB para controlarlo
remotamente desde el celular o cualquier navegador. El sistema debe correr
completamente en mi PC local pero estar expuesto de forma segura a internet.

## Stack requerido:

- Backend: Python (FastAPI, para integrarse nativamente con el bot en Python)
- Frontend: React + Tailwind CSS (Single Page App)
- Autenticación: Google OAuth2 (solo mi cuenta puede entrar)
- Túnel: Compatible con Cloudflare Tunnel (se expone en un dominio propio)
- Notificaciones: Telegram Bot (me avisa cuando termina una sesión, errores, etc.)
- Base de datos: la misma SQLite existente (applications.db)

## Funcionalidades del dashboard:

### Panel de Control (Home)

- Botón INICIAR BOT con selector de modo: normal / dry-run-llm / semi-auto
- Campo para definir --max (límite de aplicaciones)
- Selector de CV a usar (lista los disponibles desde config.py)
- Botón DETENER el bot (mata el proceso de forma segura)
- Indicador de estado en tiempo real: IDLE / RUNNING / PAUSED / ERROR
- Barra de progreso con "X aplicaciones enviadas esta sesión"

### Modo Semi-Auto vía Web

- Cuando el bot está en modo semi-auto y necesita confirmación, en vez de
  pausar en la terminal, debe enviar la oferta al dashboard para que yo
  apruebe o rechace desde el celular.
- Mostrar: nombre del cargo, empresa, preguntas detectadas y respuestas
  generadas por la IA.
- Botones: ✅ APROBAR / ❌ RECHAZAR

### Conocimiento Persistente

- Listar todos los pares clave/valor guardados en persistent_knowledge
- Permitir editar, agregar y eliminar entradas desde la interfaz
- Sin tener que editar archivos manualmente

### Historial y Reportes

- Tabla con todas las aplicaciones de applications.db
- Filtros por fecha, estado, empresa
- Botón para abrir el reporte HTML generado por job_tracker.py
- Estadísticas rápidas: total aplicaciones, tasa de éxito, aplicaciones hoy

### Configuración

- Editor de KEYWORDS (agregar/quitar palabras clave de búsqueda)
- Estado de las API Keys de Gemini (cuáles están activas/agotadas)
- Toggle para activar/desactivar notificaciones de Telegram
- Gestión de CVs disponibles (ver cuáles están configurados)

### Notificaciones (Telegram)

Enviar mensaje a mi Telegram cuando:

- El bot termina una sesión (con resumen: X aplicaciones enviadas)
- Ocurre un error crítico
- El bot entra en modo PAUSED esperando confirmación (semi-auto)
- Una API Key de Gemini se agota
- El bot se desconecta o cae inesperadamente

## Arquitectura esperada:

```
bot/ (código existente, NO modificar lógica interna)
dashboard/
  api/
    main.py         ← FastAPI, punto de entrada
    routes/
      bot.py        ← endpoints para start/stop/status
      history.py    ← endpoints para applications.db
      knowledge.py  ← endpoints para persistent_knowledge
      config.py     ← endpoints para keywords y settings
    services/
      bot_runner.py ← lanza bot.py como subprocess, captura stdout
      notifier.py   ← lógica de Telegram
      auth.py       ← Google OAuth2
  frontend/
    src/
      App.jsx
      pages/
        Dashboard.jsx
        SemiAuto.jsx
        Knowledge.jsx
        History.jsx
        Settings.jsx
      components/
        StatusBadge.jsx
        BotControls.jsx
        NotificationToast.jsx
```

## Requisitos técnicos importantes:

1. El bot se lanza como un SUBPROCESS desde FastAPI, capturando stdout/stderr
   en tiempo real mediante WebSockets para mostrar logs en vivo en el dashboard.
2. El modo semi-auto debe usar un mecanismo de cola (asyncio.Queue o similar)
   donde el bot se pausa esperando respuesta del endpoint /api/bot/confirm.
3. La autenticación con Google debe proteger TODAS las rutas del frontend y
   del backend. Sin login = sin acceso.
4. Agregar un archivo README_DASHBOARD.md explicando cómo configurar
   Cloudflare Tunnel y Google OAuth para exponer el dashboard.
5. El frontend debe ser responsive (funcionar bien en móvil).
6. Incluir un script start.sh que levante tanto el backend FastAPI como
   el frontend React con un solo comando.

---

## PARTE 2 — Editores JSON, base de datos, credenciales y seguridad avanzada

### 1. Editor de cv_data.json y persistent_knowledge.json

Ambos archivos son la "memoria" del bot. El flujo es:

1. El bot lee cv_data.json (datos estructurados del CV del usuario)
2. El bot lee persistent_knowledge.json (datos aprendidos en sesiones
   anteriores: ej. {"fecha_expedicion_cedula": "15/03/2018"})
3. Combina ambos en un "Resumen de Contexto" que le pasa a Gemini
4. Gemini responde las preguntas de las empresas como si fuera el usuario

Por eso es crítico que el usuario pueda ver y editar estos archivos fácilmente.

Crear una sección "Mi Perfil / Datos del Bot" con DOS editores:

#### Editor cv_data.json

- Mostrar el JSON completo, indentado y con syntax highlighting
- Usar la librería Monaco Editor (el mismo editor de VS Code) embebido en React
- Botón GUARDAR con validación: si el JSON es inválido, mostrar error y NO guardar
- Botón FORMATEAR (pretty-print automático)
- Botón RESTABLECER (vuelve al último guardado sin cambios)
- Al guardar, hacer backup automático en cv_data.backup.json con timestamp

#### Editor persistent_knowledge.json

- Mismo Monaco Editor con syntax highlighting
- ADEMÁS de la vista código, ofrecer una vista tabla/formulario donde cada
  clave aparece como un campo editable (toggle entre "Vista Código" y "Vista Campos")
- Vista Campos: lista de pares clave → valor con botones para editar y eliminar
- Botón "+ Agregar campo" para insertar nuevas entradas
- Sincronización bidireccional: si editas en Vista Código, se refleja en Vista Campos y viceversa
- Mismo botón GUARDAR con validación JSON
- Mostrar cuántos campos tiene actualmente: "23 datos aprendidos"

---

### 2. Visualización y edición de la base de datos (applications.db)

Crear una sección "Base de Datos" con:

#### Vista tabla

- Mostrar todas las filas de la tabla principal con paginación (20 por página)
- Columnas: ID, empresa, cargo, URL, estado, fecha, respuestas_IA (colapsable)
- Búsqueda y filtros por: empresa, cargo, estado, rango de fechas
- Click en una fila → panel lateral con todos los detalles de esa aplicación
- Botón para eliminar una fila específica (con confirmación)
- Botón "Limpiar duplicados" (elimina entradas con misma URL)

#### Estadísticas

- Total de aplicaciones
- Aplicaciones en los últimos 7 días / 30 días
- Top 5 empresas con más aplicaciones
- Gráfico de barras simple: aplicaciones por día (últimos 14 días)

#### Exportar

- Botón "Exportar CSV" de la tabla completa o filtrada
- Botón "Abrir reporte HTML" generado por job_tracker.py

---

### 3. Gestión segura de credenciales de Computrabajo

En la sección "Configuración" agregar un panel "Credenciales":

- Campo CT_EMAIL con tipo text (visible)
- Campo CT_PASSWORD con tipo password (oculto por defecto, toggle para ver)
- El backend NUNCA devuelve la contraseña actual al frontend (solo confirma
  que existe con un placeholder "••••••••")
- Al guardar: el backend actualiza el archivo .env usando python-dotenv
- Las credenciales se muestran enmascaradas también en los logs del sistema
- Botón "Verificar credenciales" que lanza un mini-test de login en Computrabajo

---

### 4. Seguridad avanzada (múltiples capas)

Implementar las siguientes capas de seguridad. La lógica es:

- Google Auth: protege la identidad (solo mi cuenta Google puede entrar)
- Rate limiting: protege contra ataques de fuerza bruta y DDoS
- Whitelist (opcional): agrega una capa extra si el usuario tiene IP fija

#### 4.1 Rate Limiting (obligatorio)

Usar slowapi (Python) en FastAPI:

- Login/OAuth endpoints: máximo 10 requests por minuto por IP
- API endpoints generales: máximo 60 requests por minuto por IP
- Endpoint /api/bot/start: máximo 5 requests por minuto por usuario
- Endpoint /api/bot/confirm (semi-auto): máximo 30 por minuto
- Al superar el límite: responder 429 con mensaje "Too many requests"

#### 4.2 Protección contra fuerza bruta

- Bloquear temporalmente una IP tras 20 intentos fallidos en 5 minutos
- Log de IPs bloqueadas visible en el dashboard (sección Seguridad)
- Blacklist temporal almacenada en memoria (reset al reiniciar) o en Redis si disponible

#### 4.3 Headers de seguridad HTTP

Agregar middleware con estos headers en todas las respuestas:

- Strict-Transport-Security: max-age=31536000
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Content-Security-Policy restrictivo
- Referrer-Policy: no-referrer
- Permissions-Policy: desactivar cámara, micrófono, geolocalización

#### 4.4 CSRF Protection

- Tokens CSRF en todas las operaciones de escritura (POST/PUT/DELETE)
- Validar Origin y Referer headers

#### 4.5 Whitelist de IPs (opcional, configurable)

- En la sección "Seguridad" del dashboard: toggle para activar/desactivar whitelist
- Lista editable de IPs permitidas (puedo agregar mi IP del celular, casa, etc.)
- Si está activada: cualquier IP no listada recibe 403 antes de llegar a Google Auth
- Mostrar "Tu IP actual: X.X.X.X" para facilitar agregarla a la whitelist
- IMPORTANTE: si activo la whitelist y quedo bloqueado, instrucciones en
  README para desactivarla desde el archivo de config directamente

#### 4.6 Sesiones seguras

- JWT tokens con expiración de 8 horas
- Refresh token automático si el usuario está activo
- Cerrar sesión invalida el token en el servidor (blacklist de tokens)
- Cookie httpOnly + Secure + SameSite=Strict para el token

#### 4.7 Logs de seguridad

- Registrar en security.log: IP, endpoint, timestamp, resultado (ok/blocked)
- Sección en el dashboard "Actividad Reciente" con los últimos 50 eventos
- Alerta por Telegram si hay más de 50 intentos fallidos en 10 minutos

#### 4.8 Variables de entorno sensibles

- NUNCA exponer contenido del .env en respuestas de la API
- Endpoint de diagnóstico solo muestra KEYS (sin valores):
  ej. "CT_EMAIL ✅ | CT_PASSWORD ✅ | GEMINI_API_KEY_1 ✅"
- Agregar .env a .gitignore y crear .env.example con valores ficticios

---

### 5. Archivos adicionales a generar

```
dashboard/
  api/
    middleware/
      security.py          ← todo el stack de seguridad
      rate_limiter.py      ← configuración de slowapi
    routes/
      credentials.py       ← gestión segura del .env
      database.py          ← CRUD sobre applications.db
  frontend/
    src/
      pages/
        Profile.jsx        ← editores JSON (cv_data + persistent_knowledge)
        Database.jsx       ← visualizador de applications.db
        Security.jsx       ← logs, whitelist, IPs bloqueadas
      components/
        MonacoEditor.jsx   ← wrapper del editor de código
SECURITY.md                ← documentación de todas las capas de seguridad
```

---

Por favor genera todos los archivos necesarios con el código completo,
listos para usar. Empieza por la estructura de carpetas y luego ve archivo
por archivo. Asegúrate de que el frontend sea completamente responsive
(mobile-first) ya que el caso de uso principal es controlar el bot desde
un celular estando fuera de casa.

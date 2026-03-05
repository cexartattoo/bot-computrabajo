# Dashboard — César Bot v3.0

## Inicio Rápido

```bash
# 1. Instalar dependencias del backend
cd dashboard
python -m pip install -r requirements.txt

# 2. Instalar dependencias del frontend
cd frontend
npm install

# 3. Arrancar todo (opción A: script)
cd ..
start.bat        # Windows — abre backend + frontend

# 3. Arrancar todo (opción B: manual)
# Terminal 1 — Backend:
cd c:\Users\ramir\Desktop\computrabajo
python -m dashboard.api.main

# Terminal 2 — Frontend:
cd dashboard\frontend
npm run dev
```

**URLs:**
- Frontend: http://localhost:5173
- API: http://localhost:8000/docs (Swagger UI)

---

## Configuración de `.env`

Agrega estas variables a tu `.env` existente:

```env
# Dashboard
DASHBOARD_DEV_MODE=true          # true = sin Google Auth (dev local)
SESSION_SECRET=una-clave-secreta # cambiar en producción

# Google OAuth (solo si DASHBOARD_DEV_MODE=false)
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_CLIENT_SECRET=tu_client_secret
DASHBOARD_ALLOWED_EMAIL=tu@email.com

# Telegram (opcional)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=tu_chat_id
```

---

## Cloudflare Tunnel (exponer a internet)

1. Instalar `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Crear un túnel:
   ```bash
   cloudflared tunnel create cesar-bot
   cloudflared tunnel route dns cesar-bot tu-dominio.com
   ```
3. Configurar `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: cesar-bot
   credentials-file: ~/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: tu-dominio.com
       service: http://localhost:5173
     - hostname: api.tu-dominio.com
       service: http://localhost:8000
     - service: http_status:404
   ```
4. Iniciar: `cloudflared tunnel run cesar-bot`

---

## Telegram Bot

1. Habla con [@BotFather](https://t.me/BotFather) en Telegram
2. Crea un bot con `/newbot` y copia el token
3. Obtén tu Chat ID enviando un mensaje al bot y visitando:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Agrega `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` a tu `.env`

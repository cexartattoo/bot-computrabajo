# Roadmap del Bot de Computrabajo v4.0

Documento de propuestas de mejora organizadas por prioridad. Cada sección detalla el problema, la solución propuesta y el impacto esperado.

---

## Fase 1 — Anti-Deteccion y Mayor Alcance

### 1.1 Comportamiento Humano Avanzado
**Problema:** Los bots con patrones predecibles son detectados y baneados.

**Propuesta:**
- **Delays gaussianos:** Reemplazar `random.uniform(3, 8)` por una distribución normal centrada en 5s con desviación de 2s. Los humanos no hacen delays uniformes.
- **Micro-pausas de lectura:** Antes de llenar cada pregunta, esperar un tiempo proporcional a la longitud del texto de la pregunta (simula que el candidato está leyendo).
- **Scroll natural:** Hacer scroll gradual por la descripción de la oferta antes de interactuar con el formulario (píxel a píxel con velocidad variable, no un salto instantáneo).
- **Movimiento de mouse jittery:** Antes de cada click, mover el cursor con una curva Bézier ligeramente aleatoria hacia el botón objetivo.
- **Sesiones con descansos:** Después de cada 3-5 aplicaciones, hacer una pausa larga (30-90s) simulando que el candidato descansa o revisa algo.
- **Variación de horarios:** No aplicar en ráfaga. Distribuir las aplicaciones a lo largo de 15-40 minutos por sesión.

### 1.2 Rotación de Keywords y Paginación
**Problema:** El bot actualmente busca una keyword y se queda en la primera página.

**Propuesta:**
- Iterar por TODAS las keywords en `SEARCH_KEYWORDS` automáticamente (no solo la primera).
- Avanzar a la página 2, 3, etc. si quedan cuotas de aplicación.
- Aleatorizar el orden de keywords por sesión para no generar patrones.

### 1.3 Filtro de Ofertas Inteligente
**Problema:** El bot pierde tiempo en ofertas donde Cesar no califica o no le interesan.

**Propuesta:**
- **Pre-filtro con IA rápido:** Antes de entrar al formulario, enviar título + resumen de la oferta a Gemini con un prompt corto: "Evalúa del 1 al 10 qué tan compatible es esta oferta con este perfil. Responde SOLO el número." Si es < 5, saltar la oferta.
- **Lista negra de empresas:** Permitir al usuario configurar empresas (o palabras clave en el título) que quiere excluir (ej: "multinivel", "comisión 100%").
- **Filtro de antigüedad:** Saltar ofertas publicadas hace más de 15 días (menor probabilidad de respuesta).

---

## Fase 2 — Modo Semi-Automatico Mejorado (Nueva Pestaña)

### 2.1 Interfaz de Revisión de Aplicaciones
**Problema:** El modo semi-auto actual solo pausa y pide aprobar/rechazar por un mensaje de texto en los logs; el usuario no puede ver ni editar las respuestas de la IA.

**Propuesta: Nueva pestaña "Revision" en el Dashboard**

```
+---------------------------------------------------------------+
| [Panel] [Revision] [Resultados] [Historial] [Perfil] [Config]|
+---------------------------------------------------------------+

+---------------------------+----------------------------------+
|  OFERTA ACTUAL            |  RESPUESTAS PROPUESTAS (IA)      |
|                           |                                  |
|  Titulo: Ing. Python      |  Pregunta 1: ¿Experiencia PLC?  |
|  Empresa: TechCo          |  [   3 años programando S7-1200 ]|
|  Ciudad: Bogota           |  [   ... campo editable ...     ]|
|                           |                                  |
|  Descripcion:             |  Pregunta 2: ¿Salario esperado? |
|  "Buscamos ingeniero..."  |  [   3.500.000 COP             ]|
|  (texto completo con      |                                  |
|   scroll)                 |  Pregunta 3: ¿Disponibilidad?   |
|                           |  [   Inmediata                  ]|
|                           |                                  |
+---------------------------+----------------------------------+
|        [ Rechazar ]       [ Enviar Aplicacion -->]           |
+---------------------------------------------------------------+
```

**Funcionamiento:**
1. El bot analiza la oferta y genera respuestas con IA.
2. En lugar de enviar automáticamente, publica las respuestas propuestas via WebSocket al Dashboard.
3. La pestaña "Revision" muestra: descripción de la oferta a la izquierda, campos editables a la derecha.
4. El usuario puede:
   - **Editar** cualquier respuesta directamente en el campo de texto.
   - **Agregar comentarios** (ej: "Menciona también que tengo certificación COPNIA").
   - **Rechazar** la oferta → el bot la salta.
   - **Enviar** → el bot usa las respuestas (editadas o no) y aplica.
5. Cuando no hay ofertas pendientes, muestra un mensaje: "Esperando siguiente oferta..."

### 2.2 Cola de Revisión
- Si el bot analiza varias ofertas rápido, se acumulan en una cola.
- La UI muestra un badge: "3 pendientes" y el usuario las revisa una por una.
- Si el usuario no responde en 5 minutos, la oferta se marca como "expirada" y se salta.

---

## Fase 3 — Notificaciones y Preferencias de UI

### 3.1 Centro de Notificaciones
**Propuesta:**
- **Toggle de Telegram:** Botón on/off en Settings para activar/desactivar notificaciones de Telegram sin tener que tocar el archivo `.env`.
- **Notificaciones del navegador:** Implementar Web Push Notifications usando la API nativa del navegador (`Notification.requestPermission()`). Eventos que notifican:
  - Bot terminó
  - Oferta esperando revisión (modo semi-auto)
  - Error en el bot
- **Toggle individual:** El usuario puede elegir qué eventos notificar y por qué canal (Telegram, navegador, ambos, ninguno).

### 3.2 Modo Oscuro / Modo Claro
**Propuesta:**
- Toggle animado con SVG de sol/luna en la barra de navegación.
- La transición usa `transition: background-color 0.5s, color 0.5s` en el body.
- Animación del ícono: el sol rota y se transforma en luna (y viceversa) con una transición CSS de 600ms.
- Persistir preferencia en `localStorage`.
- El tema claro usa fondo blanco con acentos azul/púrpura; el oscuro mantiene el actual.

---

## Fase 4 — Inteligencia y Aprendizaje

### 4.1 Aprendizaje de Estilo del Usuario
**Problema:** Si el usuario edita frecuentemente las respuestas de la IA en modo semi-auto, esas correcciones se pierden.

**Propuesta:**
- Guardar en la DB cada par `(respuesta_ia_original, respuesta_editada_por_usuario)`.
- Cada 20 ediciones, generar automáticamente un "resumen de estilo" con Gemini: "El usuario prefiere respuestas más cortas, usa tono formal, siempre menciona su tesis...".
- Inyectar ese resumen de estilo en futuros prompts para que la IA se adapte.

### 4.2 Análisis Post-Aplicación
**Propuesta:**
- Dashboard card: "Tasa de respuesta" → de las ofertas aplicadas, ¿cuántas respondieron? (El usuario marcaría manualmente "Respondí" / "Sin respuesta" / "Entrevista").
- Con datos suficientes (>30 aplicaciones), generar un reporte: "Tus mejores resultados son en ofertas de Python con empresas medianas en Bogota."
- Usar esa data para priorizar búsquedas futuras automáticamente.

### 4.3 Generación Dinámica de CV
- Antes de cada aplicación, la IA analiza la oferta y reordena las secciones del CV para destacar lo más relevante.
- Genera un PDF dinámico con las habilidades más relevantes primero.
- Se sube ese CV personalizado en lugar del genérico.

---

## Fase 5 — Infraestructura y Calidad

### 5.1 Tests Automatizados
- Tests unitarios para `ai_responder.py`: verificar que el prompt se construye correctamente, que el JSON se parsea bien.
- Tests de integración para la API: verificar todos los endpoints con un cliente de prueba.
- Test E2E del flujo: mock del navegador para simular el ciclo completo.

### 5.2 Manejo de Errores Robusto
- **Retry con backoff exponencial** si Gemini falla (rate limit, timeout).
- **Screenshot on error:** Si Playwright falla en un paso, capturar screenshot automáticamente y guardarla en `/bot/errors/`.
- **Circuito de emergencia:** Si hay 3 errores consecutivos, pausar el bot automáticamente y notificar al usuario, en vez de crashear.

### 5.3 Multi-Plataforma
- Soporte futuro para otros portales: LinkedIn Easy Apply, Indeed, elempleo.com.
- Arquitectura de plugins: cada plataforma es un módulo con la interfaz `login()`, `search()`, `apply()`.

---

## Resumen de Prioridades

| Prioridad | Feature | Impacto | Esfuerzo |
|-----------|---------|---------|----------|
| 1 | Delays gaussianos + micro-pausas | Alto (anti-ban) | Bajo |
| 2 | Rotación de keywords + paginación | Alto (alcance) | Bajo |
| 3 | Pestaña de Revisión semi-auto | Alto (UX) | Medio |
| 4 | Pre-filtro IA de compatibilidad | Alto (eficiencia) | Medio |
| 5 | Toggle notificaciones Telegram/browser | Medio (UX) | Bajo |
| 6 | Modo oscuro/claro con animación SVG | Medio (UX) | Bajo |
| 7 | Lista negra de empresas | Medio (precisión) | Bajo |
| 8 | Aprendizaje de estilo del usuario | Alto (calidad IA) | Alto |
| 9 | Análisis post-aplicación | Medio (insights) | Medio |
| 10 | CV dinámico por oferta | Alto (conversión) | Alto |
| 11 | Screenshot on error + retry | Medio (estabilidad) | Bajo |
| 12 | Tests automatizados | Medio (calidad) | Medio |
| 13 | Multi-plataforma (LinkedIn, etc.) | Alto (alcance) | Alto |

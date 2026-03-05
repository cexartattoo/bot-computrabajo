import asyncio
import random
import math
import time
from pathlib import Path
from datetime import datetime

from playwright.async_api import async_playwright, Page, Browser, Playwright, BrowserContext, TimeoutError

from bot.config import (
    CT_EMAIL, CT_PASSWORD, HEADLESS,
    DELAY_MIN_SECONDS, DELAY_MAX_SECONDS, CV_PATH
)
from bot.ai_responder import answer_questions_batch, answer_question
from bot.job_tracker import log_application, already_applied
from bot.persistent_knowledge import save_persistent_knowledge

BASE_URL = "https://www.computrabajo.com.co"
LOGIN_URL = f"{BASE_URL}/"
SEARCH_URL = f"{BASE_URL}/empleos-en"

ERRORS_DIR = Path(__file__).parent / "errors"
ERRORS_DIR.mkdir(exist_ok=True)

# --- Anti-detection utilities ---

async def human_delay(min_s: float = None, max_s: float = None):
    """Gaussian delay centered between min and max, simulating human behavior."""
    lo = min_s or DELAY_MIN_SECONDS
    hi = max_s or DELAY_MAX_SECONDS
    center = (lo + hi) / 2
    std_dev = (hi - lo) / 4  # 95% of values fall within [lo, hi]
    delay = max(lo * 0.5, random.gauss(center, std_dev))
    await asyncio.sleep(delay)


async def reading_pause(text: str):
    """Pause proportional to text length, simulating reading time."""
    words = len(text.split())
    # Average human reads 200-250 wpm; we simulate 300-500 wpm (skimming)
    read_time = words / random.uniform(300, 500) * 60
    read_time = max(0.5, min(read_time, 8))  # clamp between 0.5s and 8s
    await asyncio.sleep(read_time)


async def natural_scroll(page: Page, pixels: int = 600):
    """Scroll gradually with variable speed, like a human."""
    scrolled = 0
    while scrolled < pixels:
        chunk = random.randint(40, 120)
        await page.mouse.wheel(0, chunk)
        scrolled += chunk
        await asyncio.sleep(random.uniform(0.05, 0.15))


async def rest_break():
    """Long pause (30-90s) to simulate a human taking a break."""
    duration = random.uniform(30, 90)
    print(f"  [Bot] Pausa de descanso ({int(duration)}s)...")
    await asyncio.sleep(duration)


async def screenshot_on_error(page: Page, context: str = "error"):
    """Capture screenshot when an error occurs for debugging."""
    try:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = ERRORS_DIR / f"{context}_{ts}.png"
        await page.screenshot(path=str(path))
        print(f"  [Browser] Screenshot guardado: {path.name}")
    except Exception:
        pass


async def launch_browser(playwright: Playwright) -> tuple[BrowserContext, Page]:
    user_data_dir = Path(__file__).parent.parent / "playwright_data"
    context = await playwright.chromium.launch_persistent_context(
        user_data_dir,
        headless=False,  # Forzar False para evitar crashes con Playwright y Cloudflare
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    )
    # Remove webdriver flag to avoid detection
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    
    pages = context.pages
    if len(pages) > 0:
        page = pages[0]
    else:
        page = await context.new_page()
        
    return context, page


async def login(page: Page) -> bool:
    """Log in to Computrabajo. Returns True if successful."""
    print("  [Browser] Verificando sesión actual...")
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await human_delay(1, 2)

    try:
        # Revisa si ya estamos logueados (buscando indicador de perfil)
        # Buscar en el header: foto de perfil, contenedor de usuario, o el texto Notificaciones
        profile_indicator = page.locator(".info_user, img[name='imgheadcv']")
        
        # Le damos un momento por si la página está cargando la sesión
        try:
            await profile_indicator.first.wait_for(state="visible", timeout=10000)
            count = await profile_indicator.count()
        except Exception:
            count = 0
            
        if count > 0:
            print("  [Browser] ¡Ya estás logueado! Usando la sesión guardada.")
            return True

        print("\n" + "=" * 60)
        print("  [Browser] [!!] NO HAY SESION ACTIVA.")
        print("  [Browser] Asegúrate de que no haya captchas bloqueando la portada.")
        print("  [Browser] Por favor inicie sesión MANUALMENTE en la ventana que se abrió.")
        print("  [Browser] Tienes 5 minutos... El bot continuará automáticamente después.")
        print("  [Browser] Nota: La sesión se guardará para las próximas veces.")
        print("=" * 60 + "\n")
        
        # Vamos a la página de login explícitamente para ayudar al usuario
        await page.goto(LOGIN_URL, wait_until="domcontentloaded")
        
        # Esperamos hasta que el usuario inicie sesión y aparezca el menú de perfil
        await profile_indicator.first.wait_for(state="visible", timeout=300000)
        print("  [Browser] ¡Inicio de sesión manual detectado exitosamente!")
        return True

    except Exception as e:
        print(f"  [Browser] Tiempo agotado o error en la verificación de sesión: {e}")
        return False


async def search_jobs(page: Page, keyword: str, location: str = "Bogotá") -> list[dict]:
    """Search jobs and return list of {title, company, url, location, salary}."""
    print(f"  [Browser] Buscando: '{keyword}' en '{location}'...")

    # En lugar de ir directo a la URL (lo que levanta sospechas y da ERR_ABORTED),
    # vamos a simular un humano: ir a la página principal y buscar.
    success = False
    for attempt in range(2):
        try:
            # Primero vamos a Home o nos aseguramos de estar ahí
            if "computrabajo.com.co" not in page.url or "trabajo" in page.url:
                await page.goto(BASE_URL, wait_until="commit", timeout=30000)
                await human_delay(1, 3)
            
            # Limpiar busquedas previas si existen (ir al home limpio)
            await page.goto("https://co.computrabajo.com/", wait_until="commit", timeout=30000)
            await human_delay(1, 2)
            
            # Buscar el input de profesion/cargo
            search_input = page.locator("input#prof-cat-search-input, input[name='q'], input[type='text'][id*='search'], input#search-input")
            if await search_input.count() > 0:
                # Filtrar solo visibles
                for i in range(await search_input.count()):
                    if await search_input.nth(i).is_visible():
                        await search_input.nth(i).fill("")  # Limpiar
                        await human_delay(0.5, 1)
                        await search_input.nth(i).fill(keyword)
                        await human_delay(0.5, 1.5)
                        break
                
                # Buscar input de lugar
                loc_input = page.locator("input#place-search-input, input[name='l'], input[type='text'][id*='place'], input#place-input")
                if await loc_input.count() > 0:
                    for i in range(await loc_input.count()):
                        if await loc_input.nth(i).is_visible():
                            await loc_input.nth(i).fill("")
                            await human_delay(0.5, 1)
                            # Para remoto, escribimos Teletrabajo
                            if location.lower() == "teletrabajo":
                                await loc_input.nth(i).fill("Teletrabajo")
                            else:
                                await loc_input.nth(i).fill(location)
                            await human_delay(0.5, 1.5)
                            break
                
                # Clic en buscar
                search_btn = page.locator("button#search-button, button[type='submit'], .btn-search, button:has-text('Buscar')")
                if await search_btn.count() > 0:
                    await search_btn.first.click()
                else:
                    await page.keyboard.press("Enter")
                    
                # Esperar a que por lo menos un article.box_offer o mensaje de "No hay resultados" aparezca
                try:
                    await page.wait_for_selector("article.box_offer, div.box_offer, .offerList-item, .no-results-message", timeout=15000)
                except TimeoutError:
                    print(f"  [Browser] Tiempo de espera agotado buscando ofertas de '{keyword}' en '{location}'")
                    pass
                await human_delay(2, 4)
                
                # Verificar si cargaron ofertas
                cards = page.locator("article.box_offer, div.box_offer, .offerList-item")
                if await cards.count() > 0:
                    success = True
                    break
        except Exception as e:
            print(f"  [Browser] Intento {attempt+1} fallido al buscar en UI: {e}")
            await human_delay(2, 4)
            
    if not success:
        print(f"  [Browser] Error: no se encontraron ofertas o falló la búsqueda para '{keyword}'")
        return []

    jobs = []
    try:
        # Job listing cards — Computrabajo uses article or div cards
        cards = page.locator("article.box_offer, div.box_offer, .offerList-item")
        count = await cards.count()
        print(f"  [Browser] Encontradas {count} ofertas")

        for i in range(min(count, 25)):
            card = cards.nth(i)
            try:
                title_el = card.locator("h2 a, h3 a, .title-offer a, a.js-o-link")
                title = (await title_el.first.inner_text()).strip() if await title_el.count() > 0 else "Sin título"
                url = await title_el.first.get_attribute("href") if await title_el.count() > 0 else ""
                if url and not url.startswith("http"):
                    url = BASE_URL + url

                company_el = card.locator(".company, .companyName, .box_company")
                company = (await company_el.first.inner_text()).strip() if await company_el.count() > 0 else ""

                loc_el = card.locator(".location, .city, .box_location")
                loc = (await loc_el.first.inner_text()).strip() if await loc_el.count() > 0 else ""

                salary_el = card.locator(".salary, .box_salary, .js-salary")
                salary = (await salary_el.first.inner_text()).strip() if await salary_el.count() > 0 else ""

                if url:
                    jobs.append({
                        "title": title,
                        "company": company,
                        "url": url,
                        "location": loc,
                        "salary": salary,
                    })
            except Exception:
                continue

    except Exception as e:
        print(f"  [Browser] Error parseando resultados: {e}")

    return jobs


async def search_jobs_paginated(page: Page, keyword: str, location: str = "Bogota", max_pages: int = 3) -> list[dict]:
    """Search jobs across multiple pages of results."""
    all_jobs = []
    first_page_jobs = await search_jobs(page, keyword, location)
    all_jobs.extend(first_page_jobs)

    if not first_page_jobs:
        return all_jobs

    for page_num in range(2, max_pages + 1):
        try:
            # Look for "Siguiente" pagination link
            next_btn = page.locator(
                "a:has-text('Siguiente'), a:has-text('siguiente'), "
                "a.pagination-next, li.next a, a[rel='next']"
            )
            if await next_btn.count() == 0:
                break
            await next_btn.first.click()
            await human_delay(2, 4)

            # Wait for results to load
            try:
                await page.wait_for_selector(
                    "article.box_offer, div.box_offer, .offerList-item",
                    timeout=10000
                )
            except TimeoutError:
                break

            page_jobs = []
            cards = page.locator("article.box_offer, div.box_offer, .offerList-item")
            count = await cards.count()
            print(f"  [Browser] Pagina {page_num}: {count} ofertas")

            for i in range(min(count, 25)):
                card = cards.nth(i)
                try:
                    title_el = card.locator("h2 a, h3 a, .title-offer a, a.js-o-link")
                    title = (await title_el.first.inner_text()).strip() if await title_el.count() > 0 else "Sin titulo"
                    url = await title_el.first.get_attribute("href") if await title_el.count() > 0 else ""
                    if url and not url.startswith("http"):
                        url = BASE_URL + url
                    company_el = card.locator(".company, .companyName, .box_company")
                    company = (await company_el.first.inner_text()).strip() if await company_el.count() > 0 else ""
                    loc_el = card.locator(".location, .city, .box_location")
                    loc = (await loc_el.first.inner_text()).strip() if await loc_el.count() > 0 else ""
                    salary_el = card.locator(".salary, .box_salary, .js-salary")
                    salary = (await salary_el.first.inner_text()).strip() if await salary_el.count() > 0 else ""
                    if url:
                        page_jobs.append({"title": title, "company": company, "url": url, "location": loc, "salary": salary})
                except Exception:
                    continue

            all_jobs.extend(page_jobs)
            if not page_jobs:
                break
            await human_delay(1, 3)
        except Exception as e:
            print(f"  [Browser] Error en paginacion pagina {page_num}: {e}")
            break

    return all_jobs


async def apply_to_job(page: Page, job: dict, mode: str = "apply") -> tuple[bool, dict]:
    """
    Navigate to job URL and attempt to apply.

    Modes:
      - "apply"       → Fill form + submit (default)
      - "dry-run-llm" → Get LLM answers but NEVER touch the form
      - "semi-auto"   → Fill form, pause for user review, then submit

    Returns (success: bool, answers: dict)
    answers dict has structure: {question: {"answer": ..., "model": ..., "tipo": ..., "confianza": ...}}
    """
    from bot.ai_responder import answer_questions_batch, answer_question

    print(f"  [Browser] {'[DRY-RUN-LLM] ' if mode == 'dry-run-llm' else ''}Aplicando a: {job['title']} @ {job['company']}")
    await page.goto(job["url"], wait_until="domcontentloaded")
    await human_delay(2, 4)

    # Natural scroll through the job description before interacting
    await natural_scroll(page, random.randint(300, 800))
    await reading_pause(job.get("title", "") + " " + job.get("company", ""))

    answers = {}

    try:
        # Look for apply button
        apply_btn = page.locator(
            "a.apply-btn, button.apply-btn, #applyBtn, "
            "a:has-text('Aplicar'), button:has-text('Aplicar'), "
            "a:has-text('Postularme'), button:has-text('Postularme')"
        )

        if await apply_btn.count() == 0:
            print("  [Browser] No se encontró botón de aplicar")
            return False, {}

        # In dry-run-llm we still click to see the questions, but won't submit
        await apply_btn.first.click()
        await human_delay(2, 3)

        # ── Detect question fields ──────────────────────────
        question_inputs = page.locator(
            "textarea, input[type='text']:not([type='hidden']), "
            "input[placeholder*='?'], .application-question input, "
            ".application-question textarea"
        )
        q_count = await question_inputs.count()
        questions_to_ask = []
        for i in range(q_count):
            inp = question_inputs.nth(i)
            q_text = ""

            # Strategy 1: label[for=id]
            inp_id = await inp.get_attribute("id")
            if inp_id:
                label_el = page.locator(f"label[for='{inp_id}']")
                if await label_el.count() > 0:
                    q_text = (await label_el.first.inner_text()).strip()

            # Strategy 2: parent <label> wrapping the input
            if not q_text:
                parent_label = inp.locator("xpath=ancestor::label")
                if await parent_label.count() > 0:
                    q_text = (await parent_label.first.inner_text()).strip()

            # Strategy 3: aria-label attribute
            if not q_text:
                aria = await inp.get_attribute("aria-label")
                if aria:
                    q_text = aria.strip()

            # Strategy 4: preceding sibling text (common in forms)
            if not q_text:
                prev_text = inp.locator("xpath=preceding-sibling::*[1]")
                if await prev_text.count() > 0:
                    q_text = (await prev_text.first.inner_text()).strip()

            # Strategy 5: placeholder
            if not q_text:
                placeholder = await inp.get_attribute("placeholder")
                if placeholder:
                    q_text = placeholder.strip()

            # Last resort
            if not q_text:
                q_text = f"Pregunta {i+1}"

            questions_to_ask.append(q_text)

        # ── Batch answer all questions via LLM ──────────────
        batch_answers = {}
        model_used_for_batch = "none"
        if questions_to_ask:
            print(f"  [Browser] Enviando {len(questions_to_ask)} preguntas a la IA en lote...")
            try:
                batch_answers, model_used_for_batch, _skipped = answer_questions_batch(
                    questions_to_ask,
                    job_title=job["title"],
                    company=job["company"]
                )
            except Exception as e:
                print(f"    [!] Error en batch AI: {e}")
                batch_answers = {}
                model_used_for_batch = "error"

        # ── Process each question ───────────────────────────
        for i in range(q_count):
            inp = question_inputs.nth(i)
            # Use the same question text detected in the first pass
            question_text = questions_to_ask[i] if i < len(questions_to_ask) else f"Pregunta {i+1}"

            if not question_text:
                continue

            # Resolve answer from batch or fallback
            if question_text in batch_answers:
                answer_data = batch_answers[question_text]
                model_used = model_used_for_batch
            else:
                # Fallback: individual call (returns enriched dict too)
                answer_data_raw, model_used = answer_question(
                    question_text,
                    job_title=job["title"],
                    company=job["company"]
                )
                # answer_question returns (str|dict, str) — normalize
                if isinstance(answer_data_raw, dict):
                    answer_data = answer_data_raw
                else:
                    answer_data = {"respuesta": str(answer_data_raw), "tipo": "fallback", "confianza": "media"}

            # Extract the actual text to fill
            if isinstance(answer_data, dict):
                ai_answer = answer_data.get("respuesta", "")
                tipo = answer_data.get("tipo", "desconocido")
                confianza = answer_data.get("confianza", "media")
            else:
                ai_answer = str(answer_data)
                tipo = "legacy"
                confianza = "media"

            # ── Missing Data: ask user and save forever ─────
            if "DATO_FALTANTE" in str(ai_answer):
                print(f"\\n  [!] Faltan datos para responder: '{question_text}'")
                print("      Por favor, escribe la respuesta para guardarla y usarla en el futuro:")
                try:
                    loop = asyncio.get_event_loop()
                    user_input = await loop.run_in_executor(None, input, "      > ")
                    user_input = user_input.strip()
                except BaseException:
                    user_input = ""
                
                if user_input:
                    ai_answer = user_input
                    tipo = "dato_aprendido"
                    confianza = "alta"
                    # Save to persistent knowledge to avoid asking again
                    await loop.run_in_executor(None, save_persistent_knowledge, {question_text: user_input})
                else:
                    # User skipped
                    ai_answer = ""
                    tipo = "omitida"

            # ── Semi-auto: show answer and let user edit ────
            if mode == "semi-auto":
                conf_icon = {"alta": "[OK]", "media": "[~]", "baja": "[!]"}.get(confianza, "[?]")
                print(f"\n  [{i+1}/{q_count}] {question_text}")
                print(f"        Tipo: {tipo} | Confianza: {conf_icon} {confianza}")
                print(f"        Respuesta: \"{ai_answer}\"")
                print(f"        [Enter] Aprobar  [e] Editar  [s] Saltar")
                try:
                    user_input = input("        > ").strip().lower()
                except EOFError:
                    user_input = ""
                if user_input == "e":
                    new_answer = input("        Nueva respuesta: ").strip()
                    if new_answer:
                        ai_answer = new_answer
                        tipo = "editada_manual"
                        confianza = "alta"
                elif user_input == "s":
                    print("        -> Pregunta saltada.")
                    continue

            # ── Fill the input (skip in dry-run-llm) ────────
            if mode != "dry-run-llm":
                try:
                    await inp.fill(str(ai_answer))
                    await human_delay(0.5, 1.5)
                except Exception as e:
                    print(f"    [!] Error llenando input: {e}")

            # Store enriched answer
            answers[question_text] = {
                "answer": ai_answer,
                "model": model_used,
                "tipo": tipo,
                "confianza": confianza,
            }
            conf_icon = {"alta": "[OK]", "media": "[~]", "baja": "[!]"}.get(confianza, "[?]")
            print(f"    - {conf_icon} '{question_text[:60]}...' [{model_used}] ({tipo})")

        # ── In dry-run-llm, stop here — don't upload CV or submit ──
        if mode == "dry-run-llm":
            print(f"  [DRY-RUN-LLM] Respuestas recopiladas sin enviar formulario.")
            return True, answers

        # ── Upload CV if file input is present ──────────────
        if CV_PATH.exists():
            file_input = page.locator("input[type='file']")
            if await file_input.count() > 0:
                await file_input.first.set_input_files(str(CV_PATH))
                await human_delay(1, 2)
                print("  [Browser] CV adjuntado")

        # ── Semi-auto: final confirmation before submit ─────
        if mode == "semi-auto":
            print(f"\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"  ¿Enviar aplicación a {job['title']}? [Enter] Sí  [n] No")
            try:
                confirm = input("  > ").strip().lower()
            except EOFError:
                confirm = ""
            if confirm == "n":
                print("  -> Aplicacion cancelada por el usuario.")
                return False, answers

        # ── Submit application ──────────────────────────────
        submit_btn = page.locator(
            "button[type='submit'], input[type='submit'], "
            "button:has-text('Enviar'), button:has-text('Confirmar')"
        )
        if await submit_btn.count() > 0:
            await submit_btn.first.click()
            await human_delay(2, 4)
            print(f"  [Browser] [OK] Aplicacion enviada!")
            return True, answers
        else:
            print("  [Browser] No se encontró botón de confirmación")
            return False, answers

    except Exception as e:
        print(f"  [Browser] Error aplicando: {e}")
        await screenshot_on_error(page, f"apply_{job.get('company', 'unknown')}")
        return False, answers

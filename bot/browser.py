import asyncio
import random
import math
import time
import sys
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
        ),
        timeout=60000,  # 60s max to launch
    )
    # Set default navigation/action timeout to 30s
    context.set_default_timeout(30000)
    context.set_default_navigation_timeout(45000)

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
    print("  [Browser] Verificando sesion actual...")
    try:
        await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  [Browser] Error cargando pagina principal: {e}")
        return False
    await human_delay(1, 2)

    try:
        profile_indicator = page.locator(".info_user, img[name='imgheadcv']")
        
        try:
            await profile_indicator.first.wait_for(state="visible", timeout=10000)
            count = await profile_indicator.count()
        except Exception:
            count = 0
            
        if count > 0:
            print("  [Browser] Ya estas logueado! Usando la sesion guardada.")
            return True

        print("\n" + "=" * 60)
        print("  [Browser] [!!] NO HAY SESION ACTIVA.")
        print("  [Browser] Inicie sesion MANUALMENTE en la ventana del navegador.")
        print("  [Browser] Tienes 5 minutos... El bot continuara automaticamente.")
        print("=" * 60 + "\n")
        
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
        
        # Wait for manual login with periodic status prints
        for i in range(30):  # 30 x 10s = 5 min
            try:
                await profile_indicator.first.wait_for(state="visible", timeout=10000)
                print("  [Browser] Inicio de sesion manual detectado!")
                return True
            except Exception:
                remaining = 5 * 60 - (i + 1) * 10
                if remaining > 0 and (i + 1) % 3 == 0:  # Print every 30s
                    print(f"  [Browser] Esperando login manual... ({remaining}s restantes)")

        print("  [Browser] Tiempo agotado esperando login manual.")
        return False

    except Exception as e:
        print(f"  [Browser] Error en verificacion de sesion: {e}")
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


async def apply_to_job(page: Page, job: dict, mode: str = "apply"):
    """
    Navigate to job URL and attempt to apply.

    Modes:
      - "apply"       -> Fill form + submit (default)
      - "dry-run-llm" -> Get LLM answers but NEVER touch the form
      - "semi-auto"   -> Fill form, pause for user review, then submit

    Returns (result, answers: dict)
      result can be:
        True  -> application submitted successfully
        False -> application failed
        "already_applied" -> Computrabajo says "Ya aplicaste a esta oferta"

    answers dict has structure: {question: {"answer": ..., "model": ..., "tipo": ..., "confianza": ...}}

    --- Special Cases ---

    Caso A - "Ya aplicaste a esta oferta":
      Detectado tras click en Aplicar. Computrabajo muestra mensaje de duplicado.
      Retorna ("already_applied", {}). El bot registra en BD con status
      'aplicado_anteriormente', se cuenta en resultados y se notifica por Telegram.

    Caso B - Dry-run sin cuestionario:
      Cuando no hay preguntas en el formulario. El proceso se considera completo.
      Retorna (True, {}). El bot registra en BD como 'applied' con nota explicativa.

    Caso C - Dry-run con cuestionario:
      Preguntas detectadas, LLM genera respuestas pero NO se llenan en el formulario.
      Retorna (True, answers). El bot registra en BD como 'dry-run'.
    """
    from bot.ai_responder import answer_questions_batch, answer_question

    print(f"  [Browser] {'[DRY-RUN-LLM] ' if mode == 'dry-run-llm' else ''}Aplicando a: {job['title']} @ {job['company']}")
    try:
        await page.goto(job["url"], wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  [Browser] Timeout cargando oferta: {e}")
        return False, {}
    await human_delay(2, 4)

    # Natural scroll through the job description before interacting
    await natural_scroll(page, random.randint(300, 800))
    await reading_pause(job.get("title", "") + " " + job.get("company", ""))

    # ── Extraer contenido estructurado del contenedor principal de la oferta ──
    # Selectores VERIFICADOS contra el HTML real de Computrabajo:
    #   - Tags rapidos: span.tag.base (NO span.tag, que matchea cientos de elementos)
    #   - Contenido oferta: div[div-link="oferta"] contiene descripcion, tags, requisitos
    #   - Titulo: h1 en main.detail_fs > .container (fuera del box_border)
    #   - Empresa: p.fs16 en main.detail_fs > .container (fuera del box_border)
    #   - Descripcion: p.mbB dentro de div[div-link="oferta"]
    #   - Requisitos: ul.disc li dentro de div[div-link="oferta"]
    #   - Keywords: p.fc_aux.fs13 con "Palabras clave" dentro de div[div-link="oferta"]
    #   - Fecha: p.fc_aux.fs13 con "Hace" dentro de div[div-link="oferta"]
    job_details = {}
    try:
        job_details = await page.evaluate('''() => {
            const quick_facts = {};
            const sections = {};

            // 1. Titulo y empresa -- estan FUERA del box_border, directamente en
            //    main.detail_fs > .container
            const h1 = document.querySelector('main.detail_fs h1');
            if (h1) quick_facts.title = h1.innerText.trim();

            // Empresa y ubicacion: <p class="fs16">CUN - Bogota, D.C., Bogota, D.C.</p>
            const compSub = document.querySelector('main.detail_fs > .container > p.fs16');
            if (compSub) {
                const compText = compSub.innerText.trim();
                if (compText.includes(' - ')) {
                    const parts = compText.split(' - ');
                    quick_facts.company = parts[0].trim();
                    quick_facts.location = parts.slice(1).join(' - ').trim();
                } else {
                    quick_facts.company = compText;
                }
            }

            // 2. Localizar el bloque de la oferta: div[div-link="oferta"]
            //    Este div contiene SOLO el contenido de la oferta (tags, descripcion,
            //    requisitos, keywords, fecha). TODO lo demas (empresa, salarios,
            //    ofertas similares) esta en otros div[div-link="..."]
            const offerBlock = document.querySelector('div[div-link="oferta"]');

            // 3. Tags rapidos: span.tag.base (NO span.tag que matchea nav, badges, etc.)
            //    Estos estan dentro de div[div-link="oferta"] > div.mbB > span.tag.base
            const tagScope = offerBlock || document;
            const spanTags = Array.from(tagScope.querySelectorAll('span.tag.base'));
            for (const tag of spanTags) {
                const text = tag.innerText.trim();
                if (!text || text.length > 80) continue;
                const lower = text.toLowerCase();
                if (text.includes('$') || lower.includes('salario') || lower.includes('convenir')) {
                    quick_facts.salary = text;
                } else if (lower.includes('contrato')) {
                    quick_facts.contract = text;
                } else if (lower.includes('tiempo completo') || lower.includes('medio tiempo') || lower.includes('jornada') || lower.includes('a.m.') || lower.includes('p.m.')) {
                    quick_facts.schedule = text;
                } else if (lower.includes('remoto') || lower.includes('teletrabajo') || lower.includes('hibrido') || lower.includes('híbrido') || lower.includes('presencial')) {
                    quick_facts.modality = text;
                }
            }

            // 4. Requisitos: ul.disc li dentro del bloque de oferta
            const reqScope = offerBlock || document;
            const reqItems = Array.from(reqScope.querySelectorAll('ul.disc li'));
            const requirementLines = [];
            for (const li of reqItems) {
                const text = li.innerText.trim();
                if (!text) continue;
                const lower = text.toLowerCase();
                if (lower.includes('educación mínima') || lower.includes('educacion minima') || lower.includes('postgrado') || lower.includes('especialización') || lower.includes('universidad') || lower.includes('bachillerato') || lower.includes('técnic')) {
                    quick_facts.education = text;
                } else if (lower.includes('experiencia') || lower.includes('años de experiencia') || lower.includes('año de experiencia')) {
                    quick_facts.experience = text;
                }
                requirementLines.push(text);
            }
            if (requirementLines.length > 0) {
                sections.requirements = requirementLines.join('\\n');
            }

            // 5. Fecha y keywords: p.fc_aux.fs13 dentro del bloque de oferta
            const auxScope = offerBlock || document;
            const auxParas = Array.from(auxScope.querySelectorAll('p.fc_aux.fs13, p.fs13.fc_aux'));
            for (const p of auxParas) {
                const text = p.innerText.trim();
                const lower = text.toLowerCase();
                if (lower.includes('hace') || lower.includes('actualizada') || lower.includes('publicada')) {
                    quick_facts.date = text;
                } else if (lower.includes('palabras clave')) {
                    const kw = text.replace(/^palabras clave:\\s*/i, '').trim();
                    if (kw) {
                        quick_facts.keywords = kw;
                        sections.keywords = kw;
                    }
                }
            }

            // 6. Detectar modalidad desde la descripcion si no se encontro en tags
            if (!quick_facts.modality && offerBlock) {
                const offerText = offerBlock.innerText.toLowerCase();
                if (offerText.includes('100% remoto') || offerText.includes('teletrabajo') || offerText.includes('trabajo remoto')) {
                    quick_facts.modality = 'Remoto';
                } else if (offerText.includes('híbrido') || offerText.includes('hibrido')) {
                    quick_facts.modality = 'Híbrido';
                } else if (offerText.includes('modalidad presencial') || offerText.includes('modo presencial')) {
                    quick_facts.modality = 'Presencial';
                }
            }

            // 7. Descripcion del cargo:
            //    Primero buscar p.mbB largo dentro de div[div-link="oferta"]
            //    (es el parrafo principal de la oferta, ej: linea 539-572 del HTML real)
            if (offerBlock) {
                const descParas = Array.from(offerBlock.querySelectorAll('p.mbB'));
                // Tomar el p.mbB mas largo como descripcion
                let longestText = '';
                for (const p of descParas) {
                    const text = p.innerText.trim();
                    if (text.length > longestText.length) longestText = text;
                }
                if (longestText.length > 50) {
                    sections.description = longestText.substring(0, 8000);
                }
            }

            // 8. Fallback: si no encontramos p.mbB, extraer todo el bloque limpio
            if (!sections.description) {
                const descEl = document.querySelector('#offer_description, .offer-description');
                if (descEl) {
                    sections.description = descEl.innerText.trim().substring(0, 8000);
                } else if (offerBlock) {
                    // Clonar el bloque de oferta y remover elementos no-texto
                    const clone = offerBlock.cloneNode(true);
                    clone.querySelectorAll([
                        'script', 'style', 'noscript', 'iframe',
                        '.b_primary', '.b_heart', '.posSticky_m',
                        '.menu_switch', 'nav', '.box_info',
                        'form', '.modal', '.popup'
                    ].join(', ')).forEach(n => n.remove());
                    sections.description = clone.innerText.trim().substring(0, 8000);
                }
            }

            // 9. Intentar extraer sub-secciones por encabezados dentro del contenido
            const fullDescText = sections.description || '';
            const sectionPatterns = [
                { key: 'responsibilities', patterns: ['responsabilidades', 'funciones del cargo', 'funciones principales', 'actividades principales', 'funciones:', 'principales retos', 'tus principales retos'] },
                { key: 'benefits', patterns: ['beneficios', 'compensación', 'compensacion', 'te ofrecemos', 'ofrecemos:', 'qué ofrecemos', 'que ofrecemos'] },
            ];
            for (const sp of sectionPatterns) {
                for (const pat of sp.patterns) {
                    const idx = fullDescText.toLowerCase().indexOf(pat);
                    if (idx !== -1) {
                        let endIdx = fullDescText.length;
                        const afterStart = idx + pat.length;
                        for (const sp2 of sectionPatterns) {
                            if (sp2.key === sp.key) continue;
                            for (const pat2 of sp2.patterns) {
                                const nextIdx = fullDescText.toLowerCase().indexOf(pat2, afterStart);
                                if (nextIdx !== -1 && nextIdx < endIdx) endIdx = nextIdx;
                            }
                        }
                        const reqIdx = fullDescText.toLowerCase().indexOf('requerimientos', afterStart);
                        if (reqIdx !== -1 && reqIdx < endIdx) endIdx = reqIdx;
                        const perfIdx = fullDescText.toLowerCase().indexOf('perfil que buscamos', afterStart);
                        if (perfIdx !== -1 && perfIdx < endIdx) endIdx = perfIdx;

                        const sectionText = fullDescText.substring(idx, Math.min(endIdx, idx + 3000)).trim();
                        if (sectionText.length > 10 && !sections[sp.key]) {
                            sections[sp.key] = sectionText;
                        }
                        break;
                    }
                }
            }

            // Fallback regex extraction from description text
            if (fullDescText) {
                if (!quick_facts.salary) {
                    const match = fullDescText.match(/(?:salario|sueldo):\\s*([^\\n\\r]{5,60})/i);
                    if (match) quick_facts.salary = match[1].trim();
                }
                if (!quick_facts.contract) {
                    const match = fullDescText.match(/(?:tipo de contrato|contrato):\\s*([^\\n\\r]{5,60})/i);
                    if (match) quick_facts.contract = match[1].trim();
                }
                if (!quick_facts.schedule) {
                    const match = fullDescText.match(/(?:horario|jornada):\\s*([^\\n\\r]{5,60})/i);
                    if (match) quick_facts.schedule = match[1].trim();
                }
                if (!quick_facts.location) {
                    const match = fullDescText.match(/(?:lugar de trabajo|ubicación|ubicacion|dirección|direccion):\\s*([^\\n\\r]{5,60})/i);
                    if (match) quick_facts.location = match[1].trim();
                }
                if (!quick_facts.modality) {
                    const lowerDesc = fullDescText.toLowerCase();
                    if (lowerDesc.includes('teletrabajo') || lowerDesc.includes('100% remoto') || lowerDesc.includes('trabajo remoto') || lowerDesc.includes('remoto full')) {
                        quick_facts.modality = 'Remoto';
                    } else if (lowerDesc.includes('híbrido') || lowerDesc.includes('hibrido')) {
                        quick_facts.modality = 'Híbrido';
                    } else if (lowerDesc.includes('presencial') || lowerDesc.includes('modalidad presencial') || lowerDesc.includes('trabajo en oficina')) {
                        quick_facts.modality = 'Presencial';
                    } else if (lowerDesc.includes('trabajo en casa') || lowerDesc.includes('home office')) {
                        quick_facts.modality = 'Remoto';
                    }
                }
            }

            return {
                text: fallbackText.substring(0, 15000),
                quick_facts: quick_facts,
                sections: sections
            };
        }''')
    except Exception as e:
        print(f"  [Browser] Error inyectando script de extraccion: {e}")
        job_details = {"text": "", "quick_facts": {}, "sections": {}}

    desc_text = job_details.get("text", "")
    job["description"] = desc_text
    job["quick_facts"] = job_details.get("quick_facts", {})
    job["sections"] = job_details.get("sections", {})

    # ── Debug log: JSON completo de la oferta ──
    import json as _json_debug
    print(f"[JSON OFERTA] {_json_debug.dumps(job, ensure_ascii=False, indent=2)}")

    print(f"  [Browser] Generando resumen IA de la oferta...")
    from bot.ai_responder import summarize_job
    job["ai_summary"] = summarize_job(job["title"], job["company"], desc_text, job["quick_facts"])

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

        # --- Caso A: Detect "Ya aplicaste a esta oferta" message ---
        # After clicking apply, Computrabajo may show a duplicate message
        # instead of the application form. Detect and return sentinel.
        try:
            already_msg = page.locator(
                "text='Ya aplicaste a esta oferta',"
                "text='Ya te postulaste a esta oferta',"
                "text='ya aplicaste',"
                ":has-text('Ya aplicaste a esta oferta')"
            )
            if await already_msg.count() > 0:
                print(f"  [Browser] Oferta ya aplicada anteriormente en Computrabajo")
                await _emit_review_request(job, page, {}, [])
                return "already_applied", {}
        except Exception:
            pass  # Continue with normal flow if detection fails

        # ── Detect question fields accurately (includes text, select, radio, checkbox) ───────
        questions_raw = await page.evaluate('''() => {
            const results = [];
            const processedNames = new Set();
            const els = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
            
            // Helper: find the group label for a radio/checkbox by walking up the DOM
            function findGroupLabel(el) {
                // Strategy: walk up through parent containers looking for a label/heading
                // that is NOT inside a radio option label
                let node = el.parentElement;
                for (let depth = 0; depth < 6 && node; depth++) {
                    // Look for a clear heading/label in this container
                    const candidates = node.querySelectorAll(':scope > label.mbB, :scope > p.mbB, :scope > h3, :scope > .form-label, :scope > label:not([for]), :scope > p:first-child, :scope > legend');
                    for (const c of candidates) {
                        // Skip if this element CONTAINS a radio/checkbox input (it's an option label, not group label)
                        if (c.querySelector('input[type="radio"], input[type="checkbox"]')) continue;
                        const txt = c.innerText.trim();
                        if (txt && txt.length > 2) return txt;
                    }
                    node = node.parentElement;
                }
                return '';
            }
            
            els.forEach(el => {
                let type = el.tagName.toLowerCase();
                let isSelect = false;
                if (type === 'select') isSelect = true;
                
                if (type === 'input') {
                    type = el.type.toLowerCase();
                    if (['text', 'number', 'email', 'tel', 'password', 'url'].includes(type)) type = 'text';
                    if (!['text', 'radio', 'checkbox'].includes(type) && !el.placeholder) return;
                }
                
                // Blocklist for search fields and non-question inputs
                const nameAttr = (el.name || "").toLowerCase();
                const idAttr = (el.id || "").toLowerCase();
                if (
                    nameAttr.includes("search") || idAttr.includes("search") ||
                    nameAttr === "q" || nameAttr === "query" ||
                    nameAttr === "prof-cat-search-input" ||
                    nameAttr === "place-search-input"
                ) return;
                
                if (type === 'radio' || type === 'checkbox') {
                    const name = el.name;
                    if (!name || processedNames.has(name)) return;
                    processedNames.add(name);
                    
                    // Find group label (NOT the option label)
                    let qText = findGroupLabel(el);
                    
                    const siblings = document.querySelectorAll(`input[type="${type}"][name="${name}"]`);
                    const options = [];
                    siblings.forEach(sib => {
                        let optLabel = '';
                        const sibL = sib.id ? document.querySelector(`label[for="${sib.id}"]`) : null;
                        if (sibL) optLabel = sibL.innerText.trim();
                        else if (sib.closest('label')) optLabel = sib.closest('label').innerText.trim();
                        // Clean: remove the group label text from option labels
                        if (qText) optLabel = optLabel.replace(qText, '').trim();
                        // Use visible label, fall back to value (skip pure numeric internal values like "0", "1")
                        const finalLabel = optLabel || (sib.value && !/^\\d+$/.test(sib.value) ? sib.value : '');
                        if (finalLabel) options.push(finalLabel);
                    });
                    results.push({ text: qText || name, type, options, name, id: null });
                } else {
                    // Text, select, textarea: use standard label lookup
                    let qText = '';
                    const labelId = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
                    if (labelId) qText = labelId.innerText.trim();
                    if (!qText && el.closest('label')) qText = el.closest('label').innerText.trim();
                    if (!qText && el.placeholder) qText = el.placeholder;
                    if (!qText) {
                        const container = el.closest('.application-question, .form-group, section, div.mbB, div');
                        if (container) {
                            const groupLabel = container.querySelector('label.mbB, p.mbB, h3, .form-label');
                            if (groupLabel) qText = groupLabel.innerText.trim();
                            else qText = container.innerText.split('\\n')[0].trim();
                        }
                    }
                    
                    if (isSelect) {
                        const name = el.name || el.id;
                        const options = Array.from(el.options).filter(o => o.value).map(o => o.text.trim());
                        results.push({ text: qText || name, type: 'select', options, name, id: el.id });
                    } else {
                        if (!el.name && !el.id) el.setAttribute('data-bot-id', 'q_' + Math.random().toString(36).substr(2, 9));
                        const name = el.name || el.id || el.getAttribute('data-bot-id');
                        results.push({ text: qText || name, type: 'text', options: [], name, id: el.id || el.getAttribute('data-bot-id') });
                    }
                }
            });
            return results;
        }''')

        q_count = len(questions_raw)
        questions_to_ask = []
        for q in questions_raw:
            q_text = q['text']
            if q['type'] in ['select', 'radio', 'checkbox']:
                q_text += f" ({q['type']}, Opciones: {', '.join(q['options'])})"
            questions_to_ask.append(q_text)

        # ── Log detected questions ──────────────
        if questions_to_ask:
            print("[PREGUNTAS DETECTADAS]")
            for idx, q in enumerate(questions_raw):
                tipo = q.get('type', '?')
                opts = q.get('options', [])
                opts_str = f", opciones: {', '.join(opts)}" if opts else ""
                print(f"  {idx+1}. {q['text']} (tipo: {tipo}{opts_str})")

            # Emit structured marker so dashboard shows questions immediately
            import json as _json_qd
            qd_payload = {
                "type": "questions_detected",
                "job_title": job.get("title", ""),
                "company": job.get("company", ""),
                "questions": [
                    {"text": q["text"], "type": q.get("type", "text"), "options": q.get("options", [])}
                    for q in questions_raw
                ]
            }
            print(f"[QUESTIONS_DETECTED]{_json_qd.dumps(qd_payload, ensure_ascii=False)}")
            sys.stdout.flush()

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

        # ── Process each question ──────────
        for i, q in enumerate(questions_raw):
            question_text = questions_to_ask[i]
            
            # Resolve answer from batch or fallback
            if question_text in batch_answers:
                answer_data = batch_answers[question_text]
                model_used = model_used_for_batch
            else:
                answer_data_raw, model_used = answer_question(
                    question_text, job_title=job["title"], company=job["company"]
                )
                if isinstance(answer_data_raw, dict):
                    answer_data = answer_data_raw
                else:
                    answer_data = {"respuesta": str(answer_data_raw), "tipo": "fallback", "confianza": "media"}

            if isinstance(answer_data, dict):
                ai_answer = answer_data.get("respuesta", "")
                tipo = answer_data.get("tipo", "desconocido")
                confianza = answer_data.get("confianza", "media")
            else:
                ai_answer = str(answer_data)
                tipo = "legacy"
                confianza = "media"

            # ── Missing Data: pause and request from user ──
            if "DATO_FALTANTE" in str(ai_answer) or confianza == "baja":
                import json as _json_missing
                
                # Fetch original options if it was a select/radio
                orig_options = []
                orig_type = "text"
                for q_obj in questions_to_ask:
                    if q_obj.get("question") == question_text:
                        orig_options = q_obj.get("options", [])
                        orig_type = q_obj.get("type", "text")
                        break

                missing_marker = {
                    "type": "missing_data",
                    "question": question_text,
                    "job_title": job.get("title", ""),
                    "company": job.get("company", ""),
                    "current_answer": str(ai_answer),
                    "confianza": confianza,
                    "input_type": orig_type,
                    "options": orig_options
                }
                print(f"[MISSING_DATA]{_json_missing.dumps(missing_marker, ensure_ascii=False)}")
                print(f"  [WARN] Dato faltante para: '{question_text}' (confianza: {confianza})")
                print(f"  [WARN] Esperando respuesta del usuario (max 5 min)...")
                sys.stdout.flush()

                # Poll for user response via file IPC
                ipc_dir = Path(__file__).parent.parent / ".semi_auto"
                ipc_dir.mkdir(exist_ok=True)
                missing_resp_file = ipc_dir / "missing_response.json"
                if missing_resp_file.exists():
                    missing_resp_file.unlink()

                max_wait_missing = 300  # 5 minutes
                waited_missing = 0
                user_provided = None
                while waited_missing < max_wait_missing:
                    await asyncio.sleep(2)
                    waited_missing += 2
                    if waited_missing % 30 == 0:
                        print(f"  [WARN] Esperando dato... ({waited_missing}s / {max_wait_missing}s)")
                    if missing_resp_file.exists():
                        try:
                            resp = _json_missing.loads(missing_resp_file.read_text(encoding="utf-8"))
                            user_provided = resp.get("answer", "")
                            missing_resp_file.unlink()
                        except Exception:
                            pass
                        break

                if user_provided is not None and user_provided.strip():
                    ai_answer = user_provided
                    tipo = "usuario_directo"
                    confianza = "alta"
                    print(f"  [OK] Usuario proporciono dato: '{ai_answer[:60]}...'")
                else:
                    # Timeout or no answer: leave empty, log
                    if "DATO_FALTANTE" in str(ai_answer):
                        ai_answer = ""
                    print(f"  [WARN] Sin respuesta del usuario. Continuando sin dato para: '{question_text}'")
                    tipo = "dato_faltante"

            # Store enriched answer
            answers[question_text] = {
                "answer": ai_answer,
                "model": model_used,
                "tipo": tipo,
                "confianza": confianza,
            }
            conf_icon = {"alta": "[OK]", "media": "[~]", "baja": "[!]"}.get(confianza, "[?]")
            print(f"    - {conf_icon} '{question_text[:60]}...' [{model_used}] ({tipo})")

        # ── In dry-run-llm, stop here -- don't upload CV or submit ──
        # Caso B: sin cuestionario -> proceso completo, se registra como 'applied'
        # Caso C: con cuestionario -> respuestas LLM sin enviar, se registra como 'dry-run'
        if mode == "dry-run-llm":
            if answers:
                print(f"  [DRY-RUN-LLM] Respuestas recopiladas sin enviar formulario.")
            else:
                print(f"  [DRY-RUN-LLM] Sin cuestionario - proceso completado.")
            await _emit_review_request(job, page, answers, questions_raw)
            return True, answers

        # ── Emit review request for ALL modes ──
        review_data = await _emit_review_request(job, page, answers, questions_raw)

        # ── Semi-auto: wait for user review ──
        if mode == "semi-auto" and answers:
            import json as _json

            ipc_dir = Path(__file__).parent.parent / ".semi_auto"
            ipc_dir.mkdir(exist_ok=True)
            req_file = ipc_dir / "request.json"
            res_file = ipc_dir / "response.json"

            # Clean any previous response
            if res_file.exists():
                res_file.unlink()

            req_file.write_text(_json.dumps(review_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print("  [SEMI-AUTO] Esperando revision del usuario en el dashboard...")

            # Poll for response (check every 2 seconds, timeout 10 minutes)
            max_wait = 600
            waited = 0
            user_response = None
            while waited < max_wait:
                await asyncio.sleep(2)
                waited += 2
                if waited % 30 == 0:
                    print(f"  [SEMI-AUTO] Esperando respuesta... ({waited}s)")
                if res_file.exists():
                    try:
                        user_response = _json.loads(res_file.read_text(encoding="utf-8"))
                        res_file.unlink()
                    except Exception:
                        pass
                    break

            if user_response is None:
                print("  [SEMI-AUTO] Timeout esperando respuesta. Saltando oferta.")
                return False, answers

            if not user_response.get("approved", False):
                print("  [SEMI-AUTO] Aplicacion rechazada por el usuario.")
                return False, answers

            # Apply user edits
            edited = user_response.get("edited_answers", {})
            selected_cv = user_response.get("cv", None)

            for q_text, new_answer in edited.items():
                if q_text in answers:
                    old = answers[q_text].get("answer", "")
                    if new_answer != old:
                        answers[q_text]["answer"] = new_answer
                        answers[q_text]["tipo"] = "editada_usuario"
                        answers[q_text]["confianza"] = "alta"
                        print(f"    [EDIT] '{q_text[:50]}...' editada por usuario")

            print(f"  [SEMI-AUTO] Respuestas aplicadas ({len(edited)} editadas).")

            # Override CV if user selected one
            if selected_cv:
                from bot.config import get_cv_path
                alt_cv = get_cv_path(selected_cv)
                if alt_cv and alt_cv.exists():
                    active_cv_override = alt_cv
                else:
                    active_cv_override = None
            else:
                active_cv_override = None
        else:
            active_cv_override = None

        # ── Fill form fields ──
        print(f"  [Browser] Llenando {q_count} campos del formulario...")
        for i, q in enumerate(questions_raw):
            q_text = questions_to_ask[i]
            if q_text in answers:
                try:
                    answer_val = str(answers[q_text].get("answer", ""))
                    if not answer_val or answer_val.upper() == "DATO_FALTANTE":
                        continue
                        
                    if q["type"] == "text":
                        selector = f"#{q['id']}" if q.get("id") else f"[name='{q['name']}']" if q.get("name") else f"[data-bot-id='{q.get('id', '')}']"
                        await page.locator(selector).first.fill(answer_val)
                        
                    elif q["type"] == "select":
                        selector = f"#{q['id']}" if q.get("id") else f"[name='{q['name']}']"
                        try:
                            await page.locator(selector).first.select_option(label=answer_val)
                        except Exception:
                            # Intento extra relajado con javascript
                            await page.evaluate(f'''([sel, val]) => {{
                                const el = document.querySelector(sel);
                                if (!el) return;
                                for (let i=0; i<el.options.length; i++) {{
                                    if (el.options[i].text.includes(val) || val.includes(el.options[i].text)) {{
                                        el.selectedIndex = i;
                                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                        break;
                                    }}
                                }}
                            }}''', [selector, answer_val])
                            
                    elif q["type"] == "radio":
                        await page.evaluate(f'''([name, val]) => {{
                            const radios = document.querySelectorAll(`input[type="radio"][name="${{name}}"]`);
                            for (const r of radios) {{
                                const label = r.id ? document.querySelector(`label[for="${{r.id}}"]`) : r.closest('label');
                                const labelText = label ? label.innerText.trim() : r.value;
                                if (labelText.includes(val) || val.includes(labelText) || r.value === val) {{
                                    r.click();
                                    break;
                                }}
                            }}
                        }}''', [q["name"], answer_val])
                        
                    elif q["type"] == "checkbox":
                        vals = [v.strip() for v in answer_val.split(',')]
                        await page.evaluate(f'''([name, vals]) => {{
                            const checks = document.querySelectorAll(`input[type="checkbox"][name="${{name}}"]`);
                            for (const c of checks) {{
                                const label = c.id ? document.querySelector(`label[for="${{c.id}}"]`) : c.closest('label');
                                const labelText = label ? label.innerText.trim() : c.value;
                                const shouldBeChecked = vals.some(v => labelText.includes(v) || v.includes(labelText) || c.value === v);
                                if (shouldBeChecked !== c.checked) c.click();
                            }}
                        }}''', [q["name"], vals])
                    
                    await human_delay(0.3, 0.8)
                    print(f"    [OK] Campo {i+1} llenado: '{q_text[:40]}...'")
                except Exception as e:
                    print(f"    [!] Error llenando campo {i+1}: {e}")

        # ── Upload CV ──
        cv_to_use = active_cv_override or CV_PATH
        if cv_to_use.exists():
            file_input = page.locator("input[type='file']")
            if await file_input.count() > 0:
                await file_input.first.set_input_files(str(cv_to_use))
                await human_delay(1, 2)
                print(f"  [Browser] CV adjuntado: {cv_to_use.name}")

        # ── Submit application ──────────────────────────────
        print("  [Browser] Buscando boton de enviar...")
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
            print("  [Browser] No se encontro boton de confirmacion")
            return False, answers

    except Exception as e:
        print(f"  [Browser] Error aplicando: {e}")
        await screenshot_on_error(page, f"apply_{job.get('company', 'unknown')}")
        return False, answers


async def _emit_review_request(job: dict, page, answers: dict, questions: list = None) -> dict:
    """Emit a REVIEW_REQUEST marker to stdout so bot_runner broadcasts it.
    Works in ALL modes so the dashboard always shows current offer."""
    import json as _json

    review_data = {
        "type": "review_request",
        "job": {
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "salary": job.get("salary", ""),
            "url": job.get("url", ""),
            "description": job.get("description", ""),
            "ai_summary": job.get("ai_summary", ""),
            "quick_facts": job.get("quick_facts", {}),
            "sections": job.get("sections", {}),
        },
        "answers": answers,
        "questions": questions or []
    }

    # Print the JSON marker so bot_runner broadcasts it to WebSocket clients
    print(f"[REVIEW_REQUEST]{_json.dumps(review_data, ensure_ascii=False)}")
    sys.stdout.flush()
    return review_data

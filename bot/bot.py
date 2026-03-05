"""
Computrabajo Job Application Bot — Main Orchestrator

Usage:
    python -m bot.bot                          # Modo apply (default)
    python -m bot.bot --mode dry-run-llm       # Prueba LLM sin aplicar
    python -m bot.bot --mode semi-auto         # Revisión humana antes de enviar
    python -m bot.bot --max 5                  # Limita a 5 aplicaciones
    python -m bot.bot --keyword "mecatrónica"  # Keyword específica
    python -m bot.bot --report                 # Genera reporte sin ejecutar bot
    python -m bot.bot --summary                # Resumen rápido en terminal
    python -m bot.bot --cv tecnico             # Fuerza uso de CV técnico

Requirements:
    pip install playwright google-generativeai python-dotenv
    playwright install chromium
"""

import asyncio
import sys
import random
import argparse
import logging
from datetime import datetime
from pathlib import Path

# ── Fix Windows CP1252 crash: force UTF-8 on stdout/stderr ──
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass  # already UTF-8 or reconfigure not available

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(Path(__file__).parent / "bot.log", encoding="utf-8"),
    ]
)
logger = logging.getLogger(__name__)

# Valid execution modes
VALID_MODES = ["apply", "dry-run-llm", "semi-auto"]


def parse_args():
    parser = argparse.ArgumentParser(description="Computrabajo Job Bot")
    parser.add_argument("--mode", type=str, default="apply", choices=VALID_MODES,
                        help="Modo de ejecución: apply (default), dry-run-llm, semi-auto")
    parser.add_argument("--dry-run", action="store_true",
                        help="Alias de --mode dry-run-llm (compatibilidad)")
    parser.add_argument("--summary", action="store_true",
                        help="Mostrar estadísticas de aplicaciones")
    parser.add_argument("--keyword", type=str, default=None,
                        help="Buscar solo esta keyword específica")
    parser.add_argument("--max", type=int, default=None,
                        help="Máximo de aplicaciones en este run")
    parser.add_argument("--report", action="store_true",
                        help="Generar informe HTML de todas las aplicaciones")
    parser.add_argument("--cv", type=str, default=None,
                        help="Perfil de CV a usar: general, tecnico, ingles")
    return parser.parse_args()


async def run_bot(mode: str = "apply", specific_keyword: str = None,
                  max_apps: int = None, cv_profile: str = None):
    """Main bot execution loop."""
    from playwright.async_api import async_playwright
    from bot.config import (
        CT_EMAIL, CT_PASSWORD, SEARCH_KEYWORDS,
        SEARCH_LOCATIONS, MAX_APPLICATIONS_PER_RUN,
        CV_PATH, get_cv_path
    )
    from bot.browser import (
        launch_browser, login, search_jobs_paginated,
        apply_to_job, human_delay, rest_break
    )

    # Check credentials
    if not CT_EMAIL or not CT_PASSWORD:
        print("\n[ERROR] Credenciales no configuradas.")
        print("Crea un archivo .env en c:/Users/ramir/Desktop/computrabajo/ con:")
        print("  CT_EMAIL=tu_email@gmail.com")
        print("  CT_PASSWORD=tu_contraseña_de_computrabajo")
        print("  GEMINI_API_KEY=tu_api_key  (opcional — activa respuestas IA)")
        return

    init_db()
    limit = max_apps or MAX_APPLICATIONS_PER_RUN
    keywords = [specific_keyword] if specific_keyword else list(SEARCH_KEYWORDS)

    # Randomize keyword order each session (anti-pattern detection)
    if not specific_keyword:
        random.shuffle(keywords)

    # Resolve CV path
    active_cv = get_cv_path(cv_profile) if cv_profile else CV_PATH

    # Load blacklist from config
    try:
        from bot.config import BLACKLISTED_COMPANIES
        blacklist = [b.lower().strip() for b in BLACKLISTED_COMPANIES]
    except (ImportError, AttributeError):
        blacklist = []

    # Mode labels
    mode_labels = {
        "apply": "MODO ACTIVO",
        "dry-run-llm": "DRY-RUN LLM (sin enviar)",
        "semi-auto": "SEMI-AUTO (revision humana)",
    }

    print("\n" + "=" * 60)
    print(f"  COMPUTRABAJO BOT  --  {mode_labels.get(mode, mode.upper())}")
    print(f"  Keywords: {keywords}")
    print(f"  Ubicaciones: {SEARCH_LOCATIONS}")
    print(f"  Limite por sesion: {limit} aplicaciones")
    print(f"  CV: {active_cv.name}")
    if blacklist:
        print(f"  Blacklist: {blacklist}")
    print("=" * 60)

    applied_count = 0
    consecutive_errors = 0
    rest_counter = 0
    # How many apps between rest breaks (randomized per session)
    rest_interval = random.randint(3, 5)

    try:
        async with async_playwright() as playwright:
            browser, page = await launch_browser(playwright)

            # Login
            logged_in = await login(page)
            if not logged_in:
                print("\n[ERROR] No se pudo iniciar sesion. Verifica tus credenciales.")
                await browser.close()
                return

            # Process each keyword across all locations
            for keyword in keywords:
                if applied_count >= limit:
                    print(f"\n  Limite de {limit} aplicaciones alcanzado.")
                    break

                for location in SEARCH_LOCATIONS:
                    if applied_count >= limit:
                        break

                    jobs = await search_jobs_paginated(page, keyword, location, max_pages=2)

                    print(f"\n  Procesando {len(jobs)} ofertas para '{keyword}' en '{location}'...")

                    for job in jobs:
                        if applied_count >= limit:
                            break

                        # Auto-pause after 3 consecutive errors
                        if consecutive_errors >= 3:
                            print("\n  [!] 3 errores consecutivos. Pausando 60s...")
                            await asyncio.sleep(60)
                            consecutive_errors = 0

                        url = job.get("url", "")
                        if not url:
                            continue

                        # Blacklist filter
                        company_lower = job.get("company", "").lower()
                        title_lower = job.get("title", "").lower()
                        if any(b in company_lower or b in title_lower for b in blacklist):
                            print(f"  [SKIP] Blacklisted: {job['title']} @ {job['company']}")
                            continue

                        # In dry-run-llm mode, don't skip already-applied jobs
                        if mode != "dry-run-llm":
                            if already_applied(url):
                                print(f"  [SKIP] Ya aplicado: {job['title']}")
                                continue
                            if already_skipped(url):
                                continue

                        print(f"\n  -> {job['title']} @ {job['company']}")
                        print(f"    {job['location']} | {job['salary']}")
                        print(f"    {url}")

                        # Apply (mode-aware)
                        success, answers = await apply_to_job(page, job, mode=mode)

                        if mode == "dry-run-llm":
                            log_application(
                                job_title=job["title"],
                                company=job["company"],
                                url=url,
                                location=job.get("location", ""),
                                salary=job.get("salary", ""),
                                answers=answers,
                                status="dry-run",
                                mode=mode,
                                cv_used=active_cv.name,
                            )
                            applied_count += 1
                            consecutive_errors = 0
                        elif success:
                            log_application(
                                job_title=job["title"],
                                company=job["company"],
                                url=url,
                                location=job.get("location", ""),
                                salary=job.get("salary", ""),
                                answers=answers,
                                status="applied",
                                mode=mode,
                                cv_used=active_cv.name,
                            )
                            applied_count += 1
                            consecutive_errors = 0
                        else:
                            log_application(
                                job_title=job["title"],
                                company=job["company"],
                                url=url,
                                status="error",
                                mode=mode,
                                cv_used=active_cv.name,
                                notes="Fallo la aplicacion automatica"
                            )
                            log_skip(url, "error")
                            consecutive_errors += 1

                        # Rest break every N applications
                        rest_counter += 1
                        if rest_counter >= rest_interval:
                            await rest_break()
                            rest_counter = 0
                            rest_interval = random.randint(3, 5)
                        else:
                            await human_delay()

    except asyncio.CancelledError:
        print("\n  [!] Ejecución cancelada (tareas asíncronas).")
    except Exception as e:
        print(f"\n  [!] Error inesperado durante la ejecución: {e}")
    finally:
        # Final summary — ALWAYS generate report (even on Ctrl+C)
        print("\n" + "=" * 60)
        print(f"  Sesión finalizada: {applied_count} aplicaciones procesadas (modo: {mode})")
        from bot.job_tracker import print_summary, generate_report
        print_summary()
        report_path = generate_report()
        print(f"  [REPORT] Abre el informe en tu navegador: {report_path}")
        print("=" * 60)


def show_summary():
    from bot.job_tracker import init_db, print_summary, get_connection
    init_db()
    print("\n=== Historial de Aplicaciones ===")
    print_summary()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT job_title, company, status, applied_at FROM applications "
            "ORDER BY applied_at DESC LIMIT 20"
        ).fetchall()
        if rows:
            print("\nÚltimas 20 aplicaciones:")
            for r in rows:
                print(f"  [{r['status']:7}] {r['applied_at'][:16]}  "
                      f"{r['job_title'][:40]} @ {r['company'][:25]}")
        else:
            print("  Sin aplicaciones registradas aún.")


def main():
    args = parse_args()

    if args.summary:
        show_summary()
        return

    if args.report:
        from bot.job_tracker import init_db, generate_report
        init_db()
        report_path = generate_report()
        print(f"  [REPORT] Informe generado: {report_path}")
        return

    # Resolve mode (--dry-run is alias for --mode dry-run-llm)
    mode = args.mode
    if args.dry_run:
        mode = "dry-run-llm"

    try:
        asyncio.run(run_bot(
            mode=mode,
            specific_keyword=args.keyword,
            max_apps=args.max,
            cv_profile=args.cv
        ))
    except KeyboardInterrupt:
        print("\n[!] Bot detenido manualmente por el usuario (Ctrl+C).")
        # Generate report even on manual stop
        try:
            from bot.job_tracker import init_db, generate_report
            init_db()
            report_path = generate_report()
            print(f"  [REPORT] Informe generado antes de cerrar: {report_path}")
        except Exception:
            pass


if __name__ == "__main__":
    main()

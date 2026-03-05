"""
Job Application Tracker – SQLite database
Logs every application attempt with status, AI-generated answers,
mode used, CV profile, and enriched metadata (tipo, confianza).
"""
import sqlite3
import json
import sys
import io
from datetime import datetime
from pathlib import Path
from bot.config import DB_PATH


def _safe_print(msg: str):
    """Print that always works regardless of terminal encoding (CP1252, UTF-8, etc.)."""
    try:
        print(msg)
    except UnicodeEncodeError:
        # Fallback: encode to bytes replacing unknown chars, then write to buffer
        sys.stdout.buffer.write((msg + "\n").encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist and migrate schema."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                job_title   TEXT NOT NULL,
                company     TEXT,
                url         TEXT UNIQUE,
                location    TEXT,
                salary      TEXT,
                applied_at  TEXT DEFAULT (datetime('now','localtime')),
                status      TEXT DEFAULT 'applied',  -- applied | skipped | error | dry-run
                answers_json TEXT,                   -- JSON of Q&A pairs
                notes       TEXT,
                mode        TEXT DEFAULT 'apply',     -- apply | dry-run-llm | semi-auto
                cv_used     TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS skipped_jobs (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                url       TEXT UNIQUE,
                reason    TEXT,
                seen_at   TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.commit()

        # Safe migration: add columns if missing
        existing_cols = {
            row[1] for row in conn.execute("PRAGMA table_info(applications)").fetchall()
        }
        migrations = {
            "mode":     "ALTER TABLE applications ADD COLUMN mode TEXT DEFAULT 'apply'",
            "cv_used":  "ALTER TABLE applications ADD COLUMN cv_used TEXT",
        }
        for col_name, sql in migrations.items():
            if col_name not in existing_cols:
                try:
                    conn.execute(sql)
                    conn.commit()
                except sqlite3.OperationalError:
                    pass


def already_applied(url: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM applications WHERE url = ? AND status != 'dry-run'", (url,)
        ).fetchone()
        return row is not None


def already_skipped(url: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM skipped_jobs WHERE url = ?", (url,)
        ).fetchone()
        return row is not None


def log_application(job_title: str, company: str, url: str,
                    location: str = "", salary: str = "",
                    answers: dict = None, status: str = "applied",
                    notes: str = "", mode: str = "apply",
                    cv_used: str = ""):
    answers_json = json.dumps(answers, ensure_ascii=False) if answers else None
    with get_connection() as conn:
        if status == "dry-run":
            conn.execute("""
                INSERT INTO applications
                  (job_title, company, url, location, salary, status, answers_json, notes, mode, cv_used)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(url) DO UPDATE SET
                  answers_json = excluded.answers_json,
                  status = excluded.status,
                  mode = excluded.mode,
                  cv_used = excluded.cv_used,
                  notes = excluded.notes,
                  applied_at = datetime('now','localtime')
            """, (job_title, company, url, location, salary, status, answers_json,
                  notes, mode, cv_used))
        else:
            conn.execute("""
                INSERT OR IGNORE INTO applications
                  (job_title, company, url, location, salary, status, answers_json, notes, mode, cv_used)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (job_title, company, url, location, salary, status, answers_json,
                  notes, mode, cv_used))
        conn.commit()

    status_icon = {"applied": "[OK]", "error": "[ERR]", "dry-run": "[DRY]"}.get(status, "[*]")
    # ✅ FIX: usar _safe_print para evitar UnicodeEncodeError en CP1252
    _safe_print(f"  [DB] {status_icon} Registrado: {job_title} @ {company} -- {status}")


def log_skip(url: str, reason: str):
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO skipped_jobs (url, reason) VALUES (?, ?)",
            (url, reason)
        )
        conn.commit()


def get_summary() -> dict:
    with get_connection() as conn:
        total    = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
        applied  = conn.execute("SELECT COUNT(*) FROM applications WHERE status='applied'").fetchone()[0]
        errors   = conn.execute("SELECT COUNT(*) FROM applications WHERE status='error'").fetchone()[0]
        dry_runs = conn.execute("SELECT COUNT(*) FROM applications WHERE status='dry-run'").fetchone()[0]
    return {"total": total, "applied": applied, "errors": errors, "dry_runs": dry_runs}


def print_summary():
    s = get_summary()
    _safe_print(f"\n  Aplicaciones totales: {s['total']}")
    _safe_print(f"  Exitosas: {s['applied']}  |  Errores: {s['errors']}  |  Dry-runs: {s['dry_runs']}")


def generate_report(output_path: str = None) -> str:
    """Generate a comprehensive HTML report of all applications."""
    if output_path is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = str(Path(__file__).parent / f"informe_{timestamp}.html")

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT job_title, company, url, location, salary, applied_at, "
            "status, answers_json, notes, mode, cv_used "
            "FROM applications ORDER BY applied_at DESC"
        ).fetchall()

    # Stats
    total    = len(rows)
    applied  = sum(1 for r in rows if r['status'] == 'applied')
    errors   = sum(1 for r in rows if r['status'] == 'error')
    dry_runs = sum(1 for r in rows if r['status'] == 'dry-run')

    # Model stats & Q&A collection
    model_counts = {}
    qa_by_job = {}
    warnings = []

    for r in rows:
        job_id = f"{r['job_title']}@{r['company']}"
        if r['answers_json']:
            try:
                answers = json.loads(r['answers_json'])
            except json.JSONDecodeError:
                continue

            if answers and job_id not in qa_by_job:
                qa_by_job[job_id] = {
                    'job': r['job_title'],
                    'company': r['company'],
                    'url': r['url'],
                    'status': r['status'] or 'unknown',
                    'applied_at': r['applied_at'],
                    'questions': []
                }

            for q, a_data in answers.items():
                if isinstance(a_data, dict):
                    model      = a_data.get('model', 'desconocido')
                    answer     = a_data.get('answer', '')
                    tipo       = a_data.get('tipo', 'desconocido')
                    confianza  = a_data.get('confianza', 'media')
                else:
                    model     = 'legacy'
                    answer    = str(a_data)
                    tipo      = 'legacy'
                    confianza = 'media'

                model_counts[model] = model_counts.get(model, 0) + 1

                qa_entry = {
                    'question': q,
                    'answer': answer,
                    'model': model,
                    'tipo': tipo,
                    'confianza': confianza,
                }
                qa_by_job[job_id]['questions'].append(qa_entry)

                if tipo in ('dato_faltante', 'pregunta_vacia') or confianza == 'baja':
                    warnings.append({
                        'job': r['job_title'],
                        'company': r['company'],
                        'question': q,
                        'answer': answer,
                        'tipo': tipo,
                        'confianza': confianza
                    })

    now = datetime.now().strftime('%d/%m/%Y %H:%M')

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Bot Computrabajo - {now}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }}
  .container {{ max-width: 1200px; margin: 0 auto; }}
  h1 {{ font-size: 2rem; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem; }}
  .subtitle {{ color: #94a3b8; margin-bottom: 2rem; }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
  .stat-card {{ background: #1e293b; border-radius: 12px; padding: 1.5rem; border: 1px solid #334155; }}
  .stat-card .number {{ font-size: 2.5rem; font-weight: 700; color: #3b82f6; }}
  .stat-card .label {{ color: #94a3b8; font-size: 0.9rem; margin-top: 0.25rem; }}
  .stat-card.success .number {{ color: #22c55e; }}
  .stat-card.error .number {{ color: #ef4444; }}
  .stat-card.model .number {{ color: #a78bfa; font-size: 1.5rem; }}
  .stat-card.dry-run .number {{ color: #38bdf8; }}
  .stat-card.warn .number {{ color: #fbbf24; }}
  .section {{ margin-bottom: 2rem; }}
  .section h2 {{ font-size: 1.3rem; color: #f1f5f9; margin-bottom: 1rem; border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }}
  table {{ width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }}
  th {{ background: #334155; color: #e2e8f0; padding: 0.75rem 1rem; text-align: left; font-weight: 600; font-size: 0.85rem; }}
  td {{ padding: 0.75rem 1rem; border-top: 1px solid #334155; font-size: 0.85rem; vertical-align: top; }}
  tr:hover {{ background: #334155; }}
  .badge {{ display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }}
  .badge-applied {{ background: #166534; color: #bbf7d0; }}
  .badge-error {{ background: #7f1d1d; color: #fecaca; }}
  .badge-dry-run {{ background: #0c4a6e; color: #bae6fd; }}
  .badge-model {{ background: #3730a3; color: #c7d2fe; }}
  .badge-alta {{ background: #166534; color: #bbf7d0; }}
  .badge-media {{ background: #854d0e; color: #fef08a; }}
  .badge-baja {{ background: #7f1d1d; color: #fecaca; }}
  .badge-tipo {{ background: #1e3a5f; color: #7dd3fc; font-size: 0.7rem; }}
  .qa-card {{ background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; }}
  .qa-card .job-name {{ font-weight: 600; color: #60a5fa; margin-bottom: 0.5rem; }}
  .qa-card .question {{ color: #fbbf24; font-weight: 500; margin-bottom: 0.25rem; }}
  .qa-card .answer {{ color: #e2e8f0; line-height: 1.5; }}
  .qa-card .meta {{ color: #64748b; font-size: 0.8rem; margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }}
  .warn-card {{ background: #1c1917; border: 1px solid #f59e0b; border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem; }}
  .warn-card .warn-title {{ color: #fbbf24; font-weight: 600; margin-bottom: 0.25rem; }}
  .warn-card .warn-detail {{ color: #d6d3d1; font-size: 0.85rem; }}
  a {{ color: #60a5fa; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  details {{ background: #1e293b; border: 1px solid #334155; border-radius: 10px; margin-bottom: 1rem; overflow: hidden; }}
  summary {{ background: #334155; padding: 1rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; list-style: none; user-select: none; }}
  summary::-webkit-details-marker {{ display: none; }}
  .details-content {{ padding: 1rem; border-top: 1px solid #334155; }}
</style>
</head>
<body>
<div class="container">
  <h1>Informe Bot Computrabajo</h1>
  <p class="subtitle">Generado: {now}</p>

  <div class="stats">
    <div class="stat-card"><div class="number">{total}</div><div class="label">Total Procesadas</div></div>
    <div class="stat-card success"><div class="number">{applied}</div><div class="label">Exitosas</div></div>
    <div class="stat-card error"><div class="number">{errors}</div><div class="label">Con Error</div></div>
    <div class="stat-card dry-run"><div class="number">{dry_runs}</div><div class="label">Dry-Run LLM</div></div>
    <div class="stat-card model"><div class="number">{sum(len(j['questions']) for j in qa_by_job.values())}</div><div class="label">Preguntas Respondidas</div></div>
    <div class="stat-card warn"><div class="number">{len(warnings)}</div><div class="label">Advertencias</div></div>
  </div>
"""

    # Model usage section
    if model_counts:
        html += """  <div class="section"><h2>Modelos de IA Utilizados</h2><div class="stats">"""
        for model, count in sorted(model_counts.items(), key=lambda x: -x[1]):
            html += f'<div class="stat-card model"><div class="number">{count}x</div><div class="label">{model}</div></div>'
        html += "</div></div>"

    # Warnings section
    if warnings:
        html += '  <div class="section"><h2>Advertencias (confianza baja / dato faltante)</h2>'
        for w in warnings:
            html += f"""<div class="warn-card">
      <div class="warn-title">{w['job']} @ {w['company']}</div>
      <div class="warn-detail">Pregunta: {w['question']}<br>Respuesta: {w['answer']}<br>Tipo: {w['tipo']} | Confianza: {w['confianza']}</div>
    </div>"""
        html += "</div>"

    # Q&A by job section
    if qa_by_job:
        html += '  <div class="section"><h2>Respuestas por Oferta</h2>'
        for job_id, job_data in qa_by_job.items():
            status_badge = f'<span class="badge badge-{job_data["status"]}">{job_data["status"]}</span>'
            html += f"""<details>
    <summary>{job_data['job']} @ {job_data['company']} {status_badge} <span style="color:#64748b;font-size:0.8rem;margin-left:auto">{job_data['applied_at']}</span></summary>
    <div class="details-content">"""
            for qa in job_data['questions']:
                html += f"""<div class="qa-card">
        <div class="question">{qa['question']}</div>
        <div class="answer">{qa['answer']}</div>
        <div class="meta">
          <span class="badge badge-model">{qa['model']}</span>
          <span class="badge badge-tipo">{qa['tipo']}</span>
          <span class="badge badge-{qa['confianza']}">{qa['confianza']}</span>
        </div>
      </div>"""
            html += """</div>
    </details>"""
        html += "</div>"

    html += "</div></body></html>"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    # ✅ FIX: usar _safe_print para evitar UnicodeEncodeError en CP1252
    _safe_print(f"\n  [OK] Informe generado: {output_path}")
    _safe_print(f"  Abre el informe en tu navegador: {output_path}")
    return output_path
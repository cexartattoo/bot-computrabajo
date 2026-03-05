"""
History Routes — CRUD on applications.db, stats, CSV export.
"""
import csv
import io
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pathlib import Path

from dashboard.api.services.auth import get_current_user

router = APIRouter()

DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "bot" / "applications.db"


def _get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@router.get("")
async def list_applications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    company: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(get_current_user),
):
    """List applications with pagination and filters."""
    conn = _get_db()
    conditions = []
    params = []

    if status:
        conditions.append("status = ?")
        params.append(status)
    if company:
        conditions.append("company LIKE ?")
        params.append(f"%{company}%")
    if search:
        conditions.append("(job_title LIKE ? OR company LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if date_from:
        conditions.append("applied_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("applied_at <= ?")
        params.append(date_to + " 23:59:59")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Total count
    total = conn.execute(f"SELECT COUNT(*) FROM applications {where}", params).fetchone()[0]

    # Paginated rows
    offset = (page - 1) * per_page
    rows = conn.execute(
        f"SELECT * FROM applications {where} ORDER BY applied_at DESC LIMIT ? OFFSET ?",
        params + [per_page, offset],
    ).fetchall()

    conn.close()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
        "data": [dict(r) for r in rows],
    }


@router.get("/stats")
async def get_stats(user=Depends(get_current_user)):
    """Application statistics."""
    conn = _get_db()
    total = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
    applied = conn.execute("SELECT COUNT(*) FROM applications WHERE status='applied'").fetchone()[0]
    errors = conn.execute("SELECT COUNT(*) FROM applications WHERE status='error'").fetchone()[0]
    dry_runs = conn.execute("SELECT COUNT(*) FROM applications WHERE status='dry-run'").fetchone()[0]

    now = datetime.now()
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    last_7 = conn.execute("SELECT COUNT(*) FROM applications WHERE applied_at >= ?", [week_ago]).fetchone()[0]
    last_30 = conn.execute("SELECT COUNT(*) FROM applications WHERE applied_at >= ?", [month_ago]).fetchone()[0]
    today_count = conn.execute("SELECT COUNT(*) FROM applications WHERE applied_at >= ?", [today]).fetchone()[0]

    # Top 5 companies
    top_companies = conn.execute(
        "SELECT company, COUNT(*) as cnt FROM applications WHERE company IS NOT NULL "
        "GROUP BY company ORDER BY cnt DESC LIMIT 5"
    ).fetchall()

    # Apps per day (last 14 days)
    daily = conn.execute(
        "SELECT date(applied_at) as day, COUNT(*) as cnt FROM applications "
        "WHERE applied_at >= ? GROUP BY day ORDER BY day",
        [(now - timedelta(days=14)).strftime("%Y-%m-%d")],
    ).fetchall()

    conn.close()

    return {
        "total": total,
        "applied": applied,
        "errors": errors,
        "dry_runs": dry_runs,
        "last_7_days": last_7,
        "last_30_days": last_30,
        "today": today_count,
        "top_companies": [{"company": r[0], "count": r[1]} for r in top_companies],
        "daily": [{"date": r[0], "count": r[1]} for r in daily],
    }


@router.delete("/{app_id}")
async def delete_application(app_id: int, user=Depends(get_current_user)):
    conn = _get_db()
    conn.execute("DELETE FROM applications WHERE id = ?", [app_id])
    conn.commit()
    conn.close()
    return {"deleted": app_id}


@router.post("/dedup")
async def remove_duplicates(user=Depends(get_current_user)):
    conn = _get_db()
    result = conn.execute(
        "DELETE FROM applications WHERE id NOT IN "
        "(SELECT MIN(id) FROM applications GROUP BY url)"
    )
    removed = result.rowcount
    conn.commit()
    conn.close()
    return {"removed": removed}


@router.get("/export")
async def export_csv(
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    conn = _get_db()
    where = "WHERE status = ?" if status else ""
    params = [status] if status else []
    rows = conn.execute(
        f"SELECT id, job_title, company, url, location, status, mode, cv_used, applied_at, notes "
        f"FROM applications {where} ORDER BY applied_at DESC",
        params,
    ).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Cargo", "Empresa", "URL", "Ciudad", "Estado", "Modo", "CV", "Fecha", "Notas"])
    for r in rows:
        writer.writerow(list(r))

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=applications_{datetime.now():%Y%m%d}.csv"},
    )

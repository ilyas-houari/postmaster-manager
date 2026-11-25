import os
import secrets
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(
    title="Postmaster Database API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

def check_key(authorization: str | None):
    expected = os.getenv("POSTMASTER_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=503, detail="API key not configured")

    supplied = ""
    if authorization and authorization.startswith("Bearer "):
        supplied = authorization[7:]

    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")

def db():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        connect_timeout=5,
    )

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats/{domain}")
def stats(
    domain: str,
    days: int = 7,
    authorization: str | None = Header(default=None),
):
    check_key(authorization)

    if days not in (7, 30, 90):
        raise HTTPException(status_code=400, detail="Invalid days")

    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.stat_date, d.data
                FROM daily_stats d
                JOIN domains x ON x.id = d.domain_id
                WHERE x.domain_name = %s
                  AND d.stat_date >= CURRENT_DATE - (%s::int - 1)
                ORDER BY d.stat_date DESC
            """, (domain.lower(), days))

            rows = cur.fetchall()

    return {
        "domain": domain,
        "days": days,
        "stats": [
            {"date": str(day), "metrics": metrics}
            for day, metrics in rows
        ],
    }

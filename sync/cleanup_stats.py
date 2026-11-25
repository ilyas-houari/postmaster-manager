import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

today = datetime.now(timezone.utc).date()
cutoff = today - timedelta(days=90)

with psycopg.connect(
    host=os.getenv("DB_HOST", "localhost"),
    port=os.getenv("DB_PORT", "5432"),
    dbname=os.getenv("DB_NAME", "postmaster_db"),
    user=os.getenv("DB_USER", "postgres"),
    password=os.getenv("DB_PASSWORD"),
) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM daily_stats WHERE stat_date < %s",
            (cutoff,),
        )
        count = cur.fetchone()[0]

        print(f"Keep dates from: {cutoff} to {today - timedelta(days=1)}")
        print(f"Old records found: {count}")

        if "--apply" in sys.argv:
            cur.execute(
                "DELETE FROM daily_stats WHERE stat_date < %s",
                (cutoff,),
            )
            print(f"Deleted: {cur.rowcount}")
        else:
            print("DRY RUN: Nothing deleted.")

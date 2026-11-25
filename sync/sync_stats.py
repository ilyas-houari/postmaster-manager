
import argparse
import json
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from urllib.parse import quote

import psycopg
import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TOKEN_FILE = ROOT / "sync" / "google_token.json"
SCOPE = "https://www.googleapis.com/auth/postmaster"

errors = {
    "reject": [
        "bad_attachment", "bad_or_missing_ptr_record",
        "ip_in_rbls", "low_domain_reputation",
        "low_ip_reputation", "spammy_content",
        "stamp_policy_error", "other",
    ],
    "temp_fail": ["anomalous_traffic_pattern", "other"],
}

METRICS = [
    {"name": "spam", "baseMetric": {"standardMetric": "SPAM_RATE"}},
    *[
        {
            "name": f"count_tls_{direction}",
            "baseMetric": {
                "standardMetric": "TLS_ENCRYPTION_MESSAGE_COUNT"
            },
            "filter": f'traffic_direction = "{direction}"',
        }
        for direction in ("inbound", "outbound")
    ],
    {
        "name": "feedback_loop_id",
        "baseMetric": {"standardMetric": "FEEDBACK_LOOP_ID"},
    },
    *[
        {
            "name": f"tls_{direction}",
            "baseMetric": {"standardMetric": "TLS_ENCRYPTION_RATE"},
            "filter": f'traffic_direction = "{direction}"',
        }
        for direction in ("inbound", "outbound")
    ],
    *[
        {
            "name": name,
            "baseMetric": {"standardMetric": "AUTH_SUCCESS_RATE"},
            "filter": f'auth_type = "{name}"',
        }
        for name in ("spf", "dkim", "dmarc")
    ],
    *[
        {
            "name": f"error_{kind}_{reason}",
            "baseMetric": {"standardMetric": "DELIVERY_ERROR_RATE"},
            "filter": (
                f'error_type = "{kind}" '
                f'AND error_reason = "{reason}"'
            ),
        }
        for kind, reasons in errors.items()
        for reason in reasons
    ],
]


def api_date(value):
    return {
        "year": value.year,
        "month": value.month,
        "day": value.day,
    }


def google_credentials():
    with TOKEN_FILE.open(encoding="utf-8") as f:
        config = json.load(f)

    credentials = Credentials(
        token=None,
        refresh_token=config["refresh_token"],
        token_uri=config["token_uri"],
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        scopes=[SCOPE],
    )
    credentials.refresh(Request())
    return credentials


def fetch_stats(session, credentials, domain, start, end):
    url = (
        "https://gmailpostmastertools.googleapis.com/v2/domains/"
        + quote(domain, safe="")
        + "/domainStats:query"
    )

    payload = {
        "metricDefinitions": METRICS,
        "timeQuery": {
            "dateRanges": {
                "dateRanges": [{
                    "start": api_date(start),
                    "end": api_date(end),
                }]
            }
        },
        "aggregationGranularity": "DAILY",
        "pageSize": 200,
    }

    records = []
    page_token = ""
    seen = set()

    for page in range(100):
        body = dict(payload)
        if page_token:
            body["pageToken"] = page_token

        for attempt in range(5):
            if not credentials.valid:
                credentials.refresh(Request())

            try:
                response = session.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {credentials.token}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=60,
                )
            except requests.RequestException:
                if attempt == 4:
                    raise
                time.sleep(min(2 ** attempt, 16))
                continue

            if response.status_code == 401 and attempt == 0:
                credentials.refresh(Request())
                continue

            if response.status_code in (429, 500, 502, 503, 504):
                if attempt == 4:
                    response.raise_for_status()

                delay = min(2 ** attempt, 16)
                retry_after = response.headers.get("Retry-After")

                if retry_after and retry_after.isdigit():
                    delay = min(int(retry_after), 60)

                time.sleep(delay)
                continue

            response.raise_for_status()
            break

        result = response.json()
        records.extend(result.get("domainStats", []))

        page_token = result.get("nextPageToken", "")
        if not page_token:
            return records

        if page_token in seen:
            raise RuntimeError("Repeated pagination token")

        seen.add(page_token)

    raise RuntimeError("Pagination limit reached")


def group_records(records):
    grouped = defaultdict(dict)

    for record in records:
        d = record.get("date") or {}
        metric = record.get("metric")
        value = record.get("value")

        if not metric or value is None:
            continue

        stat_date = date(
            int(d["year"]),
            int(d["month"]),
            int(d["day"]),
        )

        grouped[stat_date][metric] = value

    return grouped


def save_domain(conn, domain_id, start, end, grouped, record_count):
    with conn.cursor() as cur:
        # Replace each returned day's metrics with the complete
        # 19-metric response, instead of keeping old partial values.
        for stat_date, data in grouped.items():
            cur.execute(
                """
                INSERT INTO daily_stats
                    (domain_id, stat_date, data, fetched_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (domain_id, stat_date)
                DO UPDATE SET
                    data = EXCLUDED.data,
                    fetched_at = NOW()
                """,
                (domain_id, stat_date, Jsonb(data)),
            )

        latest = max(grouped) if grouped else None

        cur.execute(
            """
            UPDATE domains
            SET last_sync_at = NOW(),
                latest_data_date = (
                    SELECT MAX(stat_date)
                    FROM daily_stats
                    WHERE domain_id = %s
                ),
                sync_status = 'success'
            WHERE id = %s
            """,
            (domain_id, domain_id),
        )

        cur.execute(
            """
            INSERT INTO sync_logs
                (domain_id, started_at, finished_at,
                 status, records_updated)
            VALUES (%s, NOW(), NOW(), 'success', %s)
            """,
            (domain_id, len(grouped)),
        )

    conn.commit()
    return latest


def log_failure(conn, domain_id, error):
    conn.rollback()

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE domains
            SET sync_status = 'failed'
            WHERE id = %s
            """,
            (domain_id,),
        )

        cur.execute(
            """
            INSERT INTO sync_logs
                (domain_id, started_at, finished_at,
                 status, records_updated, error_message)
            VALUES (%s, NOW(), NOW(), 'failed', 0, %s)
            """,
            (domain_id, str(error)[:2000]),
        )

    conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()

    if args.limit < 1 or not 1 <= args.days <= 90:
        parser.error("limit >= 1 and days between 1 and 90 required")

    end = datetime.now(timezone.utc).date() - timedelta(days=1)
    start = end - timedelta(days=args.days - 1)

    credentials = google_credentials()

    with psycopg.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    ) as conn:

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, domain_name
                FROM domains
                ORDER BY domain_name
                LIMIT %s
                """,
                (args.limit,),
            )
            domains = cur.fetchall()

        print(f"Domains: {len(domains)}")
        print(f"Date range: {start} to {end}")
        print(f"Metrics: {len(METRICS)}")

        success = 0
        failed = 0

        with requests.Session() as session:
            for index, (domain_id, domain) in enumerate(domains, 1):
                try:
                    records = fetch_stats(
                        session, credentials, domain, start, end
                    )
                    grouped = group_records(records)

                    latest = save_domain(
                        conn, domain_id, start, end,
                        grouped, len(records)
                    )

                    success += 1
                    print(
                        f"[{index}/{len(domains)}] OK {domain} "
                        f"| Records: {len(records)} "
                        f"| Days: {len(grouped)} "
                        f"| Latest returned: {latest}"
                    )

                except Exception as exc:
                    failed += 1
                    try:
                        log_failure(conn, domain_id, exc)
                    except Exception as log_exc:
                        print(f"Logging failed: {log_exc}")

                    print(
                        f"[{index}/{len(domains)}] FAILED {domain} "
                        f"| {str(exc)[:200]}"
                    )

                time.sleep(0.5)

        print("-------------------------------")
        print(f"SUCCESS: {success}")
        print(f"FAILED: {failed}")


if __name__ == "__main__":
    main()

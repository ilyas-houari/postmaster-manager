
import json
import os
from pathlib import Path

import psycopg
import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TOKEN_FILE = ROOT / "sync" / "google_token.json"
with TOKEN_FILE.open(encoding="utf-8") as f:
    token_data = json.load(f)

credentials = Credentials(
    token=None,
    refresh_token=token_data["refresh_token"],
    token_uri=token_data["token_uri"],
    client_id=token_data["client_id"],
    client_secret=token_data["client_secret"],
    scopes=["https://www.googleapis.com/auth/postmaster"],
)
credentials.refresh(Request())

domains = []
page_token = ""
seen_tokens = set()

while True:
    params = {"pageSize": 100}
    if page_token:
        params["pageToken"] = page_token

    response = requests.get(
        "https://gmailpostmastertools.googleapis.com/v2/domains",
        headers={"Authorization": f"Bearer {credentials.token}"},
        params=params,
        timeout=30,
    )
    response.raise_for_status()

    result = response.json()
    domains.extend(result.get("domains", []))

    page_token = result.get("nextPageToken", "")
    if not page_token:
        break
    if page_token in seen_tokens:
        raise RuntimeError("Repeated Google pagination token")
    seen_tokens.add(page_token)

names = sorted({
    str(d.get("name", "")).removeprefix("domains/").strip().lower()
    for d in domains
    if d.get("name")
})

names = [name for name in names if name]

with psycopg.connect(
    host=os.getenv("DB_HOST"),
    port=os.getenv("DB_PORT", "5432"),
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
) as conn:
    with conn.cursor() as cur:
        for name in names:
            cur.execute(
                """
                INSERT INTO domains (domain_name)
                VALUES (%s)
                ON CONFLICT (domain_name) DO NOTHING
                """,
                (name,),
            )

    conn.commit()

print("Google domains fetched:", len(domains))
print("Unique domains:", len(names))
print("Domains synchronization completed.")

"""
Scrape import permit records from the EFDA portal (2023 onwards).

Modes:
    Initial:     Fetches from newest → oldest, stops at 2023-01-01 cutoff
    Incremental: Fetches from newest → stops when hitting already-seen records

Usage:
    cd /Users/t/Developer/personal/efda-scraper
    .venv/bin/python scripts/scrape_all.py              # auto-detects mode
    .venv/bin/python scripts/scrape_all.py --full        # force full re-scrape (still 2023+ only)
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import os
import sqlite3
import time
from pathlib import Path

import httpx
from playwright.async_api import async_playwright

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "efda.sqlite3"
CSV_PATH = DATA_DIR / "all_imports.csv"
RAW_DIR = DATA_DIR / "raw" / "api_v2"
STATE_DIR = DATA_DIR / "state"
TOKEN_PATH = STATE_DIR / "token.json"

API_BASE = "https://api.eris.efda.gov.et"
PORTAL_URL = "https://portal.eris.efda.gov.et/"
PAGE_SIZE = 100
DATE_CUTOFF = "2023-01-01"


async def get_bearer_token() -> tuple[str, str]:
    """Login via Playwright and capture the Bearer token + userId."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        token_holder: dict = {}

        async def capture_token(request):
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer ") and not token_holder:
                token_holder["token"] = auth
                if request.post_data and "userId" in request.post_data:
                    for line in request.post_data.split("\n"):
                        line = line.strip()
                        if line.isdigit() and len(line) <= 6:
                            token_holder["userId"] = line

        page.on("request", capture_token)

        log.info("Logging in to EFDA portal...")
        await page.goto(PORTAL_URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_selector(
            "input#username, input[name='username']", state="visible", timeout=30_000
        )
        await page.fill("input#username", os.environ["EFDA_USERNAME"])
        await page.fill("input#password", os.environ["EFDA_PASSWORD"])
        await page.click('button:has-text("Login")')
        await page.wait_for_load_state("networkidle", timeout=30_000)

        await page.wait_for_timeout(2000)
        try:
            await page.click("text=Import Permit", timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(5000)

        await browser.close()

    if "token" not in token_holder:
        raise RuntimeError("Failed to capture Bearer token during login")

    user_id = token_holder.get("userId", "29307")
    log.info("Got Bearer token (len=%d), userId=%s", len(token_holder["token"]), user_id)
    return token_holder["token"], user_id


def build_form_data(start: int, length: int, user_id: str) -> dict:
    """Build the multipart form fields matching the portal's DataTables request."""
    return {
        "start": str(start),
        "length": str(length),
        "search[value]": "",
        "draw": "0",
        "submoduleTypeCode": "",
        "userId": user_id,
        "columns[0][data]": "id",
        "columns[0][orderable]": "true",
        "columns[0][searchable]": "true",
        "columns[1][data]": "importPermitNumber",
        "columns[1][orderable]": "true",
        "columns[1][searchable]": "true",
        "columns[2][data]": "applicationId",
        "columns[2][orderable]": "true",
        "columns[2][searchable]": "true",
        "columns[3][data]": "importPermitStatusCode",
        "columns[3][orderable]": "true",
        "columns[3][searchable]": "true",
        "order[0][column]": "0",
        "order[0][dir]": "desc",
    }


def init_db(db_path: Path) -> sqlite3.Connection:
    """Create tables if they don't exist."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS import_permits (
            id INTEGER PRIMARY KEY,
            import_permit_number TEXT,
            application_id TEXT,
            agent_id INTEGER,
            agent_name TEXT,
            supplier_name TEXT,
            port_of_entry TEXT,
            payment_mode TEXT,
            shipping_method TEXT,
            currency TEXT,
            amount REAL,
            freight_cost REAL,
            status TEXT,
            status_code TEXT,
            submodule_type_code TEXT,
            performa_invoice_number TEXT,
            requested_date TEXT,
            expiry_date TEXT,
            submission_date TEXT,
            decision_date TEXT,
            delivery TEXT,
            remark TEXT,
            created_by_username TEXT,
            assigned_user TEXT,
            is_accessory INTEGER,
            raw_json TEXT,
            scraped_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scrape_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT,
            finished_at TEXT,
            total_records INTEGER,
            records_fetched INTEGER,
            status TEXT,
            message TEXT
        )
        """
    )
    conn.commit()
    return conn


def upsert_record(conn: sqlite3.Connection, rec: dict):
    """Insert or update an import permit record."""
    conn.execute(
        """
        INSERT INTO import_permits (
            id, import_permit_number, application_id, agent_id, agent_name,
            supplier_name, port_of_entry, payment_mode, shipping_method,
            currency, amount, freight_cost, status, status_code,
            submodule_type_code, performa_invoice_number,
            requested_date, expiry_date, submission_date, decision_date,
            delivery, remark, created_by_username, assigned_user,
            is_accessory, raw_json, scraped_at
        ) VALUES (
            :id, :importPermitNumber, :applicationId, :agentID, :agentName,
            :supplierName, :portOfEntry, :paymentMode, :shippingMethod,
            :currency, :amount, :freightCost, :importPermitStatus, :importPermitStatusCode,
            :submoduleTypeCode, :performaInvoiceNumber,
            :requestedDate, :expiryDate, :submissionDate, :decisionDate,
            :delivery, :remark, :createdByUsername, :assignedUser,
            :isAccessory, :raw_json, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            import_permit_number = excluded.import_permit_number,
            agent_name = excluded.agent_name,
            supplier_name = excluded.supplier_name,
            status = excluded.status,
            status_code = excluded.status_code,
            amount = excluded.amount,
            raw_json = excluded.raw_json,
            scraped_at = excluded.scraped_at
        """,
        {**rec, "raw_json": json.dumps(rec, default=str)},
    )


def is_before_cutoff(rec: dict) -> bool:
    """Check if a record's requestedDate is before the DATE_CUTOFF."""
    req_date = rec.get("requestedDate", "")
    if not req_date:
        return False
    return req_date < DATE_CUTOFF


async def scrape_all(full: bool = False):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Get auth token
    bearer_token, user_id = await get_bearer_token()

    # Save token for reuse by scrape_products.py
    TOKEN_PATH.write_text(json.dumps({
        "token": bearer_token,
        "user_id": user_id,
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }))

    # Step 2: Init DB
    conn = init_db(DB_PATH)
    run_started = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn.execute(
        "INSERT INTO scrape_log (started_at, status) VALUES (?, ?)",
        (run_started, "running"),
    )
    conn.commit()
    run_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Step 3: Determine mode
    existing_count = conn.execute(
        "SELECT COUNT(*) FROM import_permits WHERE requested_date >= ?", (DATE_CUTOFF,)
    ).fetchone()[0]
    max_existing_id = conn.execute(
        "SELECT COALESCE(MAX(id), 0) FROM import_permits"
    ).fetchone()[0]

    incremental = existing_count > 0 and not full
    if incremental:
        log.info(
            "Incremental mode: %d records in DB (2023+), max id=%d. "
            "Will stop when hitting existing records.",
            existing_count, max_existing_id,
        )
    else:
        log.info(
            "Full mode: scraping all records from newest until %s cutoff.", DATE_CUTOFF
        )

    headers = {
        "Authorization": bearer_token,
        "Accept": "application/json, text/plain, */*",
        "Referer": PORTAL_URL,
    }

    # Always start from offset 0 (newest first)
    all_records: list[dict] = []
    offset = 0
    total_records = None
    max_retries = 5
    base_delay = 2.0
    consecutive_errors = 0
    max_consecutive_errors = 3
    stop_reason = "unknown"
    new_records = 0
    skipped_old = 0

    transport = httpx.AsyncHTTPTransport(retries=3)
    async with httpx.AsyncClient(timeout=120.0, transport=transport) as client:
        while True:
            fields = build_form_data(offset, PAGE_SIZE, user_id)
            resp = None

            for attempt in range(max_retries):
                try:
                    log.info("Fetching records %d - %d ...", offset, offset + PAGE_SIZE)
                    resp = await client.post(
                        f"{API_BASE}/api/ImportPermit/List",
                        data=fields,
                        headers=headers,
                    )
                    break
                except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectError) as exc:
                    wait_time = base_delay * (2 ** attempt)
                    log.warning(
                        "Request failed (attempt %d/%d): %s. Retrying in %.1fs...",
                        attempt + 1, max_retries, exc, wait_time,
                    )
                    if attempt == max_retries - 1:
                        log.error("Max retries reached at offset %d.", offset)
                        raise
                    await asyncio.sleep(wait_time)

            if resp is None or resp.status_code != 200:
                status = resp.status_code if resp else "no response"
                log.warning("API error (status=%s) at offset %d", status, offset)
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log.error("Too many consecutive errors. Stopping.")
                    stop_reason = "consecutive_errors"
                    break
                await asyncio.sleep(10)
                continue

            try:
                body = resp.json()
            except Exception:
                log.warning("Non-JSON response at offset %d", offset)
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    stop_reason = "non_json_response"
                    break
                await asyncio.sleep(10)
                continue

            consecutive_errors = 0
            total_records = body.get("recordsTotal", 0)
            page_data = body.get("data", [])

            if not page_data:
                stop_reason = "no_more_data"
                log.info("No more records at offset %d", offset)
                break

            # Process records, applying cutoff and dedup logic
            hit_cutoff = False
            hit_existing = False
            page_new = 0

            for rec in page_data:
                # Date cutoff: stop if record is before 2023
                if is_before_cutoff(rec):
                    hit_cutoff = True
                    skipped_old += 1
                    continue

                # Incremental: stop if we've already seen this record
                if incremental and rec.get("id", 0) <= max_existing_id:
                    # Check if it actually exists in DB
                    exists = conn.execute(
                        "SELECT 1 FROM import_permits WHERE id = ?", (rec["id"],)
                    ).fetchone()
                    if exists:
                        hit_existing = True
                        continue

                all_records.append(rec)
                upsert_record(conn, rec)
                page_new += 1

            new_records += page_new
            conn.commit()

            log.info(
                "Page: %d new, %d total new (this run). offset=%d",
                page_new, new_records, offset,
            )

            # Stop conditions
            if hit_cutoff:
                stop_reason = "date_cutoff"
                log.info("Hit date cutoff (%s). Stopping.", DATE_CUTOFF)
                break

            if hit_existing and page_new == 0:
                stop_reason = "all_existing"
                log.info("All records in this page already exist. Stopping.")
                break

            offset += PAGE_SIZE

            if total_records and offset >= total_records:
                stop_reason = "end_of_data"
                log.info("Reached total records count: %d", total_records)
                break

            await asyncio.sleep(base_delay)

    # Step 4: Save raw JSON for this run
    if all_records:
        raw_path = RAW_DIR / "all_imports.json"
        raw_path.write_text(json.dumps(all_records, indent=2, default=str))
        log.info("Saved %d raw records to %s", len(all_records), raw_path)

    # Step 5: Export 2023+ records from DB to CSV
    final_count = conn.execute(
        "SELECT COUNT(*) FROM import_permits WHERE requested_date >= ?", (DATE_CUTOFF,)
    ).fetchone()[0]
    log.info("Exporting %d records (2023+) from DB to CSV...", final_count)
    csv_fields = [
        "id", "import_permit_number", "application_id", "agent_name",
        "supplier_name", "port_of_entry", "payment_mode", "shipping_method",
        "currency", "amount", "freight_cost", "status", "status_code",
        "submodule_type_code", "performa_invoice_number",
        "requested_date", "expiry_date", "submission_date", "decision_date",
        "delivery", "created_by_username", "assigned_user", "is_accessory", "remark",
    ]
    rows = conn.execute(
        f"SELECT {', '.join(csv_fields)} FROM import_permits "
        f"WHERE requested_date >= ? ORDER BY id DESC",
        (DATE_CUTOFF,),
    ).fetchall()
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_fields)
        writer.writerows(rows)
    log.info("Saved CSV with %d records to %s", len(rows), CSV_PATH)

    # Step 6: Update scrape log
    mode = "incremental" if incremental else "full"
    conn.execute(
        """
        UPDATE scrape_log
        SET finished_at = datetime('now'),
            total_records = ?,
            records_fetched = ?,
            status = 'success',
            message = ?
        WHERE id = ?
        """,
        (
            final_count,
            new_records,
            f"mode={mode} new={new_records} stop={stop_reason} skipped_old={skipped_old}",
            run_id,
        ),
    )
    conn.commit()
    conn.close()

    log.info(
        "Done! mode=%s, new_records=%d, stop_reason=%s, total_2023+=%d",
        mode, new_records, stop_reason, final_count,
    )
    return new_records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape EFDA import permits (2023+)")
    parser.add_argument("--full", action="store_true", help="Force full re-scrape (still 2023+ only)")
    args = parser.parse_args()
    asyncio.run(scrape_all(full=args.full))

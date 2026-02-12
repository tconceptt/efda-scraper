"""
Scrape all import permit records from the EFDA portal.

Usage:
    cd /Users/t/Developer/personal/efda-scraper
    .venv/bin/python scripts/scrape_all.py

Flow:
    1. Login via Playwright to obtain a Bearer token
    2. Use httpx to paginate POST /api/ImportPermit/List
    3. For each import, fetch detail with products & suppliers
    4. Save to SQLite + CSV
"""

from __future__ import annotations

import asyncio
import csv
import json
import logging
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

API_BASE = "https://api.eris.efda.gov.et"
PORTAL_URL = "https://portal.eris.efda.gov.et/"
PAGE_SIZE = 100  # max records per request


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
                # Extract userId from any API call body if available
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
        await page.fill("input#username", "Rufica")
        await page.fill("input#password", "Rufpar@et#16")
        await page.click('button:has-text("Login")')
        await page.wait_for_load_state("networkidle", timeout=30_000)

        # Navigate to import permits to trigger an authenticated API call
        await page.wait_for_timeout(2000)
        try:
            await page.click("text=Import Permit", timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(5000)

        await browser.close()

    if "token" not in token_holder:
        raise RuntimeError("Failed to capture Bearer token during login")

    user_id = token_holder.get("userId", "29307")  # fallback from captured data
    log.info("Got Bearer token (len=%d), userId=%s", len(token_holder["token"]), user_id)
    return token_holder["token"], user_id


def build_form_data(start: int, length: int, user_id: str) -> dict:
    """Build the multipart form fields matching the portal's DataTables request."""
    fields = {
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
    return fields


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


async def scrape_all():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Get auth token
    bearer_token, user_id = await get_bearer_token()

    # Step 2: Init DB
    conn = init_db(DB_PATH)
    run_started = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn.execute(
        "INSERT INTO scrape_log (started_at, status) VALUES (?, ?)",
        (run_started, "running"),
    )
    conn.commit()
    run_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Step 3: Paginate through all records
    headers = {
        "Authorization": bearer_token,
        "Accept": "application/json, text/plain, */*",
        "Referer": PORTAL_URL,
    }

    # Resume: check how many records we already have in the DB
    existing_count = conn.execute("SELECT COUNT(*) FROM import_permits").fetchone()[0]
    start_offset = (existing_count // PAGE_SIZE) * PAGE_SIZE  # resume from last full page
    if existing_count > 0:
        log.info("Resuming: %d records in DB, starting from offset %d", existing_count, start_offset)

    all_records: list[dict] = []
    offset = start_offset
    total_records = None
    max_retries = 5
    base_delay = 2.0  # seconds between requests
    consecutive_errors = 0
    max_consecutive_errors = 3

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
                        log.error("Max retries reached at offset %d. Stopping.", offset)
                        raise
                    await asyncio.sleep(wait_time)

            if resp is None or resp.status_code != 200:
                status = resp.status_code if resp else "no response"
                log.warning("API error (status=%s) at offset %d, waiting 10s and retrying...", status, offset)
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log.error("Too many consecutive errors (%d). Token may have expired. Stopping.", consecutive_errors)
                    break
                await asyncio.sleep(10)
                continue

            try:
                body = resp.json()
            except Exception:
                log.warning("Non-JSON response at offset %d. Waiting 10s and retrying...", offset)
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    break
                await asyncio.sleep(10)
                continue

            consecutive_errors = 0
            total_records = body.get("recordsTotal", 0)
            page_data = body.get("data", [])

            if not page_data:
                log.info("No more records at offset %d", offset)
                break

            for rec in page_data:
                all_records.append(rec)
                upsert_record(conn, rec)

            conn.commit()
            total_in_db = existing_count + len(all_records)
            log.info(
                "Fetched %d records (this run: %d, total in DB: ~%d / %d)",
                len(page_data),
                len(all_records),
                total_in_db,
                total_records or "?",
            )

            offset += PAGE_SIZE

            if total_records and offset >= total_records:
                log.info("Reached total records count: %d", total_records)
                break

            # Delay between requests to avoid server disconnects
            await asyncio.sleep(base_delay)

    # Step 4: Save raw JSON for this run
    if all_records:
        raw_path = RAW_DIR / "all_imports.json"
        raw_path.write_text(json.dumps(all_records, indent=2, default=str))
        log.info("Saved %d raw records to %s", len(all_records), raw_path)

    # Step 5: Export ALL records from DB to CSV
    final_count = conn.execute("SELECT COUNT(*) FROM import_permits").fetchone()[0]
    log.info("Exporting all %d records from DB to CSV...", final_count)
    csv_fields = [
        "id", "import_permit_number", "application_id", "agent_name",
        "supplier_name", "port_of_entry", "payment_mode", "shipping_method",
        "currency", "amount", "freight_cost", "status", "status_code",
        "submodule_type_code", "performa_invoice_number",
        "requested_date", "expiry_date", "submission_date", "decision_date",
        "delivery", "created_by_username", "assigned_user", "is_accessory", "remark",
    ]
    rows = conn.execute(
        f"SELECT {', '.join(csv_fields)} FROM import_permits ORDER BY id DESC"
    ).fetchall()
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_fields)
        writer.writerows(rows)
    log.info("Saved CSV with %d records to %s", len(rows), CSV_PATH)

    # Step 6: Update scrape log
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
        (total_records, len(all_records), f"Scraped {len(all_records)} records", run_id),
    )
    conn.commit()
    conn.close()

    log.info("Done! %d records scraped and saved.", len(all_records))
    return len(all_records)


if __name__ == "__main__":
    asyncio.run(scrape_all())

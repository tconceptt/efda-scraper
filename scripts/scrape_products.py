"""
Scrape product details for import permits from the EFDA portal.

For each import permit, calls GET /api/ImportPermit/{id} and extracts
the `importPermitDetails` array containing product line items with
product info, manufacturer, quantity, price, etc.

Usage:
    cd /Users/t/Developer/personal/efda-scraper
    .venv/bin/python scripts/scrape_products.py [--limit N]
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

try:
    from scripts.normalize import (
        normalize_dosage_form,
        normalize_dosage_strength,
        normalize_generic_name,
    )
except ImportError:
    from normalize import (  # type: ignore[no-redef]
        normalize_dosage_form,
        normalize_dosage_strength,
        normalize_generic_name,
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "efda.sqlite3"
CSV_PATH = DATA_DIR / "import_products.csv"

API_BASE = "https://api.eris.efda.gov.et"
PORTAL_URL = "https://portal.eris.efda.gov.et/"
TOKEN_PATH = DATA_DIR / "state" / "token.json"
TOKEN_MAX_AGE_SEC = 20 * 60  # 20 minutes


async def _login_for_token() -> str:
    """Login via Playwright and capture the Bearer token."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        token_holder: dict = {}

        async def capture_token(request):
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer ") and "token" not in token_holder:
                token_holder["token"] = auth

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

        # Trigger an authenticated API call
        try:
            await page.click("text=Import Permit", timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(5000)

        await browser.close()

    if "token" not in token_holder:
        raise RuntimeError("Failed to capture Bearer token during login")

    log.info("Got Bearer token (len=%d)", len(token_holder["token"]))
    return token_holder["token"]


async def get_bearer_token() -> str:
    """Load saved token from scrape_all.py if fresh, otherwise do a fresh login."""
    if TOKEN_PATH.exists():
        try:
            saved = json.loads(TOKEN_PATH.read_text())
            saved_at = time.mktime(time.strptime(saved["saved_at"], "%Y-%m-%dT%H:%M:%S"))
            age = time.time() - saved_at
            if age < TOKEN_MAX_AGE_SEC:
                log.info("Reusing saved token (age=%.0fs)", age)
                return saved["token"]
            log.info("Saved token expired (age=%.0fs). Doing fresh login.", age)
        except Exception as exc:
            log.warning("Could not load saved token: %s", exc)
    return await _login_for_token()


def init_products_table(conn: sqlite3.Connection):
    """Create the import_permit_products table and add any missing columns."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS import_permit_products (
            id INTEGER PRIMARY KEY,
            import_permit_id INTEGER NOT NULL,
            import_permit_number TEXT,
            product_id INTEGER,
            product_name TEXT,
            generic_name TEXT,
            brand_name TEXT,
            description TEXT,
            indication TEXT,
            hs_code TEXT,
            product_registration_date TEXT,
            product_expiry_date TEXT,
            product_status TEXT,
            manufacturer_name TEXT,
            manufacturer_site TEXT,
            manufacturer_country_id INTEGER,
            quantity REAL,
            unit_price REAL,
            discount REAL,
            amount REAL,
            is_accessory INTEGER,
            full_item_name TEXT,
            dosage_form TEXT,
            dosage_strength TEXT,
            dosage_unit TEXT,
            raw_json TEXT,
            scraped_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (import_permit_id) REFERENCES import_permits(id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_import_id
        ON import_permit_products(import_permit_id)
        """
    )
    # Add columns to existing table (idempotent)
    for col in [
        "full_item_name TEXT", "dosage_form TEXT", "dosage_strength TEXT", "dosage_unit TEXT",
        "norm_generic_name TEXT", "norm_dosage_form TEXT", "norm_dosage_strength TEXT",
    ]:
        try:
            conn.execute(f"ALTER TABLE import_permit_products ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.commit()


def backfill_from_raw_json(conn: sqlite3.Connection):
    """Backfill full_item_name and dosage fields from stored raw_json."""
    rows = conn.execute(
        "SELECT id, raw_json FROM import_permit_products "
        "WHERE full_item_name IS NULL AND raw_json IS NOT NULL"
    ).fetchall()
    if not rows:
        return
    log.info("Backfilling %d products from raw_json...", len(rows))
    for row_id, raw in rows:
        try:
            item = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        product = item.get("product") or {}
        conn.execute(
            """UPDATE import_permit_products
            SET full_item_name = ?, dosage_form = ?, dosage_strength = ?, dosage_unit = ?
            WHERE id = ?""",
            (
                product.get("fullItemName"),
                product.get("dosageForm") or product.get("dosageFormStr"),
                product.get("dosageStrength") or product.get("dosageStrengthStr"),
                product.get("dosageUnit") or product.get("dosageUnitName"),
                row_id,
            ),
        )
    conn.commit()
    log.info("Backfill complete.")


def backfill_normalized_columns(conn: sqlite3.Connection):
    """Backfill norm_generic_name / norm_dosage_form / norm_dosage_strength."""
    rows = conn.execute(
        "SELECT id, generic_name, dosage_form, dosage_strength "
        "FROM import_permit_products "
        "WHERE norm_generic_name IS NULL AND generic_name IS NOT NULL"
    ).fetchall()
    if not rows:
        return
    log.info("Backfilling normalized columns for %d products...", len(rows))
    for row_id, generic_name, dosage_form, dosage_strength in rows:
        conn.execute(
            """UPDATE import_permit_products
            SET norm_generic_name = ?, norm_dosage_form = ?, norm_dosage_strength = ?
            WHERE id = ?""",
            (
                normalize_generic_name(generic_name) if generic_name else None,
                normalize_dosage_form(dosage_form) if dosage_form else None,
                normalize_dosage_strength(dosage_strength) if dosage_strength else None,
                row_id,
            ),
        )
    conn.commit()
    log.info("Normalized column backfill complete.")


def upsert_product(conn: sqlite3.Connection, item: dict, import_permit_number: str):
    """Insert or update a product line item."""
    product = item.get("product") or {}
    mfg_addr = item.get("manufacturerAddress") or {}
    mfg = mfg_addr.get("manufacturer") or {}

    generic_name = product.get("genericName")
    dosage_form = product.get("dosageForm") or product.get("dosageFormStr")
    dosage_strength = product.get("dosageStrength") or product.get("dosageStrengthStr")

    conn.execute(
        """
        INSERT INTO import_permit_products (
            id, import_permit_id, import_permit_number,
            product_id, product_name, generic_name, brand_name,
            description, indication, hs_code,
            product_registration_date, product_expiry_date, product_status,
            manufacturer_name, manufacturer_site, manufacturer_country_id,
            quantity, unit_price, discount, amount,
            is_accessory, full_item_name, dosage_form, dosage_strength, dosage_unit,
            norm_generic_name, norm_dosage_form, norm_dosage_strength,
            raw_json, scraped_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            product_name = excluded.product_name,
            generic_name = excluded.generic_name,
            manufacturer_name = excluded.manufacturer_name,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            amount = excluded.amount,
            full_item_name = excluded.full_item_name,
            dosage_form = excluded.dosage_form,
            dosage_strength = excluded.dosage_strength,
            dosage_unit = excluded.dosage_unit,
            norm_generic_name = excluded.norm_generic_name,
            norm_dosage_form = excluded.norm_dosage_form,
            norm_dosage_strength = excluded.norm_dosage_strength,
            raw_json = excluded.raw_json,
            scraped_at = excluded.scraped_at
        """,
        (
            item.get("id"),
            item.get("importPermitID"),
            import_permit_number,
            item.get("productID"),
            product.get("name"),
            generic_name,
            product.get("brandName"),
            product.get("description"),
            product.get("indication"),
            product.get("hsCode"),
            product.get("registrationDate"),
            product.get("expiryDate"),
            product.get("productStatus"),
            mfg.get("name"),
            mfg.get("site"),
            mfg.get("countryID"),
            item.get("quantity"),
            item.get("unitPrice"),
            item.get("discount"),
            item.get("amount"),
            item.get("isAccessory"),
            product.get("fullItemName"),
            dosage_form,
            dosage_strength,
            product.get("dosageUnit") or product.get("dosageUnitName"),
            normalize_generic_name(generic_name) if generic_name else None,
            normalize_dosage_form(dosage_form) if dosage_form else None,
            normalize_dosage_strength(dosage_strength) if dosage_strength else None,
            json.dumps(item, default=str),
        ),
    )


CONCURRENCY_PRODUCTS = 10


async def fetch_import_products(
    client: httpx.AsyncClient,
    import_id: int,
    import_number: str,
    headers: dict,
    semaphore: asyncio.Semaphore,
) -> tuple[int, str, list | None, int]:
    """Fetch product details for a single import. Returns (import_id, import_number, details_or_None, status_code)."""
    async with semaphore:
        for attempt in range(3):
            try:
                resp = await client.get(
                    f"{API_BASE}/api/ImportPermit/{import_id}",
                    headers=headers,
                )
                break
            except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectError) as exc:
                log.warning("Request failed for %d (attempt %d): %s", import_id, attempt + 1, exc)
                if attempt == 2:
                    return import_id, import_number, None, 0
                await asyncio.sleep(2 * (attempt + 1))

        if resp.status_code != 200:
            return import_id, import_number, None, resp.status_code

        try:
            body = resp.json()
        except Exception:
            return import_id, import_number, None, resp.status_code

        details = body.get("importPermitDetails", [])
        return import_id, import_number, details, resp.status_code


async def scrape_products(limit: int | None = None):
    # Step 1: Get auth token
    bearer_token = await get_bearer_token()

    # Step 2: Init DB
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    init_products_table(conn)
    backfill_from_raw_json(conn)
    backfill_normalized_columns(conn)

    # Step 3: Get import IDs to process
    # Skip imports we've already scraped products for
    already_scraped = {
        row[0]
        for row in conn.execute(
            "SELECT DISTINCT import_permit_id FROM import_permit_products"
        ).fetchall()
    }

    all_imports = conn.execute(
        "SELECT id, import_permit_number FROM import_permits "
        "WHERE requested_date >= '2023-01-01' ORDER BY id DESC"
    ).fetchall()

    to_process = [(pid, pnum) for pid, pnum in all_imports if pid not in already_scraped]

    if limit:
        to_process = to_process[:limit]

    log.info(
        "Will fetch products for %d imports (%d already done, %d total)",
        len(to_process),
        len(already_scraped),
        len(all_imports),
    )

    # Step 4: Fetch details concurrently in batches
    headers = {
        "Authorization": bearer_token,
        "Accept": "application/json, text/plain, */*",
        "Referer": PORTAL_URL,
    }

    total_products = 0
    errors = 0
    max_consecutive_errors = 5
    consecutive_errors = 0
    retried_auth = False

    semaphore = asyncio.Semaphore(CONCURRENCY_PRODUCTS)
    transport = httpx.AsyncHTTPTransport(retries=3)
    async with httpx.AsyncClient(timeout=120.0, transport=transport) as client:
        for batch_start in range(0, len(to_process), CONCURRENCY_PRODUCTS):
            batch = to_process[batch_start:batch_start + CONCURRENCY_PRODUCTS]

            tasks = [
                fetch_import_products(client, imp_id, imp_num, headers, semaphore)
                for imp_id, imp_num in batch
            ]
            results = await asyncio.gather(*tasks)

            # Check for 401s — re-auth once and retry failed ones
            needs_retry = []
            for import_id, import_number, details, status_code in results:
                if status_code == 401:
                    needs_retry.append((import_id, import_number))

            if needs_retry and not retried_auth:
                log.warning("Got 401 for %d imports — token expired. Doing fresh login...", len(needs_retry))
                bearer_token = await _login_for_token()
                headers["Authorization"] = bearer_token
                retried_auth = True
                retry_tasks = [
                    fetch_import_products(client, imp_id, imp_num, headers, semaphore)
                    for imp_id, imp_num in needs_retry
                ]
                retry_results = await asyncio.gather(*retry_tasks)
                # Replace 401 results with retried results
                retry_map = {r[0]: r for r in retry_results}
                results = [
                    retry_map.get(r[0], r) if r[3] == 401 else r
                    for r in results
                ]

            # Process results and upsert to DB
            batch_stop = False
            for import_id, import_number, details, status_code in results:
                if details is None:
                    if status_code != 0:
                        log.warning("HTTP %d for import %d (%s)", status_code, import_id, import_number)
                    else:
                        log.warning("Request failed for import %d (%s)", import_id, import_number)
                    consecutive_errors += 1
                    errors += 1
                    if consecutive_errors >= max_consecutive_errors:
                        log.error("Too many consecutive errors. Token may have expired.")
                        batch_stop = True
                        break
                    continue

                consecutive_errors = 0
                for item in details:
                    upsert_product(conn, item, import_number)
                    total_products += 1

            conn.commit()

            processed = min(batch_start + len(batch), len(to_process))
            log.info(
                "[%d/%d] Batch done: %d products so far (%d errors)",
                processed, len(to_process), total_products, errors,
            )

            if batch_stop:
                break

            await asyncio.sleep(0.3)

    # Step 5: Export CSV
    log.info("Exporting products to CSV...")
    csv_fields = [
        "id", "import_permit_id", "import_permit_number",
        "product_name", "full_item_name", "generic_name", "brand_name",
        "description", "hs_code",
        "dosage_form", "dosage_strength", "dosage_unit",
        "product_registration_date", "product_expiry_date", "product_status",
        "manufacturer_name", "manufacturer_site",
        "quantity", "unit_price", "discount", "amount",
    ]
    rows = conn.execute(
        f"SELECT {', '.join(csv_fields)} FROM import_permit_products ORDER BY import_permit_id DESC"
    ).fetchall()
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_fields)
        writer.writerows(rows)

    final_count = conn.execute("SELECT COUNT(*) FROM import_permit_products").fetchone()[0]
    conn.close()

    log.info("Done! %d products scraped (%d errors). Total in DB: %d. CSV: %s", total_products, errors, final_count, CSV_PATH)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Max imports to process (for testing)")
    args = parser.parse_args()
    asyncio.run(scrape_products(limit=args.limit))

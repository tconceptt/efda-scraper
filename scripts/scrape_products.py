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
CSV_PATH = DATA_DIR / "import_products.csv"

API_BASE = "https://api.eris.efda.gov.et"
PORTAL_URL = "https://portal.eris.efda.gov.et/"


async def get_bearer_token() -> str:
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
        await page.fill("input#username", "Rufica")
        await page.fill("input#password", "Rufpar@et#16")
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


def init_products_table(conn: sqlite3.Connection):
    """Create the import_permit_products table."""
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
    conn.commit()


def upsert_product(conn: sqlite3.Connection, item: dict, import_permit_number: str):
    """Insert or update a product line item."""
    product = item.get("product") or {}
    mfg_addr = item.get("manufacturerAddress") or {}
    mfg = mfg_addr.get("manufacturer") or {}

    conn.execute(
        """
        INSERT INTO import_permit_products (
            id, import_permit_id, import_permit_number,
            product_id, product_name, generic_name, brand_name,
            description, indication, hs_code,
            product_registration_date, product_expiry_date, product_status,
            manufacturer_name, manufacturer_site, manufacturer_country_id,
            quantity, unit_price, discount, amount,
            is_accessory, raw_json, scraped_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            product_name = excluded.product_name,
            generic_name = excluded.generic_name,
            manufacturer_name = excluded.manufacturer_name,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            amount = excluded.amount,
            raw_json = excluded.raw_json,
            scraped_at = excluded.scraped_at
        """,
        (
            item.get("id"),
            item.get("importPermitID"),
            import_permit_number,
            item.get("productID"),
            product.get("name"),
            product.get("genericName"),
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
            json.dumps(item, default=str),
        ),
    )


async def scrape_products(limit: int | None = None):
    # Step 1: Get auth token
    bearer_token = await get_bearer_token()

    # Step 2: Init DB
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    init_products_table(conn)

    # Step 3: Get import IDs to process
    # Skip imports we've already scraped products for
    already_scraped = {
        row[0]
        for row in conn.execute(
            "SELECT DISTINCT import_permit_id FROM import_permit_products"
        ).fetchall()
    }

    all_imports = conn.execute(
        "SELECT id, import_permit_number FROM import_permits ORDER BY id DESC"
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

    # Step 4: Fetch details
    headers = {
        "Authorization": bearer_token,
        "Accept": "application/json, text/plain, */*",
        "Referer": PORTAL_URL,
    }

    total_products = 0
    errors = 0
    max_consecutive_errors = 5
    consecutive_errors = 0

    transport = httpx.AsyncHTTPTransport(retries=3)
    async with httpx.AsyncClient(timeout=120.0, transport=transport) as client:
        for idx, (import_id, import_number) in enumerate(to_process):
            # Retry loop
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
                        raise
                    await asyncio.sleep(2 * (attempt + 1))

            if resp.status_code != 200:
                log.warning("HTTP %d for import %d (%s)", resp.status_code, import_id, import_number)
                consecutive_errors += 1
                errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    log.error("Too many consecutive errors. Token may have expired.")
                    break
                await asyncio.sleep(5)
                continue

            try:
                body = resp.json()
            except Exception:
                log.warning("Non-JSON response for import %d", import_id)
                consecutive_errors += 1
                errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    break
                await asyncio.sleep(5)
                continue

            consecutive_errors = 0
            details = body.get("importPermitDetails", [])

            for item in details:
                upsert_product(conn, item, import_number)
                total_products += 1

            conn.commit()

            if (idx + 1) % 10 == 0 or idx == 0:
                log.info(
                    "[%d/%d] Import %s: %d products (total: %d)",
                    idx + 1, len(to_process), import_number, len(details), total_products,
                )

            # Throttle
            await asyncio.sleep(1.0)

    # Step 5: Export CSV
    log.info("Exporting products to CSV...")
    csv_fields = [
        "id", "import_permit_id", "import_permit_number",
        "product_name", "generic_name", "brand_name",
        "description", "hs_code",
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

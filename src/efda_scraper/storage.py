from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from efda_scraper.models import MedicineImportRecord


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class SQLiteStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def init_schema(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS imports (
                    source_record_id TEXT PRIMARY KEY,
                    permit_number TEXT,
                    importer_name TEXT,
                    product_name TEXT,
                    quantity REAL,
                    quantity_unit TEXT,
                    origin_country TEXT,
                    status TEXT,
                    imported_at TEXT,
                    updated_at TEXT,
                    raw_json TEXT NOT NULL,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS scrape_runs (
                    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    records_seen INTEGER NOT NULL DEFAULT 0,
                    records_upserted INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    message TEXT
                );

                CREATE TABLE IF NOT EXISTS imports_ui (
                    import_reference TEXT PRIMARY KEY,
                    detail_url TEXT,
                    raw_json TEXT NOT NULL,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS import_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_reference TEXT NOT NULL,
                    product_name TEXT,
                    supplier_name TEXT,
                    raw_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS import_suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_reference TEXT NOT NULL,
                    supplier_name TEXT,
                    raw_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS product_supplier_links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_reference TEXT NOT NULL,
                    product_name TEXT,
                    supplier_name TEXT,
                    confidence TEXT,
                    source TEXT,
                    raw_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    def start_run(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "INSERT INTO scrape_runs (started_at, status) VALUES (?, ?)",
                (_utc_now_iso(), "running"),
            )
            return int(cursor.lastrowid)

    def finish_run(
        self,
        run_id: int,
        *,
        status: str,
        records_seen: int,
        records_upserted: int,
        message: str | None = None,
    ) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE scrape_runs
                SET finished_at = ?, status = ?, records_seen = ?, records_upserted = ?, message = ?
                WHERE run_id = ?
                """,
                (_utc_now_iso(), status, records_seen, records_upserted, message, run_id),
            )

    def upsert_record(self, record: MedicineImportRecord) -> int:
        now = _utc_now_iso()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO imports (
                    source_record_id,
                    permit_number,
                    importer_name,
                    product_name,
                    quantity,
                    quantity_unit,
                    origin_country,
                    status,
                    imported_at,
                    updated_at,
                    raw_json,
                    first_seen_at,
                    last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_record_id) DO UPDATE SET
                    permit_number = excluded.permit_number,
                    importer_name = excluded.importer_name,
                    product_name = excluded.product_name,
                    quantity = excluded.quantity,
                    quantity_unit = excluded.quantity_unit,
                    origin_country = excluded.origin_country,
                    status = excluded.status,
                    imported_at = excluded.imported_at,
                    updated_at = excluded.updated_at,
                    raw_json = excluded.raw_json,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    record.source_record_id,
                    record.permit_number,
                    record.importer_name,
                    record.product_name,
                    record.quantity,
                    record.quantity_unit,
                    record.origin_country,
                    record.status,
                    record.imported_at.isoformat() if record.imported_at else None,
                    record.updated_at.isoformat() if record.updated_at else None,
                    json.dumps(record.raw, ensure_ascii=True),
                    now,
                    now,
                ),
            )
            return cursor.rowcount

    def upsert_browser_import(
        self,
        import_reference: str,
        *,
        detail_url: str | None,
        payload: dict[str, Any],
    ) -> None:
        now = _utc_now_iso()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO imports_ui (
                    import_reference,
                    detail_url,
                    raw_json,
                    first_seen_at,
                    last_seen_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(import_reference) DO UPDATE SET
                    detail_url = excluded.detail_url,
                    raw_json = excluded.raw_json,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    import_reference,
                    detail_url,
                    json.dumps(payload, ensure_ascii=True),
                    now,
                    now,
                ),
            )

    def replace_browser_detail(
        self,
        import_reference: str,
        *,
        products: list[dict[str, Any]],
        suppliers: list[dict[str, Any]],
        links: list[dict[str, Any]],
    ) -> None:
        now = _utc_now_iso()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM import_products WHERE import_reference = ?", (import_reference,))
            conn.execute("DELETE FROM import_suppliers WHERE import_reference = ?", (import_reference,))
            conn.execute("DELETE FROM product_supplier_links WHERE import_reference = ?", (import_reference,))

            for row in products:
                conn.execute(
                    """
                    INSERT INTO import_products (
                        import_reference,
                        product_name,
                        supplier_name,
                        raw_json,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        import_reference,
                        row.get("product_name"),
                        row.get("supplier_name"),
                        json.dumps(row, ensure_ascii=True),
                        now,
                    ),
                )

            for row in suppliers:
                conn.execute(
                    """
                    INSERT INTO import_suppliers (
                        import_reference,
                        supplier_name,
                        raw_json,
                        created_at
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        import_reference,
                        row.get("supplier_name"),
                        json.dumps(row, ensure_ascii=True),
                        now,
                    ),
                )

            for row in links:
                conn.execute(
                    """
                    INSERT INTO product_supplier_links (
                        import_reference,
                        product_name,
                        supplier_name,
                        confidence,
                        source,
                        raw_json,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        import_reference,
                        row.get("product_name"),
                        row.get("supplier_name"),
                        row.get("confidence"),
                        row.get("source"),
                        json.dumps(row, ensure_ascii=True),
                        now,
                    ),
                )

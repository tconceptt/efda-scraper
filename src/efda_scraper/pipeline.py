from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from efda_scraper.client import PortalClient, load_catalog
from efda_scraper.config import Settings
from efda_scraper.models import MedicineImportRecord, stable_record_id
from efda_scraper.storage import SQLiteStore

logger = logging.getLogger(__name__)


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    for parser in (datetime.fromisoformat,):
        try:
            return parser(text.replace("Z", "+00:00"))
        except ValueError:
            continue
    return None


def _pick(payload: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return None


def normalize_record(raw: dict[str, Any]) -> MedicineImportRecord:
    return MedicineImportRecord(
        source_record_id=stable_record_id(raw),
        permit_number=_safe_str(_pick(raw, ("permit_number", "permitNo", "permit", "license_no"))),
        importer_name=_safe_str(_pick(raw, ("importer_name", "importerName", "company_name", "importer"))),
        product_name=_safe_str(_pick(raw, ("product_name", "medicine_name", "item_name", "productName"))),
        quantity=_safe_float(_pick(raw, ("quantity", "qty", "approved_quantity"))),
        quantity_unit=_safe_str(_pick(raw, ("quantity_unit", "uom", "unit"))),
        origin_country=_safe_str(_pick(raw, ("origin_country", "country", "country_of_origin"))),
        status=_safe_str(_pick(raw, ("status", "state", "approval_status"))),
        imported_at=_safe_datetime(_pick(raw, ("imported_at", "import_date", "date"))),
        updated_at=_safe_datetime(_pick(raw, ("updated_at", "last_updated", "modified_at"))),
        raw=raw,
    )


def _extract_list(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    for key in ("items", "results", "records", "data", "content"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _write_raw_page(raw_dir: Path, page_number: int, payload: dict[str, Any] | list[Any]) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    destination = raw_dir / f"imports_page_{page_number:04d}.json"
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
    return destination


def run_imports_collection(settings: Settings, max_pages: int | None = None, page_size: int | None = None) -> dict[str, int]:
    catalog = load_catalog(settings.endpoint_catalog_path)
    list_endpoint = catalog.get("imports_list")
    if list_endpoint is None:
        raise ValueError("endpoint catalog must define `imports_list`")

    effective_max_pages = max_pages or settings.max_pages
    effective_page_size = page_size or settings.page_size

    store = SQLiteStore(settings.sqlite_path)
    store.init_schema()

    run_id = store.start_run()
    records_seen = 0
    records_upserted = 0

    client = PortalClient(settings)
    try:
        for page in range(1, effective_max_pages + 1):
            payload = client.request(
                list_endpoint,
                fields={"page": page, "page_size": effective_page_size},
            )

            raw_path = _write_raw_page(settings.raw_output_dir, page, payload)
            logger.info("Saved raw payload for page %s to %s", page, raw_path)

            records = _extract_list(payload)
            if not records:
                logger.info("No records found on page %s, stopping pagination", page)
                break

            for raw in records:
                normalized = normalize_record(raw)
                records_seen += 1
                records_upserted += store.upsert_record(normalized)

        store.finish_run(
            run_id,
            status="success",
            records_seen=records_seen,
            records_upserted=records_upserted,
            message=None,
        )
    except Exception as exc:
        store.finish_run(
            run_id,
            status="error",
            records_seen=records_seen,
            records_upserted=records_upserted,
            message=str(exc),
        )
        raise
    finally:
        client.close()

    return {
        "records_seen": records_seen,
        "records_upserted": records_upserted,
        "pages_attempted": effective_max_pages,
    }

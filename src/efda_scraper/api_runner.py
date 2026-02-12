from __future__ import annotations

import asyncio
import csv
import json
import logging
import re
from pathlib import Path
from typing import Any

from playwright.async_api import Page, async_playwright

from efda_scraper.browser_pipeline import _click_first, _login, _wait_for_idle
from efda_scraper.config import Settings
from efda_scraper.playwright_utils import launch_chromium
from efda_scraper.storage import SQLiteStore

logger = logging.getLogger(__name__)


def _safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("_") or "record"


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "results", "records", "data", "content", "value"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _value_for_keys(row: dict[str, Any], key_tokens: tuple[str, ...]) -> str | None:
    lowered = {str(key).lower(): value for key, value in row.items()}
    for key, value in lowered.items():
        if any(token in key for token in key_tokens):
            text = str(value).strip()
            if text:
                return text
    return None


def _normalize_products(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        product_name = _value_for_keys(row, ("product", "item", "medicine", "drug", "description", "name"))
        supplier_name = _value_for_keys(row, ("supplier", "manufacturer", "vendor"))
        out.append(
            {
                "product_name": product_name,
                "supplier_name": supplier_name,
                "raw": row,
            }
        )
    return out


def _normalize_suppliers(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        supplier_name = _value_for_keys(row, ("supplier", "manufacturer", "vendor", "name", "company"))
        if supplier_name is None:
            for value in row.values():
                text = str(value).strip()
                if text:
                    supplier_name = text
                    break
        out.append(
            {
                "supplier_name": supplier_name,
                "raw": row,
            }
        )
    return out


def _build_links(products: list[dict[str, Any]], suppliers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    supplier_names = [str(item["supplier_name"]).strip() for item in suppliers if item.get("supplier_name")]
    supplier_names = list(dict.fromkeys([name for name in supplier_names if name]))

    links: list[dict[str, Any]] = []
    for product in products:
        product_name = product.get("product_name")
        direct_supplier = product.get("supplier_name")
        if direct_supplier:
            links.append(
                {
                    "product_name": product_name,
                    "supplier_name": direct_supplier,
                    "confidence": "high",
                    "source": "product_row",
                }
            )
            continue

        if len(supplier_names) == 1:
            links.append(
                {
                    "product_name": product_name,
                    "supplier_name": supplier_names[0],
                    "confidence": "medium",
                    "source": "single_supplier_in_import",
                }
            )
            continue

        links.append(
            {
                "product_name": product_name,
                "supplier_name": None,
                "confidence": "low",
                "source": "unresolved",
            }
        )

    return links


def _format_recursive(value: Any, fields: dict[str, Any]) -> Any:
    if isinstance(value, str):
        try:
            return value.format(**fields)
        except Exception:
            return value
    if isinstance(value, dict):
        return {key: _format_recursive(sub, fields) for key, sub in value.items()}
    if isinstance(value, list):
        return [_format_recursive(item, fields) for item in value]
    return value


def _contains_placeholder(value: Any) -> bool:
    pattern = re.compile(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}")
    if isinstance(value, str):
        return bool(pattern.search(value))
    if isinstance(value, dict):
        return any(_contains_placeholder(sub) for sub in value.values())
    if isinstance(value, list):
        return any(_contains_placeholder(item) for item in value)
    return False


def _load_endpoints(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing API endpoints file: {path}. Run `efda-scraper capture-api` first."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    if "imports_list" not in data:
        raise ValueError(
            f"API endpoints file missing imports_list: {path}. Run `efda-scraper capture-api` again."
        )
    return data


async def _browser_fetch_json(
    page: Page,
    *,
    url: str,
    method: str,
    params: dict[str, Any] | None,
    headers: dict[str, str] | None,
    json_body: Any | None,
) -> dict[str, Any]:
    payload = {
        "url": url,
        "method": method.upper(),
        "params": params or {},
        "headers": headers or {},
        "jsonBody": json_body,
    }
    return await page.evaluate(
        """async ({ url, method, params, headers, jsonBody }) => {
            const abs = new URL(url, window.location.origin);
            for (const [key, value] of Object.entries(params || {})) {
                if (value === null || value === undefined) continue;
                abs.searchParams.set(key, String(value));
            }

            const finalHeaders = { ...(headers || {}) };
            let body = undefined;
            if (jsonBody !== null && jsonBody !== undefined && method !== 'GET' && method !== 'HEAD') {
                if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
                    finalHeaders['Content-Type'] = 'application/json';
                }
                body = JSON.stringify(jsonBody);
            }

            const response = await fetch(abs.toString(), {
                method,
                headers: finalHeaders,
                body,
                credentials: 'include',
            });

            const text = await response.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch (_) {
                json = null;
            }

            return {
                ok: response.ok,
                status: response.status,
                url: abs.toString(),
                contentType: response.headers.get('content-type') || '',
                json,
                textPreview: text.slice(0, 1200),
            };
        }""",
        payload,
    )


def _import_identity(raw: dict[str, Any]) -> tuple[str | None, str | None]:
    import_id: str | None = None
    import_reference: str | None = None

    for key in ("id", "importId", "import_id", "requestId", "applicationId", "permitId"):
        value = raw.get(key)
        if value not in (None, ""):
            import_id = str(value)
            break

    for key in ("reference", "referenceNo", "referenceNumber", "permitNo", "permitNumber"):
        value = raw.get(key)
        if value not in (None, ""):
            import_reference = str(value)
            break

    if import_reference is None:
        for value in raw.values():
            text = str(value)
            if "/IP" in text.upper():
                import_reference = text
                break

    return import_id, import_reference


async def _call_endpoint(page: Page, endpoint: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any] | None:
    method = str(endpoint.get("method", "GET")).upper()
    url = _format_recursive(endpoint.get("url", ""), fields)
    params = _format_recursive(endpoint.get("params") or {}, fields)
    json_body = _format_recursive(endpoint.get("json"), fields)
    headers = endpoint.get("headers") or {}

    if _contains_placeholder(url) or _contains_placeholder(params) or _contains_placeholder(json_body):
        return None

    return await _browser_fetch_json(
        page,
        url=url,
        method=method,
        params=params,
        headers=headers,
        json_body=json_body,
    )


async def run_api_collection_async(
    settings: Settings,
    *,
    max_pages: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any]:
    endpoints = _load_endpoints(settings.api_endpoints_path)

    effective_max_pages = max_pages or settings.max_pages
    effective_page_size = page_size or settings.page_size

    store = SQLiteStore(settings.sqlite_path)
    store.init_schema()

    run_id = store.start_run()
    imports_seen = 0
    imports_scraped = 0
    products_seen = 0
    suppliers_seen = 0
    links_seen = 0

    links_csv_path = settings.sqlite_path.parent / "import_product_supplier_links.csv"
    all_link_rows: list[dict[str, str]] = []

    try:
        async with async_playwright() as playwright:
            browser = await launch_chromium(playwright, headless=settings.headless)
            context = await browser.new_context(
                storage_state=str(settings.storage_state_path)
                if settings.storage_state_path.exists()
                else None
            )
            page = await context.new_page()

            await page.goto(settings.base_url, wait_until="domcontentloaded")
            await _wait_for_idle(page, timeout_ms=15_000)

            try:
                await _login(page, settings)
                await context.storage_state(path=str(settings.storage_state_path))
            except Exception as exc:
                logger.warning("Could not perform explicit login during run-api: %s", exc)

            try:
                await _click_first(page, settings.imports_menu_selectors)
                await _wait_for_idle(page, timeout_ms=8_000)
            except Exception as exc:
                logger.warning("Could not auto-open imports menu during run-api: %s", exc)

            for page_num in range(1, effective_max_pages + 1):
                list_result = await _call_endpoint(
                    page,
                    endpoints["imports_list"],
                    {
                        "page": page_num,
                        "page_size": effective_page_size,
                    },
                )
                if list_result is None:
                    raise RuntimeError(
                        "imports_list endpoint has unresolved placeholders. "
                        "Re-run `efda-scraper capture-api` to regenerate endpoint templates."
                    )
                if not list_result.get("ok"):
                    raise RuntimeError(
                        f"imports_list request failed status={list_result.get('status')} url={list_result.get('url')}"
                    )

                payload = list_result.get("json")
                if payload is None:
                    logger.warning(
                        "imports_list response is not JSON on page %s (preview=%s)",
                        page_num,
                        list_result.get("textPreview"),
                    )
                    break

                api_raw_dir = settings.raw_output_dir / "api"
                api_raw_dir.mkdir(parents=True, exist_ok=True)
                raw_list_path = api_raw_dir / f"imports_page_{page_num:04d}.json"
                raw_list_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")

                records = _extract_records(payload)
                logger.info("API page %s returned %s imports", page_num, len(records))
                if not records:
                    break

                for raw_import in records:
                    imports_seen += 1
                    import_id, import_reference = _import_identity(raw_import)
                    fields = {
                        "page": page_num,
                        "page_size": effective_page_size,
                        "import_id": import_id,
                        "id": import_id,
                        "import_reference": import_reference,
                    }

                    products_rows: list[dict[str, Any]] = []
                    suppliers_rows: list[dict[str, Any]] = []

                    if "import_products" in endpoints:
                        products_result = await _call_endpoint(page, endpoints["import_products"], fields)
                        if products_result and products_result.get("ok") and products_result.get("json") is not None:
                            products_rows = _extract_records(products_result["json"])
                        elif products_result and not products_result.get("ok"):
                            logger.warning(
                                "import_products failed for import_id=%s status=%s",
                                import_id,
                                products_result.get("status"),
                            )

                    if "import_suppliers" in endpoints:
                        suppliers_result = await _call_endpoint(page, endpoints["import_suppliers"], fields)
                        if suppliers_result and suppliers_result.get("ok") and suppliers_result.get("json") is not None:
                            suppliers_rows = _extract_records(suppliers_result["json"])
                        elif suppliers_result and not suppliers_result.get("ok"):
                            logger.warning(
                                "import_suppliers failed for import_id=%s status=%s",
                                import_id,
                                suppliers_result.get("status"),
                            )

                    products = _normalize_products(products_rows)
                    suppliers = _normalize_suppliers(suppliers_rows)
                    links = _build_links(products, suppliers)

                    import_reference_key = import_reference or import_id or f"page{page_num}-idx{imports_seen}"

                    payload_out = {
                        "import_reference": import_reference_key,
                        "import_id": import_id,
                        "source_import": raw_import,
                        "products": products,
                        "suppliers": suppliers,
                        "links": links,
                    }

                    raw_detail_path = api_raw_dir / f"import_{_safe_filename(import_reference_key)}.json"
                    raw_detail_path.write_text(json.dumps(payload_out, indent=2, ensure_ascii=True), encoding="utf-8")

                    store.upsert_browser_import(
                        import_reference_key,
                        detail_url=None,
                        payload=payload_out,
                    )
                    store.replace_browser_detail(
                        import_reference_key,
                        products=products,
                        suppliers=suppliers,
                        links=links,
                    )

                    for link in links:
                        all_link_rows.append(
                            {
                                "import_reference": import_reference_key,
                                "product_name": str(link.get("product_name") or ""),
                                "supplier_name": str(link.get("supplier_name") or ""),
                                "confidence": str(link.get("confidence") or ""),
                                "source": str(link.get("source") or ""),
                            }
                        )

                    imports_scraped += 1
                    products_seen += len(products)
                    suppliers_seen += len(suppliers)
                    links_seen += len(links)

            await context.close()
            await browser.close()

        links_csv_path.parent.mkdir(parents=True, exist_ok=True)
        with links_csv_path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=["import_reference", "product_name", "supplier_name", "confidence", "source"],
            )
            writer.writeheader()
            writer.writerows(all_link_rows)

        store.finish_run(
            run_id,
            status="success",
            records_seen=imports_seen,
            records_upserted=imports_scraped,
            message=f"products={products_seen} suppliers={suppliers_seen} links={links_seen}",
        )
    except Exception as exc:
        store.finish_run(
            run_id,
            status="error",
            records_seen=imports_seen,
            records_upserted=imports_scraped,
            message=str(exc),
        )
        raise

    return {
        "imports_seen": imports_seen,
        "imports_scraped": imports_scraped,
        "products_seen": products_seen,
        "suppliers_seen": suppliers_seen,
        "links_seen": links_seen,
        "links_csv": str(links_csv_path),
        "api_capture": str(settings.api_capture_path),
        "api_endpoints": str(settings.api_endpoints_path),
        "endpoint_keys": sorted([key for key in endpoints.keys() if key.startswith("import")]),
    }


def run_api_collection(
    settings: Settings,
    *,
    max_pages: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any]:
    return asyncio.run(
        run_api_collection_async(
            settings,
            max_pages=max_pages,
            page_size=page_size,
        )
    )

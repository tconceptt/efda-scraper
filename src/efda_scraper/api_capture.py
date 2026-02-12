from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse, urlunparse

from playwright.async_api import Request, Response, async_playwright

from efda_scraper.browser_pipeline import _click_first, _login, _wait_for_idle
from efda_scraper.config import Settings
from efda_scraper.playwright_utils import launch_chromium

logger = logging.getLogger(__name__)

_CAPTURE_URL_TOKENS = ("api", "import", "supplier", "product", "permit", "medicine", "eris")
_PAGE_KEYS = {"page", "pageindex", "pagenumber", "currentpage", "skip", "offset", "start"}
_PAGE_SIZE_KEYS = {"pagesize", "size", "limit", "take", "maxresultcount", "length"}
_ID_KEYS = {"id", "importid", "requestid", "applicationid", "permitid"}
_HEADER_WHITELIST = {"accept", "content-type", "x-requested-with"}


@dataclass(slots=True)
class CaptureSummary:
    capture_path: Path
    endpoints_path: Path
    event_count: int
    endpoint_count: int


def _looks_like_api(url: str) -> bool:
    text = url.lower()
    return any(token in text for token in _CAPTURE_URL_TOKENS)


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in {"authorization", "cookie", "set-cookie", "x-csrf-token"}:
            out[key] = "<redacted>"
        else:
            out[key] = value
    return out


def _parse_request_json(request: Request) -> Any:
    try:
        data = request.post_data_json
        return data
    except Exception:
        return None


async def _response_json_or_preview(response: Response, limit: int = 120_000) -> tuple[Any | None, str | None]:
    try:
        text = await response.text()
    except Exception:
        return None, None

    if text is None:
        return None, None

    if len(text) > limit:
        text = text[:limit]

    content_type = response.headers.get("content-type", "").lower()
    if "json" in content_type:
        try:
            return json.loads(text), text[:1200]
        except Exception:
            return None, text[:1200]
    return None, text[:1200]


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "results", "records", "data", "content", "value"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _first_record_identifiers(payload: Any) -> tuple[str | None, str | None]:
    records = _extract_records(payload)
    if not records:
        return None, None
    first = records[0]
    import_id = None
    import_reference = None
    for key in ("id", "importId", "import_id", "requestId", "applicationId"):
        if key in first and first[key] not in (None, ""):
            import_id = str(first[key])
            break
    for key in ("reference", "referenceNo", "referenceNumber", "permitNo", "permitNumber"):
        if key in first and first[key] not in (None, ""):
            import_reference = str(first[key])
            break
    return import_id, import_reference


def _key_placeholder(key: str) -> str | None:
    lower = key.lower()
    if lower in _PAGE_KEYS:
        return "{page}"
    if lower in _PAGE_SIZE_KEYS:
        return "{page_size}"
    if lower in _ID_KEYS or ("import" in lower and "id" in lower):
        return "{import_id}"
    if "reference" in lower or "permit" in lower:
        return "{import_reference}"
    return None


def _template_json_value(value: Any, key_hint: str | None = None) -> Any:
    if isinstance(value, dict):
        return {key: _template_json_value(sub, key) for key, sub in value.items()}
    if isinstance(value, list):
        return [_template_json_value(item, key_hint) for item in value]
    if key_hint is not None:
        ph = _key_placeholder(key_hint)
        if ph is not None:
            return ph
    return value


def _template_from_event(event: dict[str, Any], *, role: str) -> dict[str, Any]:
    parsed = urlparse(event["url"])
    query = parse_qs(parsed.query, keep_blank_values=True)

    path_segments = parsed.path.split("/")
    templated_segments: list[str] = []
    for segment in path_segments:
        if not segment:
            templated_segments.append(segment)
            continue
        if role != "imports_list" and (segment.isdigit() or re.fullmatch(r"[0-9a-fA-F-]{16,}", segment)):
            templated_segments.append("{import_id}")
            continue
        templated_segments.append(segment)
    path_template = "/".join(templated_segments)

    params_template: dict[str, str] = {}
    for key, values in query.items():
        value = values[0] if values else ""
        params_template[key] = _key_placeholder(key) or value

    request_json = event.get("request_json")
    json_template: Any | None = None
    if request_json is not None:
        json_template = _template_json_value(request_json)

    request_headers = {str(k): str(v) for k, v in (event.get("request_headers") or {}).items()}
    headers_template = {
        key: value
        for key, value in request_headers.items()
        if key.lower() in _HEADER_WHITELIST and value not in ("", "<redacted>")
    }

    return {
        "method": event["method"],
        "url": urlunparse((parsed.scheme, parsed.netloc, path_template, "", "", "")),
        "params": params_template,
        "json": json_template,
        "headers": headers_template,
        "sample_url": event["url"],
        "sample_status": event.get("status"),
    }


def _score_imports_list(event: dict[str, Any]) -> float:
    url = event["url"].lower()
    payload = event.get("response_json")
    records = _extract_records(payload)

    score = 0.0
    if records:
        score += 50
    if "import" in url:
        score += 25
    if "product" in url or "supplier" in url:
        score -= 25
    if event.get("method") in {"GET", "POST"}:
        score += 5

    parsed = urlparse(event["url"])
    query_keys = [key.lower() for key in parse_qs(parsed.query).keys()]
    if any(key in _PAGE_KEYS for key in query_keys):
        score += 10
    if any(key in _PAGE_SIZE_KEYS for key in query_keys):
        score += 10

    if records:
        keys = {str(k).lower() for k in records[0].keys()}
        if any("id" in key for key in keys):
            score += 8
        if any("reference" in key or "permit" in key for key in keys):
            score += 8
    return score


def _score_role(event: dict[str, Any], role: str) -> float:
    url = event["url"].lower()
    payload = event.get("response_json")
    records = _extract_records(payload)

    score = 0.0
    if role == "import_products":
        if "product" in url:
            score += 40
        if "import" in url:
            score += 10
        if "supplier" in url:
            score -= 10
        if records:
            score += 30
    elif role == "import_suppliers":
        if "supplier" in url:
            score += 40
        if "import" in url:
            score += 10
        if "product" in url:
            score -= 10
        if records:
            score += 30
    elif role == "import_detail":
        if "import" in url:
            score += 25
        if isinstance(payload, dict):
            score += 25
        if records:
            score -= 15
    if event.get("method") in {"GET", "POST"}:
        score += 5
    return score


def _infer_endpoints(events: list[dict[str, Any]]) -> dict[str, Any]:
    successful = [
        event
        for event in events
        if isinstance(event.get("status"), int)
        and int(event["status"]) < 400
        and event.get("response_json") is not None
        and _looks_like_api(event.get("url", ""))
    ]

    if not successful:
        return {}

    imports_list = max(successful, key=_score_imports_list)
    endpoints: dict[str, Any] = {
        "imports_list": _template_from_event(imports_list, role="imports_list")
    }

    for role in ("import_detail", "import_products", "import_suppliers"):
        ranked = sorted(successful, key=lambda event: _score_role(event, role), reverse=True)
        if not ranked:
            continue
        best = ranked[0]
        if _score_role(best, role) < 20:
            continue
        endpoints[role] = _template_from_event(best, role=role)

    import_id, import_reference = _first_record_identifiers(imports_list.get("response_json"))
    endpoints["sample_fields"] = {
        "page": 1,
        "page_size": 50,
        "import_id": import_id,
        "import_reference": import_reference,
    }
    endpoints["captured_event_count"] = len(events)
    return endpoints


async def _auto_navigation(page, settings: Settings) -> None:
    try:
        await _click_first(page, settings.imports_menu_selectors)
        await _wait_for_idle(page, timeout_ms=8_000)
        await page.wait_for_timeout(1_000)
    except Exception as exc:
        logger.warning("Could not auto-open imports menu: %s", exc)

    try:
        candidate = page.get_by_text(re.compile(r"\d+\s*/\s*IP", re.IGNORECASE)).first
        if await candidate.count() > 0:
            await candidate.click(timeout=5_000)
            await _wait_for_idle(page, timeout_ms=8_000)
            await page.wait_for_timeout(800)
    except Exception as exc:
        logger.warning("Could not auto-open first import row: %s", exc)

    for tab_name in ("Products", "Suppliers"):
        try:
            tab = page.get_by_text(tab_name, exact=False).first
            if await tab.count() > 0 and await tab.is_visible():
                await tab.click(timeout=3_000)
                await page.wait_for_timeout(700)
        except Exception as exc:
            logger.warning("Could not open %s tab during capture: %s", tab_name, exc)


async def capture_api_session(
    settings: Settings,
    *,
    duration_seconds: int | None = None,
    start_url: str | None = None,
) -> CaptureSummary:
    duration = duration_seconds or settings.api_capture_duration_seconds
    settings.api_capture_path.parent.mkdir(parents=True, exist_ok=True)
    settings.api_endpoints_path.parent.mkdir(parents=True, exist_ok=True)

    events_by_key: dict[str, dict[str, Any]] = {}
    pending_tasks: set[asyncio.Task[Any]] = set()

    async with async_playwright() as playwright:
        browser = await launch_chromium(playwright, headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        async def on_request(request: Request) -> None:
            if request.resource_type not in {"xhr", "fetch"}:
                return
            if not _looks_like_api(request.url):
                return

            key = f"{request.method} {request.url}"
            if key not in events_by_key:
                events_by_key[key] = {
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                    "request_headers": _redact_headers(dict(request.headers)),
                    "request_json": _parse_request_json(request),
                    "status": None,
                    "response_headers": {},
                    "response_json": None,
                    "response_preview": None,
                }

        async def on_response(response: Response) -> None:
            request = response.request
            if request.resource_type not in {"xhr", "fetch"}:
                return
            if not _looks_like_api(response.url):
                return

            key = f"{request.method} {request.url}"
            event = events_by_key.setdefault(
                key,
                {
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                    "request_headers": _redact_headers(dict(request.headers)),
                    "request_json": _parse_request_json(request),
                    "status": None,
                    "response_headers": {},
                    "response_json": None,
                    "response_preview": None,
                },
            )
            event["status"] = response.status
            event["response_headers"] = _redact_headers(dict(response.headers))
            response_json, response_preview = await _response_json_or_preview(response)
            event["response_json"] = response_json
            event["response_preview"] = response_preview

        def _track(task: asyncio.Task[Any]) -> None:
            pending_tasks.add(task)
            task.add_done_callback(lambda t: pending_tasks.discard(t))

        page.on("request", lambda request: _track(asyncio.create_task(on_request(request))))
        page.on("response", lambda response: _track(asyncio.create_task(on_response(response))))

        target_url = start_url or settings.base_url
        logger.info("Opening %s for API capture", target_url)

        await _login(page, settings)
        await context.storage_state(path=str(settings.storage_state_path))

        try:
            await page.goto(target_url, wait_until="domcontentloaded")
        except Exception:
            pass

        await _wait_for_idle(page, timeout_ms=12_000)
        await _auto_navigation(page, settings)

        logger.info(
            "Capturing API traffic for %ss. You can keep clicking imports/products/suppliers in the browser window.",
            duration,
        )
        started = time.time()
        while time.time() - started < duration:
            await page.wait_for_timeout(400)

        if pending_tasks:
            await asyncio.gather(*pending_tasks, return_exceptions=True)

        await context.close()
        await browser.close()

    items = sorted(events_by_key.values(), key=lambda event: event["url"])
    capture_payload = {
        "captured_at": int(time.time()),
        "count": len(items),
        "items": items,
    }
    settings.api_capture_path.write_text(json.dumps(capture_payload, indent=2), encoding="utf-8")

    endpoints = _infer_endpoints(items)
    settings.api_endpoints_path.write_text(json.dumps(endpoints, indent=2), encoding="utf-8")

    logger.info("Wrote API capture file: %s", settings.api_capture_path)
    logger.info("Wrote inferred endpoint file: %s", settings.api_endpoints_path)

    return CaptureSummary(
        capture_path=settings.api_capture_path,
        endpoints_path=settings.api_endpoints_path,
        event_count=len(items),
        endpoint_count=len([k for k in endpoints.keys() if k.startswith("import")]),
    )


def capture_api_sync(
    settings: Settings,
    *,
    duration_seconds: int | None = None,
    start_url: str | None = None,
) -> CaptureSummary:
    return asyncio.run(
        capture_api_session(
            settings,
            duration_seconds=duration_seconds,
            start_url=start_url,
        )
    )

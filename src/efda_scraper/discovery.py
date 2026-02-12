from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

from playwright.async_api import Page, Response, async_playwright

from efda_scraper.config import Settings

logger = logging.getLogger(__name__)


async def _response_summary(response: Response) -> dict[str, Any]:
    content_type = response.headers.get("content-type", "")
    body_preview = ""
    if "application/json" in content_type:
        try:
            body_preview = await response.text()
            body_preview = body_preview[:1000]
        except Exception:
            body_preview = "<unavailable>"
    return {
        "url": response.url,
        "status": response.status,
        "method": response.request.method,
        "resource_type": response.request.resource_type,
        "content_type": content_type,
        "body_preview": body_preview,
    }


async def discover_endpoints(
    settings: Settings,
    duration_seconds: int = 30,
    start_url: str | None = None,
) -> Path:
    destination = settings.storage_state_path.parent / "discovered_endpoints.json"
    destination.parent.mkdir(parents=True, exist_ok=True)

    found: list[dict[str, Any]] = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context(
            storage_state=str(settings.storage_state_path)
            if settings.storage_state_path.exists()
            else None
        )
        page = await context.new_page()

        async def handle_response(response: Response) -> None:
            url = response.url.lower()
            if any(token in url for token in ("api", "import", "medicine", "permit", "eris")):
                found.append(await _response_summary(response))

        page.on("response", lambda resp: asyncio.create_task(handle_response(resp)))

        target_url = start_url or settings.base_url
        logger.info("Opening %s and recording network calls for %ss", target_url, duration_seconds)
        await page.goto(target_url, wait_until="domcontentloaded")

        started = time.time()
        while time.time() - started < duration_seconds:
            await page.wait_for_timeout(500)

        await context.close()
        await browser.close()

    unique_by_url: dict[tuple[str, str], dict[str, Any]] = {}
    for item in found:
        key = (item["method"], item["url"])
        if key not in unique_by_url:
            unique_by_url[key] = item

    payload = {
        "captured_at": int(time.time()),
        "count": len(unique_by_url),
        "items": sorted(unique_by_url.values(), key=lambda x: x["url"]),
    }
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Wrote endpoint discovery file: %s", destination)

    return destination


def discover_sync(settings: Settings, duration_seconds: int = 30, start_url: str | None = None) -> Path:
    return asyncio.run(discover_endpoints(settings, duration_seconds=duration_seconds, start_url=start_url))

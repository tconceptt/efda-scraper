from __future__ import annotations

import asyncio
import csv
import json
import logging
import re
import time
from pathlib import Path
from typing import Any

from playwright.async_api import (
    Locator,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

from efda_scraper.config import Settings
from efda_scraper.playwright_utils import launch_chromium
from efda_scraper.storage import SQLiteStore

logger = logging.getLogger(__name__)


def _safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("_") or "record"


def _iter_contexts(page: Page) -> list[tuple[str, Any]]:
    contexts: list[tuple[str, Any]] = [("page", page)]
    for idx, frame in enumerate(page.frames):
        if frame == page.main_frame:
            continue
        contexts.append((f"frame[{idx}] {frame.url or '<about:blank>'}", frame))
    return contexts


async def _visible_locator(root: Any, selector: str) -> Locator | None:
    locator = root.locator(selector)
    count = await locator.count()
    for idx in range(min(count, 6)):
        candidate = locator.nth(idx)
        try:
            if await candidate.is_visible():
                return candidate
        except Exception:
            continue
    if count > 0:
        return locator.first
    return None


async def _fill_first(page: Page, selectors: list[str], value: str) -> str:
    for selector in selectors:
        for ctx_name, ctx in _iter_contexts(page):
            locator = await _visible_locator(ctx, selector)
            if locator is not None:
                await locator.fill(value)
                return f"{selector} [{ctx_name}]"
    raise ValueError(f"None of the selectors matched: {selectors}")


async def _click_first(page: Page, selectors: list[str]) -> str:
    for selector in selectors:
        for ctx_name, ctx in _iter_contexts(page):
            locator = await _visible_locator(ctx, selector)
            if locator is not None:
                await locator.click()
                return f"{selector} [{ctx_name}]"
    raise ValueError(f"None of the selectors matched: {selectors}")


async def _fill_fallback_username(page: Page, value: str) -> str:
    for ctx_name, ctx in _iter_contexts(page):
        candidates = [
            ("get_by_label('Username')", ctx.get_by_label("Username", exact=False).first),
            ("get_by_role('textbox', name~Username)", ctx.get_by_role("textbox", name=re.compile("username|email", re.I)).first),
            ("get_by_role('textbox').nth(0)", ctx.get_by_role("textbox").nth(0)),
            ("input[type='text']", ctx.locator("input[type='text']").first),
            ("input:not([type='password'])", ctx.locator("input:not([type='password'])").first),
            ("input.nth(0)", ctx.locator("input").nth(0)),
        ]
        for name, locator in candidates:
            try:
                if await locator.count() == 0:
                    continue
                if not await locator.is_visible():
                    continue
                await locator.fill(value)
                return f"{name} [{ctx_name}]"
            except Exception:
                continue
    raise ValueError("Could not find username input using fallback locators")


async def _fill_fallback_password(page: Page, value: str) -> str:
    for ctx_name, ctx in _iter_contexts(page):
        candidates = [
            ("get_by_label('Password')", ctx.get_by_label("Password", exact=False).first),
            ("input[type='password']", ctx.locator("input[type='password']").first),
            ("get_by_role('textbox', name~Password)", ctx.get_by_role("textbox", name=re.compile("password|\\*+", re.I)).first),
            ("input[autocomplete='current-password']", ctx.locator("input[autocomplete='current-password']").first),
            ("get_by_role('textbox').nth(1)", ctx.get_by_role("textbox").nth(1)),
            ("input.nth(1)", ctx.locator("input").nth(1)),
        ]
        for name, locator in candidates:
            try:
                if await locator.count() == 0:
                    continue
                if not await locator.is_visible():
                    continue
                await locator.fill(value)
                return f"{name} [{ctx_name}]"
            except Exception:
                continue
    raise ValueError("Could not find password input using fallback locators")


async def _any_visible(page: Page, selectors: list[str]) -> bool:
    for _, ctx in _iter_contexts(page):
        for selector in selectors:
            locator = await _visible_locator(ctx, selector)
            if locator is not None:
                return True
    return False


async def _wait_for_idle(page: Page, timeout_ms: int = 15_000) -> None:
    try:
        await page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        logger.warning("Timed out waiting for network idle")


def _is_login_url(url: str) -> bool:
    text = url.lower()
    return "account/login" in text or "/connect/authorize" in text or "auth-callback?to=signin" in text


async def _wait_for_login_outcome(page: Page, settings: Settings, timeout_ms: int = 30_000) -> tuple[bool, str]:
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_reason = "unknown"

    while time.monotonic() < deadline:
        if await _any_visible(page, settings.imports_menu_selectors):
            return True, "imports_menu_visible"

        username_visible = await _any_visible(page, settings.username_selectors)
        password_visible = await _any_visible(page, settings.password_selectors)
        login_controls_visible = username_visible and password_visible
        login_url = _is_login_url(page.url)

        if not login_controls_visible and not login_url:
            return True, "left_login_screen"

        if login_controls_visible and login_url:
            last_reason = "still_on_login_screen"
        elif login_url:
            last_reason = "still_on_login_url"
        else:
            last_reason = "transitioning"

        await page.wait_for_timeout(500)

    return False, last_reason


async def _extract_login_error_text(page: Page) -> str | None:
    selectors = [
        "[role='alert']",
        ".alert",
        ".text-danger",
        ".validation-summary-errors",
        ".mat-mdc-form-field-error",
        ".invalid-feedback",
    ]
    for _, ctx in _iter_contexts(page):
        for selector in selectors:
            try:
                locator = await _visible_locator(ctx, selector)
                if locator is None:
                    continue
                text = (await locator.inner_text()).strip()
                if text:
                    return text
            except Exception:
                continue
    return None


async def _wait_for_login_controls(page: Page, timeout_ms: int = 25_000) -> None:
    deadline = time.monotonic() + (timeout_ms / 1000)
    while time.monotonic() < deadline:
        for _, ctx in _iter_contexts(page):
            try:
                if await ctx.get_by_role("textbox").count() > 0:
                    return
                if await ctx.locator("input").count() > 0:
                    return
            except Exception:
                continue
        await page.wait_for_timeout(300)

    frame_stats: list[str] = []
    for name, ctx in _iter_contexts(page):
        try:
            textbox_count = await ctx.get_by_role("textbox").count()
            input_count = await ctx.locator("input").count()
            frame_stats.append(f"{name}:textbox={textbox_count},input={input_count}")
        except Exception:
            frame_stats.append(f"{name}:unavailable")
    raise RuntimeError(
        "Could not detect login form controls after waiting. "
        f"url={page.url} frames={'; '.join(frame_stats)}"
    )


async def _login(page: Page, settings: Settings) -> None:
    if not settings.username or not settings.password:
        raise ValueError("EFDA_USERNAME and EFDA_PASSWORD must be set")

    await page.goto(settings.base_url, wait_until="domcontentloaded")
    await _wait_for_idle(page, timeout_ms=20_000)
    await _wait_for_login_controls(page, timeout_ms=25_000)

    try:
        user_selector = await _fill_first(page, settings.username_selectors, settings.username)
    except ValueError:
        user_selector = await _fill_fallback_username(page, settings.username)

    try:
        pass_selector = await _fill_first(page, settings.password_selectors, settings.password)
    except ValueError:
        pass_selector = await _fill_fallback_password(page, settings.password)

    try:
        submit_selector = await _click_first(page, settings.submit_selectors)
    except ValueError:
        submit_selector = "get_by_role('button', name~Login)"
        await page.get_by_role("button", name=re.compile("login|sign in", re.I)).first.click()

    logger.info(
        "Submitted login using selectors user=%s password=%s submit=%s",
        user_selector,
        pass_selector,
        submit_selector,
    )

    await _wait_for_idle(page, timeout_ms=20_000)
    ok, outcome_reason = await _wait_for_login_outcome(page, settings, timeout_ms=30_000)

    if settings.post_login_url_contains and settings.post_login_url_contains not in page.url:
        logger.warning(
            "Current URL (%s) does not include EFDA_POST_LOGIN_URL_CONTAINS=%s",
            page.url,
            settings.post_login_url_contains,
        )

    if not ok:
        username_visible = await _any_visible(page, settings.username_selectors)
        password_visible = await _any_visible(page, settings.password_selectors)
        login_controls_visible = username_visible and password_visible
        login_error_text = await _extract_login_error_text(page)
        message = (
            "Login did not complete after submit. "
            f"reason={outcome_reason} url={page.url} "
            f"login_controls_visible={login_controls_visible}. "
            f"portal_error={login_error_text!r}. "
            "Check credentials and whether the portal needs extra verification."
        )
        if settings.strict_login_check:
            raise RuntimeError(message)
        logger.warning(message)


async def _navigate_to_imports(page: Page, settings: Settings) -> str:
    selector = await _click_first(page, settings.imports_menu_selectors)
    await _wait_for_idle(page, timeout_ms=12_000)
    await page.wait_for_timeout(500)
    logger.info("Opened imports section with selector: %s", selector)
    return selector


def _normalize_import_ref(value: str) -> str:
    text = re.sub(r"\s+", "", value).strip()
    text = text.replace("/ip/", "/IP/")
    text = text.replace("/Ip/", "/IP/").replace("/iP/", "/IP/")
    return text


def _extract_import_refs_from_text(text: str, user_pattern: str) -> list[str]:
    refs: list[str] = []

    patterns = [r"\d+\s*/\s*IP\s*/?\s*[A-Za-z0-9-]*"]
    try:
        re.compile(user_pattern)
        patterns.insert(0, user_pattern)
    except re.error:
        pass

    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _normalize_import_ref(match.group(0))
            if "/IP" in value.upper():
                refs.append(value)

    return refs


async def _collect_import_click_tokens_from_page(page: Page, limit: int = 80) -> list[str]:
    tokens: list[str] = []
    for _, ctx in _iter_contexts(page):
        row_selectors = ["tbody tr", "[role='row']", ".datatable-body-row", ".ag-row"]
        for selector in row_selectors:
            try:
                rows = ctx.locator(selector)
                count = min(await rows.count(), limit)
                for idx in range(count):
                    row = rows.nth(idx)
                    try:
                        if not await row.is_visible():
                            continue
                        text = (await row.inner_text()).strip()
                        text = re.sub(r"\s+", " ", text)
                        if not text:
                            continue
                        if text.lower().startswith("no data"):
                            continue
                        upper = text.upper()
                        if "/IP" in upper or "IP/" in upper or re.search(r"\d+\s*/", text):
                            tokens.append(text)
                    except Exception:
                        continue
            except Exception:
                continue
    return list(dict.fromkeys(tokens))


async def _detect_import_ref_on_detail(page: Page, pattern: str) -> str | None:
    for _, ctx in _iter_contexts(page):
        blobs: list[str] = []
        try:
            text = await ctx.locator("body").inner_text()
            if text:
                blobs.append(text)
        except Exception:
            pass
        try:
            html = await ctx.content()
            if html:
                blobs.append(html)
        except Exception:
            pass

        for blob in blobs:
            refs = _extract_import_refs_from_text(blob, pattern)
            if refs:
                return refs[0]
    return None


async def _collect_import_refs_from_page(page: Page, pattern: str) -> list[str]:
    refs: list[str] = []

    for ctx_name, ctx in _iter_contexts(page):
        text_blobs: list[str] = []

        try:
            body = await ctx.locator("body").inner_text()
            if body:
                text_blobs.append(body)
        except Exception:
            pass

        try:
            html = await ctx.content()
            if html:
                text_blobs.append(html)
        except Exception:
            pass

        try:
            candidates = ctx.get_by_text(re.compile(r"/\s*IP", re.IGNORECASE))
            count = min(await candidates.count(), 300)
            for idx in range(count):
                locator = candidates.nth(idx)
                try:
                    if not await locator.is_visible():
                        continue
                    text = (await locator.inner_text()).strip()
                    if text:
                        text_blobs.append(text)
                except Exception:
                    continue
        except Exception:
            pass

        ctx_refs: list[str] = []
        for blob in text_blobs:
            ctx_refs.extend(_extract_import_refs_from_text(blob, pattern))

        if ctx_refs:
            logger.debug("Found %s candidate refs in %s", len(ctx_refs), ctx_name)
            refs.extend(ctx_refs)

    deduped = list(dict.fromkeys(refs))
    return deduped


async def _click_next_page(page: Page, selectors: list[str]) -> bool:
    for ctx_name, ctx in _iter_contexts(page):
        for selector in selectors:
            locator = await _visible_locator(ctx, selector)
            if locator is None:
                continue
            try:
                if await locator.is_disabled():
                    continue
            except Exception:
                pass
            await locator.click()
            await _wait_for_idle(page, timeout_ms=12_000)
            await page.wait_for_timeout(500)
            logger.info("Moved to next imports page using selector %s [%s]", selector, ctx_name)
            return True
    return False


async def _open_import_detail(page: Page, import_ref: str) -> None:
    safe_ref = import_ref.replace("\\", "\\\\").replace("'", "\\'")
    escaped = re.escape(import_ref)
    flexible = escaped.replace(r"\/", r"\s*/\s*")
    flexible_regex = re.compile(flexible, re.IGNORECASE)

    for ctx_name, ctx in _iter_contexts(page):
        targets = [
            ctx.locator(f"a:has-text('{safe_ref}')").first,
            ctx.get_by_text(import_ref, exact=False).first,
            ctx.get_by_text(flexible_regex).first,
            ctx.locator(f"text={safe_ref}").first,
        ]
        for locator in targets:
            try:
                if await locator.count() == 0:
                    continue
                if not await locator.is_visible():
                    continue
                await locator.click(timeout=6_000)
                await _wait_for_idle(page, timeout_ms=15_000)
                await page.wait_for_timeout(700)
                logger.debug("Opened import detail for %s via %s", import_ref, ctx_name)
                return
            except Exception:
                continue
    raise RuntimeError(f"Could not click import reference: {import_ref}")


async def _extract_rows_from_visible_grid(page: Page) -> list[dict[str, str]]:
    rows = await page.evaluate(
        """() => {
            const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            const datasets = [];

            for (const table of Array.from(document.querySelectorAll('table'))) {
              if (!isVisible(table)) continue;
              const headerCells = Array.from(table.querySelectorAll('thead th'));
              const headers = headerCells.map((cell) => normalize(cell.textContent)).filter(Boolean);
              const rowEls = Array.from(table.querySelectorAll('tbody tr')).filter(isVisible);
              const tableRows = [];
              for (const rowEl of rowEls) {
                const cells = Array.from(rowEl.querySelectorAll('td, th')).map((cell) => normalize(cell.textContent));
                if (cells.some(Boolean)) tableRows.push(cells);
              }
              if (tableRows.length > 0) datasets.push({headers, rows: tableRows});
            }

            for (const grid of Array.from(document.querySelectorAll("[role='grid'], [role='table'], .datatable-body, .ag-root"))) {
              if (!isVisible(grid)) continue;
              const headerCells = Array.from(grid.querySelectorAll("[role='columnheader'], .datatable-header-cell, .ag-header-cell-text"));
              const headers = headerCells.map((cell) => normalize(cell.textContent)).filter(Boolean);
              const rowEls = Array.from(grid.querySelectorAll("[role='row'], .datatable-body-row, .ag-row")).filter(isVisible);
              const gridRows = [];
              for (const rowEl of rowEls) {
                const cells = Array.from(rowEl.querySelectorAll("[role='gridcell'], [role='cell'], td, .datatable-body-cell, .ag-cell"))
                  .map((cell) => normalize(cell.textContent));
                if (cells.some(Boolean)) gridRows.push(cells);
              }
              if (gridRows.length > 0) datasets.push({headers, rows: gridRows});
            }

            if (datasets.length === 0) return [];

            datasets.sort((a, b) => b.rows.length - a.rows.length);
            const best = datasets[0];
            const fallbackWidth = Math.max(...best.rows.map((row) => row.length), 0);
            const headers = best.headers.length > 0
              ? best.headers
              : Array.from({length: fallbackWidth}, (_, i) => `col_${i + 1}`);

            return best.rows.map((row) => {
              const out = {};
              for (let i = 0; i < row.length; i += 1) {
                const key = headers[i] || `col_${i + 1}`;
                out[key] = row[i];
              }
              return out;
            });
        }"""
    )

    return [row for row in rows if isinstance(row, dict)]


def _value_for_keys(row: dict[str, str], key_tokens: tuple[str, ...]) -> str | None:
    lowered = {str(key).lower(): value for key, value in row.items()}
    for key, value in lowered.items():
        if any(token in key for token in key_tokens):
            text = str(value).strip()
            if text:
                return text
    return None


def _normalize_products(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
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


def _normalize_suppliers(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        supplier_name = _value_for_keys(row, ("supplier", "manufacturer", "vendor", "name", "company"))
        if supplier_name is None:
            # Fall back to the first non-empty cell.
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


def _build_links(
    products: list[dict[str, Any]],
    suppliers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
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


async def _open_tab_and_extract(page: Page, tab_selectors: list[str]) -> list[dict[str, str]]:
    _ = await _click_first(page, tab_selectors)
    await page.wait_for_timeout(500)
    await _wait_for_idle(page, timeout_ms=8_000)
    return await _extract_rows_from_visible_grid(page)


async def run_browser_collection_async(
    settings: Settings,
    *,
    max_pages: int | None = None,
    max_imports: int | None = None,
) -> dict[str, Any]:
    effective_max_pages = max_pages or settings.max_pages
    effective_max_imports = max_imports if max_imports is not None else settings.max_imports

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

    seen_refs: set[str] = set()

    try:
        async with async_playwright() as playwright:
            browser = await launch_chromium(playwright, headless=settings.headless)
            context = await browser.new_context()
            page = await context.new_page()

            await _login(page, settings)
            await context.storage_state(path=str(settings.storage_state_path))
            await _navigate_to_imports(page, settings)

            for page_num in range(1, effective_max_pages + 1):
                refs = await _collect_import_refs_from_page(page, settings.import_reference_pattern)
                page_refs = [ref for ref in refs if ref not in seen_refs]

                click_tokens: list[str] = []
                token_mode = False
                if not page_refs:
                    click_tokens = await _collect_import_click_tokens_from_page(page)
                    click_tokens = [token for token in click_tokens if token not in seen_refs]
                    token_mode = len(click_tokens) > 0

                logger.info(
                    "Imports page %s: discovered %s references%s",
                    page_num,
                    len(page_refs),
                    f", fallback tokens={len(click_tokens)}" if token_mode else "",
                )

                import_targets = page_refs if page_refs else click_tokens
                if not import_targets:
                    raw_dir = settings.raw_output_dir / "ui"
                    raw_dir.mkdir(parents=True, exist_ok=True)
                    dump_path = raw_dir / f"imports_page_{page_num:04d}_debug.html"
                    try:
                        dump_path.write_text(await page.content(), encoding="utf-8")
                        logger.warning("No import targets found; wrote debug HTML to %s", dump_path)
                    except Exception:
                        logger.warning("No import targets found and failed to write debug HTML")

                for import_target in import_targets:
                    if effective_max_imports and imports_scraped >= effective_max_imports:
                        break

                    imports_seen += 1

                    try:
                        await _open_import_detail(page, import_target)
                        import_ref = await _detect_import_ref_on_detail(page, settings.import_reference_pattern) or import_target
                        import_ref = _normalize_import_ref(import_ref)
                        seen_refs.add(import_ref)

                        products_raw = await _open_tab_and_extract(page, settings.products_tab_selectors)
                        suppliers_raw = await _open_tab_and_extract(page, settings.suppliers_tab_selectors)

                        products = _normalize_products(products_raw)
                        suppliers = _normalize_suppliers(suppliers_raw)
                        links = _build_links(products, suppliers)

                        payload = {
                            "import_reference": import_ref,
                            "detail_url": page.url,
                            "products": products,
                            "suppliers": suppliers,
                            "links": links,
                        }

                        raw_dir = settings.raw_output_dir / "ui"
                        raw_dir.mkdir(parents=True, exist_ok=True)
                        raw_path = raw_dir / f"import_{_safe_filename(import_ref)}.json"
                        raw_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")

                        store.upsert_browser_import(import_ref, detail_url=page.url, payload=payload)
                        store.replace_browser_detail(
                            import_ref,
                            products=products,
                            suppliers=suppliers,
                            links=links,
                        )

                        for link in links:
                            all_link_rows.append(
                                {
                                    "import_reference": import_ref,
                                    "product_name": str(link.get("product_name") or ""),
                                    "supplier_name": str(link.get("supplier_name") or ""),
                                    "confidence": str(link.get("confidence") or ""),
                                    "source": str(link.get("source") or ""),
                                }
                            )

                        products_seen += len(products)
                        suppliers_seen += len(suppliers)
                        links_seen += len(links)
                        imports_scraped += 1
                        logger.info(
                            "Scraped %s: products=%s suppliers=%s links=%s",
                            import_ref,
                            len(products),
                            len(suppliers),
                            len(links),
                        )
                    except Exception as exc:
                        logger.exception("Failed to scrape import target %s: %s", import_target, exc)
                    finally:
                        try:
                            await page.go_back(wait_until="domcontentloaded")
                            await _wait_for_idle(page, timeout_ms=12_000)
                            await page.wait_for_timeout(600)
                        except Exception:
                            await _navigate_to_imports(page, settings)

                if effective_max_imports and imports_scraped >= effective_max_imports:
                    break

                moved = await _click_next_page(page, settings.imports_next_page_selectors)
                if not moved:
                    break

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
    }


def run_browser_collection(
    settings: Settings,
    *,
    max_pages: int | None = None,
    max_imports: int | None = None,
) -> dict[str, Any]:
    return asyncio.run(
        run_browser_collection_async(
            settings,
            max_pages=max_pages,
            max_imports=max_imports,
        )
    )

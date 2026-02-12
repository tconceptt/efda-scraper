from __future__ import annotations

import asyncio
import logging
import re
import time
from pathlib import Path

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError, async_playwright

from efda_scraper.config import Settings
from efda_scraper.playwright_utils import launch_chromium

logger = logging.getLogger(__name__)


async def _visible_locator(page: Page, selector: str):
    locator = page.locator(selector)
    count = await locator.count()
    for idx in range(min(count, 5)):
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
        locator = await _visible_locator(page, selector)
        if locator is not None:
            await locator.fill(value)
            return selector
    raise ValueError(f"None of the selectors matched: {selectors}")


async def _click_first(page: Page, selectors: list[str]) -> str:
    for selector in selectors:
        locator = await _visible_locator(page, selector)
        if locator is not None:
            await locator.click()
            return selector
    raise ValueError(f"None of the selectors matched: {selectors}")


async def _fill_fallback_username(page: Page, value: str) -> str:
    candidates = [
        ("get_by_label('Username')", page.get_by_label("Username", exact=False).first),
        ("get_by_role('textbox', name~Username)", page.get_by_role("textbox", name=re.compile("username", re.I)).first),
        ("input[type='text']", page.locator("input[type='text']").first),
        ("input:not([type='password'])", page.locator("input:not([type='password'])").first),
        ("input", page.locator("input").first),
    ]
    for name, locator in candidates:
        try:
            if await locator.count() == 0:
                continue
            if not await locator.is_visible():
                continue
            await locator.fill(value)
            return name
        except Exception:
            continue
    raise ValueError("Could not find username input using fallback locators")


async def _fill_fallback_password(page: Page, value: str) -> str:
    candidates = [
        ("get_by_label('Password')", page.get_by_label("Password", exact=False).first),
        ("get_by_role('textbox', name~Password)", page.get_by_role("textbox", name=re.compile("password|\\*+", re.I)).first),
        ("input[type='password']", page.locator("input[type='password']").first),
        ("input[autocomplete='current-password']", page.locator("input[autocomplete='current-password']").first),
    ]
    for name, locator in candidates:
        try:
            if await locator.count() == 0:
                continue
            if not await locator.is_visible():
                continue
            await locator.fill(value)
            return name
        except Exception:
            continue
    raise ValueError("Could not find password input using fallback locators")


async def _any_visible(page: Page, selectors: list[str]) -> bool:
    for selector in selectors:
        locator = await _visible_locator(page, selector)
        if locator is not None:
            return True
    return False


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
    for selector in (
        "[role='alert']",
        ".alert",
        ".text-danger",
        ".validation-summary-errors",
        ".mat-mdc-form-field-error",
        ".invalid-feedback",
    ):
        try:
            locator = await _visible_locator(page, selector)
            if locator is None:
                continue
            text = (await locator.inner_text()).strip()
            if text:
                return text
        except Exception:
            continue
    return None


async def login_and_save_state(settings: Settings) -> Path:
    if not settings.username or not settings.password:
        raise ValueError("EFDA_USERNAME and EFDA_PASSWORD must be set")

    settings.storage_state_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await launch_chromium(playwright, headless=settings.headless)
        context = await browser.new_context()
        page = await context.new_page()

        logger.info("Opening portal login page: %s", settings.base_url)
        await page.goto(settings.base_url, wait_until="domcontentloaded")

        # Wait for the login form to be ready (SSO redirect may take time)
        try:
            await page.wait_for_selector("input#username, input[name='username'], input[type='text']", state="visible", timeout=30_000)
        except PlaywrightTimeoutError:
            logger.warning("Timed out waiting for login form inputs to appear")

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

        try:
            await page.wait_for_load_state("networkidle", timeout=20_000)
        except PlaywrightTimeoutError:
            logger.warning("Timed out waiting for network idle after login submit")
        ok, outcome_reason = await _wait_for_login_outcome(page, settings, timeout_ms=30_000)

        if settings.post_login_url_contains and settings.post_login_url_contains not in page.url:
            logger.warning(
                "Current URL (%s) does not include EFDA_POST_LOGIN_URL_CONTAINS=%s. "
                "If login is successful but URL differs, update EFDA_POST_LOGIN_URL_CONTAINS.",
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

        await context.storage_state(path=str(settings.storage_state_path))
        await browser.close()

    logger.info("Saved authenticated browser state to %s", settings.storage_state_path)
    return settings.storage_state_path


def login_sync(settings: Settings) -> Path:
    return asyncio.run(login_and_save_state(settings))

from __future__ import annotations

import logging
from pathlib import Path

from playwright.async_api import Browser, Error as PlaywrightError, Playwright

logger = logging.getLogger(__name__)


def _candidate_paths(*, prefer_headless_shell: bool) -> list[Path]:
    cache_root = Path.home() / "Library" / "Caches" / "ms-playwright"
    if not cache_root.exists():
        return []

    headed_patterns = [
        "chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chromium-*/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ]
    headless_patterns = [
        "chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell",
        "chromium_headless_shell-*/chrome-headless-shell-mac-x64/chrome-headless-shell",
    ]

    ordered_patterns = headless_patterns + headed_patterns if prefer_headless_shell else headed_patterns + headless_patterns

    paths: list[Path] = []
    for pattern in ordered_patterns:
        matches = sorted(cache_root.glob(pattern), reverse=True)
        paths.extend([path for path in matches if path.exists()])
    return paths


async def launch_chromium(playwright: Playwright, *, headless: bool) -> Browser:
    try:
        return await playwright.chromium.launch(headless=headless)
    except PlaywrightError as exc:
        if "Executable doesn't exist" not in str(exc):
            raise

    candidates = _candidate_paths(prefer_headless_shell=headless)

    for candidate in candidates:
        try:
            logger.warning("Retrying Chromium launch with explicit executable: %s", candidate)
            return await playwright.chromium.launch(headless=headless, executable_path=str(candidate))
        except PlaywrightError:
            continue

    if headless:
        # Last fallback: try headed mode with explicit executable paths.
        headed_candidates = _candidate_paths(prefer_headless_shell=False)
        for candidate in headed_candidates:
            try:
                logger.warning(
                    "Headless launch failed; retrying with headed executable: %s",
                    candidate,
                )
                return await playwright.chromium.launch(headless=False, executable_path=str(candidate))
            except PlaywrightError:
                continue

    # Re-raise with default behavior for a clear playwright error message.
    return await playwright.chromium.launch(headless=headless)

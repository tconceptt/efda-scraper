from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv(dotenv_path: Path) -> None:
    if not dotenv_path.exists():
        return
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


@dataclass(slots=True)
class Settings:
    base_url: str
    username: str | None
    password: str | None
    username_selectors: list[str]
    password_selectors: list[str]
    submit_selectors: list[str]
    imports_menu_selectors: list[str]
    products_tab_selectors: list[str]
    suppliers_tab_selectors: list[str]
    imports_next_page_selectors: list[str]
    import_reference_pattern: str
    post_login_url_contains: str | None
    storage_state_path: Path
    endpoint_catalog_path: Path
    api_capture_path: Path
    api_endpoints_path: Path
    sqlite_path: Path
    raw_output_dir: Path
    headless: bool
    strict_login_check: bool
    request_timeout_seconds: float
    page_size: int
    max_pages: int
    max_imports: int
    api_capture_duration_seconds: int


def _parse_bool(value: str, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _parse_selector_list(value: str | None, fallback: list[str]) -> list[str]:
    if not value:
        return fallback
    parts = [item.strip() for item in value.split("||")]
    return [item for item in parts if item]


def _normalize_regex_pattern(value: str) -> str:
    pattern = value.strip()
    if "\\\\" in pattern:
        pattern = pattern.replace("\\\\", "\\")
    return pattern


def load_settings(dotenv_path: str = ".env") -> Settings:
    _load_dotenv(Path(dotenv_path))

    base_url = os.getenv("EFDA_BASE_URL", "https://portal.eris.efda.gov.et/")
    username = os.getenv("EFDA_USERNAME")
    password = os.getenv("EFDA_PASSWORD")

    username_selectors = _parse_selector_list(
        os.getenv("EFDA_USERNAME_SELECTORS"),
        [
            "input[placeholder='username' i]",
            "input[name='username']",
            "input[id='username']",
            "input[type='email']",
            "input[type='text']",
            "input:not([type='password'])",
        ],
    )
    password_selectors = _parse_selector_list(
        os.getenv("EFDA_PASSWORD_SELECTORS"),
        [
            "input[type='password']",
            "input[placeholder='password' i]",
            "input[name='password']",
            "input[id='password']",
        ],
    )
    submit_selectors = _parse_selector_list(
        os.getenv("EFDA_SUBMIT_SELECTORS"),
        [
            "button:has-text('Login')",
            "button[type='submit']",
            "input[type='submit'][value='Login']",
            "button:has-text('Sign in')",
        ],
    )
    imports_menu_selectors = _parse_selector_list(
        os.getenv("EFDA_IMPORTS_MENU_SELECTORS"),
        [
            "a:has-text('IImport')",
            "[role='link']:has-text('IImport')",
            "text=IImport",
            "text=Import",
        ],
    )
    products_tab_selectors = _parse_selector_list(
        os.getenv("EFDA_PRODUCTS_TAB_SELECTORS"),
        [
            "app-tabs >> text=Products",
            "[role='tab']:has-text('Products')",
            "text=Products",
        ],
    )
    suppliers_tab_selectors = _parse_selector_list(
        os.getenv("EFDA_SUPPLIERS_TAB_SELECTORS"),
        [
            "app-tabs >> text=Suppliers",
            "[role='tab']:has-text('Suppliers')",
            "text=Suppliers",
        ],
    )
    imports_next_page_selectors = _parse_selector_list(
        os.getenv("EFDA_IMPORTS_NEXT_PAGE_SELECTORS"),
        [
            "button[aria-label='Next page']",
            "[aria-label='Next']",
            "button:has-text('Next')",
            "a:has-text('Next')",
            ".pagination-next a",
        ],
    )
    import_reference_pattern = _normalize_regex_pattern(
        os.getenv("EFDA_IMPORT_REFERENCE_PATTERN", r"\d+\s*\/\s*IP\s*\/\s*[A-Za-z0-9-]*")
    )

    post_login_url_contains = os.getenv("EFDA_POST_LOGIN_URL_CONTAINS") or None

    storage_state_path = Path(
        os.getenv(
            "EFDA_STORAGE_STATE_PATH",
            "data/state/storage_state.json",
        )
    )
    endpoint_catalog_path = Path(
        os.getenv(
            "EFDA_ENDPOINT_CATALOG_PATH",
            "endpoints.catalog.json",
        )
    )
    api_capture_path = Path(
        os.getenv(
            "EFDA_API_CAPTURE_PATH",
            "data/state/api_capture.json",
        )
    )
    api_endpoints_path = Path(
        os.getenv(
            "EFDA_API_ENDPOINTS_PATH",
            "data/state/api_endpoints.json",
        )
    )
    sqlite_path = Path(
        os.getenv(
            "EFDA_SQLITE_PATH",
            "data/efda.sqlite3",
        )
    )
    raw_output_dir = Path(
        os.getenv(
            "EFDA_RAW_OUTPUT_DIR",
            "data/raw",
        )
    )

    headless = _parse_bool(os.getenv("EFDA_HEADLESS", "true"), default=True)
    strict_login_check = _parse_bool(os.getenv("EFDA_STRICT_LOGIN_CHECK", "true"), default=True)
    request_timeout_seconds = float(os.getenv("EFDA_REQUEST_TIMEOUT_SECONDS", "30"))
    page_size = int(os.getenv("EFDA_PAGE_SIZE", "100"))
    max_pages = int(os.getenv("EFDA_MAX_PAGES", "100"))
    max_imports = int(os.getenv("EFDA_MAX_IMPORTS", "0"))
    api_capture_duration_seconds = int(os.getenv("EFDA_API_CAPTURE_DURATION_SECONDS", "45"))

    return Settings(
        base_url=base_url,
        username=username,
        password=password,
        username_selectors=username_selectors,
        password_selectors=password_selectors,
        submit_selectors=submit_selectors,
        imports_menu_selectors=imports_menu_selectors,
        products_tab_selectors=products_tab_selectors,
        suppliers_tab_selectors=suppliers_tab_selectors,
        imports_next_page_selectors=imports_next_page_selectors,
        import_reference_pattern=import_reference_pattern,
        post_login_url_contains=post_login_url_contains,
        storage_state_path=storage_state_path,
        endpoint_catalog_path=endpoint_catalog_path,
        api_capture_path=api_capture_path,
        api_endpoints_path=api_endpoints_path,
        sqlite_path=sqlite_path,
        raw_output_dir=raw_output_dir,
        headless=headless,
        strict_login_check=strict_login_check,
        request_timeout_seconds=request_timeout_seconds,
        page_size=page_size,
        max_pages=max_pages,
        max_imports=max_imports,
        api_capture_duration_seconds=api_capture_duration_seconds,
    )

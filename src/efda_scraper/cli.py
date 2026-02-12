from __future__ import annotations

import argparse
import json
import logging

from efda_scraper.config import load_settings
from efda_scraper.logging_utils import configure_logging


def _cmd_init_db(args: argparse.Namespace) -> int:
    from efda_scraper.storage import SQLiteStore

    settings = load_settings(args.env_file)
    store = SQLiteStore(settings.sqlite_path)
    store.init_schema()
    print(f"Initialized DB schema at {settings.sqlite_path}")
    return 0


def _cmd_login(args: argparse.Namespace) -> int:
    from efda_scraper.auth import login_sync

    settings = load_settings(args.env_file)
    state_path = login_sync(settings)
    print(f"Saved authenticated state: {state_path}")
    return 0


def _cmd_discover(args: argparse.Namespace) -> int:
    from efda_scraper.discovery import discover_sync

    settings = load_settings(args.env_file)
    output = discover_sync(
        settings,
        duration_seconds=args.duration,
        start_url=args.start_url,
    )
    print(f"Discovery output: {output}")
    return 0


def _cmd_capture_api(args: argparse.Namespace) -> int:
    from efda_scraper.api_capture import capture_api_sync

    settings = load_settings(args.env_file)
    summary = capture_api_sync(
        settings,
        duration_seconds=args.duration,
        start_url=args.start_url,
    )
    print(
        json.dumps(
            {
                "capture_path": str(summary.capture_path),
                "endpoints_path": str(summary.endpoints_path),
                "event_count": summary.event_count,
                "endpoint_count": summary.endpoint_count,
            },
            indent=2,
        )
    )
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    from efda_scraper.pipeline import run_imports_collection

    settings = load_settings(args.env_file)
    summary = run_imports_collection(
        settings,
        max_pages=args.max_pages,
        page_size=args.page_size,
    )
    print(json.dumps(summary, indent=2))
    return 0


def _cmd_run_api(args: argparse.Namespace) -> int:
    from efda_scraper.api_runner import run_api_collection

    settings = load_settings(args.env_file)
    summary = run_api_collection(
        settings,
        max_pages=args.max_pages,
        page_size=args.page_size,
    )
    print(json.dumps(summary, indent=2))
    return 0


def _cmd_run_browser(args: argparse.Namespace) -> int:
    from efda_scraper.browser_pipeline import run_browser_collection

    settings = load_settings(args.env_file)
    summary = run_browser_collection(
        settings,
        max_pages=args.max_pages,
        max_imports=args.max_imports,
    )
    print(json.dumps(summary, indent=2))
    return 0


def _cmd_print_enc(_: argparse.Namespace) -> int:
    sample = {
        "EFDA_USERNAME_ENC": "ENC[v1:base64:WW91cl9lbmNyeXB0ZWRfdXNlcm5hbWU=]",
        "EFDA_PASSWORD_ENC": "ENC[v1:base64:WW91cl9lbmNyeXB0ZWRfcGFzc3dvcmQ=]",
    }
    print(json.dumps(sample, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EFDA portal scraper")
    parser.add_argument("--env-file", default=".env", help="Path to .env file")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    subparsers = parser.add_subparsers(dest="command", required=True)

    init_db = subparsers.add_parser("init-db", help="Initialize sqlite schema")
    init_db.set_defaults(func=_cmd_init_db)

    login = subparsers.add_parser("login", help="Login with Playwright and save storage state")
    login.set_defaults(func=_cmd_login)

    discover = subparsers.add_parser("discover", help="Legacy endpoint discovery from browser traffic")
    discover.add_argument("--duration", type=int, default=30, help="Capture duration in seconds")
    discover.add_argument("--start-url", default=None, help="Optional URL to open after login")
    discover.set_defaults(func=_cmd_discover)

    capture_api = subparsers.add_parser(
        "capture-api",
        help="Capture authenticated API traffic and infer endpoint templates",
    )
    capture_api.add_argument(
        "--duration",
        type=int,
        default=None,
        help="Capture duration in seconds (default from EFDA_API_CAPTURE_DURATION_SECONDS)",
    )
    capture_api.add_argument("--start-url", default=None, help="Optional URL to open after login")
    capture_api.set_defaults(func=_cmd_capture_api)

    run = subparsers.add_parser("run", help="Run legacy endpoint-catalog imports pipeline")
    run.add_argument("--max-pages", type=int, default=None, help="Max pages to fetch")
    run.add_argument("--page-size", type=int, default=None, help="Page size for API")
    run.set_defaults(func=_cmd_run)

    run_api = subparsers.add_parser(
        "run-api",
        help="Run API-first collection using captured endpoint templates",
    )
    run_api.add_argument("--max-pages", type=int, default=None, help="Max pages to fetch")
    run_api.add_argument("--page-size", type=int, default=None, help="Page size to request")
    run_api.set_defaults(func=_cmd_run_api)

    run_browser = subparsers.add_parser(
        "run-browser",
        help="Run browser automation against IImport pages and extract products/suppliers",
    )
    run_browser.add_argument("--max-pages", type=int, default=None, help="Max imports-list pages to crawl")
    run_browser.add_argument("--max-imports", type=int, default=None, help="Max number of imports to scrape")
    run_browser.set_defaults(func=_cmd_run_browser)

    print_enc = subparsers.add_parser("print-enc-example", help="Print .enc-style example payload")
    print_enc.set_defaults(func=_cmd_print_enc)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    configure_logging(logging.DEBUG if args.debug else logging.INFO)
    raise SystemExit(args.func(args))

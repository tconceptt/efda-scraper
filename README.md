# EFDA Import Scraper

Authenticated scraper scaffold for the Ethiopia EFDA portal (`https://portal.eris.efda.gov.et/`).

## What is implemented

- Playwright login flow that stores authenticated browser state (`storage_state.json`)
- API capture flow that records authenticated network calls and infers reusable endpoint templates
- API-first collector that fetches imports/products/suppliers from captured endpoints
- Browser crawler for `IImport` list/detail pages (fallback)
- Endpoint discovery utility that records likely API requests from browser traffic (legacy)
- Normalization into a typed medicine import model
- SQLite storage with idempotent upserts and run-tracking
- CLI commands for `init-db`, `login`, `capture-api`, `run-api`, `run-browser`, and `run`

## Project structure

- `src/efda_scraper/auth.py`: browser login + session state save
- `src/efda_scraper/api_capture.py`: authenticated network capture + endpoint inference
- `src/efda_scraper/api_runner.py`: API-first imports/products/suppliers extraction
- `src/efda_scraper/browser_pipeline.py`: browser crawl of imports/products/suppliers
- `src/efda_scraper/discovery.py`: API endpoint discovery from browser traffic
- `src/efda_scraper/client.py`: authenticated API client + endpoint catalog loader
- `src/efda_scraper/pipeline.py`: pagination, raw payload capture, normalization, upserts
- `src/efda_scraper/storage.py`: sqlite schema and upsert logic
- `src/efda_scraper/cli.py`: command-line interface

## Setup

1. Create and activate a virtual environment.
2. Install dependencies.
3. Install Playwright Chromium.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
python -m playwright install chromium
```

## Configuration

1. Copy `.env.example` to `.env`.
2. Fill in `EFDA_USERNAME` and `EFDA_PASSWORD`.
3. Copy `endpoints.catalog.example.json` to `endpoints.catalog.json` after discovery.

```bash
cp .env.example .env
cp endpoints.catalog.example.json endpoints.catalog.json
```

## Usage

Initialize database:

```bash
efda-scraper init-db
```

Login and save session:

```bash
efda-scraper login
```

Discover candidate API endpoints:

```bash
efda-scraper discover --duration 45 --start-url "https://portal.eris.efda.gov.et/"
```

Capture real API calls after login/import navigation (recommended first step):

```bash
# Recommended for capture:
# export EFDA_HEADLESS=false
efda-scraper --debug capture-api --duration 60 --start-url "https://portal.eris.efda.gov.et/"
```

Run API-first collection using captured endpoint templates (recommended primary flow):

```bash
efda-scraper --debug run-api --max-pages 1 --page-size 50
```

Run browser collection (fallback when API templates are incomplete):

```bash
efda-scraper run-browser --max-pages 50 --max-imports 0
```

Run legacy endpoint-catalog API collection:

```bash
efda-scraper run --max-pages 50 --page-size 100
```

Print `.enc` payload example:

```bash
efda-scraper print-enc-example
```

## If you record a Playwright session

Recording is the fastest way to finalize selectors and endpoint mapping for this portal.

```bash
playwright codegen https://portal.eris.efda.gov.et/ --target python -o scripts/efda_login_recording.py
```

After recording, share:

- the generated script (`scripts/efda_login_recording.py`)
- a short note about the page that lists medicine imports (URL/path you reached)

I will then rewrite `auth.py`, selector defaults, and `endpoints.catalog.json` to match the real flow.

## Outputs

- Raw API pages: `data/raw/imports_page_XXXX.json`
- Raw captured API traffic: `data/state/api_capture.json`
- Inferred endpoint templates: `data/state/api_endpoints.json`
- Raw API-first import snapshots: `data/raw/api/import_<reference>.json`
- Raw browser snapshots: `data/raw/ui/import_<reference>.json`
- Session state: `data/state/storage_state.json`
- Endpoint discovery: `data/state/discovered_endpoints.json`
- SQLite DB: `data/efda.sqlite3`
- Product/supplier CSV: `data/import_product_supplier_links.csv`

## Notes

- Portal UI selectors often change. Override selector env vars in `.env` when needed.
- Keep `.env` and `.env.enc` out of git.
- Recommended flow is now `capture-api` then `run-api`.
- If `run-api` fails, inspect `data/state/api_capture.json` and regenerate templates with `capture-api`.
- `run` is legacy and depends on `endpoints.catalog.json`.

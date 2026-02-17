#!/usr/bin/env bash
set -euo pipefail

# EFDA Scraper Pipeline
# Runs: scrape imports → scrape products → push to Turso
#
# Required env vars:
#   EFDA_USERNAME, EFDA_PASSWORD   — portal credentials
#   TURSO_AUTH_TOKEN               — Turso database token
#   TURSO_DATABASE_URL (optional)  — defaults to production Turso URL

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== EFDA Scraper Pipeline ==="
echo "Started at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Ensure data directories exist
mkdir -p "$ROOT_DIR/data/state"
mkdir -p "$ROOT_DIR/data/raw/api_v2"

# Step 1: Scrape import permits (incremental)
echo "--- Step 1: Scraping import permits ---"
python "$SCRIPT_DIR/scrape_all.py"
echo ""

# Step 2: Scrape product details for new imports
echo "--- Step 2: Scraping product details ---"
python "$SCRIPT_DIR/scrape_products.py"
echo ""

# Step 3: Push new data to Turso
echo "--- Step 3: Pushing to Turso ---"
node "$ROOT_DIR/dashboard/scripts/push-to-turso.mjs"
echo ""

echo "=== Pipeline complete ==="
echo "Finished at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

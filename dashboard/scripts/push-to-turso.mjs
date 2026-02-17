#!/usr/bin/env node
/**
 * Push the local SQLite database to Turso (incremental by default).
 *
 * Only pushes rows where scraped_at > last sync timestamp.
 * Use --full to force a complete re-push.
 *
 * Usage:
 *   node scripts/push-to-turso.mjs          # incremental
 *   node scripts/push-to-turso.mjs --full   # full re-push
 */

import { createClient } from "@libsql/client";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "..", "..", "data", "efda.sqlite3");
const SYNC_STATE_PATH = resolve(__dirname, "..", "..", "data", "state", "last_sync.json");

const TURSO_URL = process.env.TURSO_DATABASE_URL || "libsql://efda-tettemqe.aws-eu-west-1.turso.io";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_TOKEN) {
  console.error("Set TURSO_AUTH_TOKEN env var");
  process.exit(1);
}

const fullMode = process.argv.includes("--full");
const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// Tables to sync. scrape_log is always full-synced (tiny).
const TABLES = ["import_permits", "import_permit_products", "scrape_log"];
const INCREMENTAL_TABLES = new Set(["import_permits", "import_permit_products"]);

function loadLastSync() {
  if (fullMode) return null;
  if (!existsSync(SYNC_STATE_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(SYNC_STATE_PATH, "utf-8"));
    return data.synced_at ?? null;
  } catch {
    return null;
  }
}

function saveLastSync(counts) {
  const dir = dirname(SYNC_STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    SYNC_STATE_PATH,
    JSON.stringify({
      synced_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      counts,
    }, null, 2)
  );
}

function sqliteExec(sql) {
  return execSync(`sqlite3 "${DB_PATH}" "${sql}"`, {
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
  }).trim();
}

function sqliteJson(sql) {
  const out = execSync(`sqlite3 -json "${DB_PATH}" "${sql}"`, {
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

async function main() {
  const lastSyncAt = loadLastSync();
  console.log("Connected to Turso:", TURSO_URL);
  console.log("Mode:", lastSyncAt ? `incremental (since ${lastSyncAt})` : "full");

  // 1. Create schema
  console.log("\n--- Creating schema ---");
  const schemaSql = execSync(`sqlite3 "${DB_PATH}" ".schema"`, { encoding: "utf-8" });

  const schemaStatements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      for (const t of TABLES) {
        if (s.includes(`CREATE TABLE ${t}`)) return true;
      }
      if (s.includes("CREATE INDEX") && TABLES.some((t) => s.includes(`ON ${t}`))) return true;
      return false;
    });

  for (const stmt of schemaStatements) {
    const sql = stmt
      .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
      .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
    try {
      await client.execute(sql + ";");
      console.log("  OK:", sql.slice(0, 80) + "...");
    } catch (err) {
      console.log("  SKIP:", err.message.slice(0, 100));
    }
  }

  // 1b. Add any new columns not in original CREATE TABLE (schema evolution)
  console.log("\n--- Adding new columns (if any) ---");
  for (const table of TABLES) {
    const localCols = sqliteExec(`PRAGMA table_info(${table})`)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|");
        return { name: parts[1], type: parts[2] || "TEXT" };
      });

    for (const col of localCols) {
      try {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
        console.log(`  Added column ${table}.${col.name}`);
      } catch {
        // column already exists — expected
      }
    }
  }

  // 2. Push data table by table
  const syncCounts = {};

  for (const table of TABLES) {
    console.log(`\n--- Pushing ${table} ---`);

    // Get column names
    const cols = sqliteExec(`PRAGMA table_info(${table})`)
      .split("\n")
      .map((line) => line.split("|")[1]);

    // Skip raw_json (huge, not used by dashboard)
    const skipCols = ["raw_json"];
    const useCols = cols.filter((c) => !skipCols.includes(c));
    const colList = useCols.join(", ");
    const placeholders = useCols.map(() => "?").join(", ");

    // Build WHERE clause for incremental sync
    let where = "";
    if (lastSyncAt && INCREMENTAL_TABLES.has(table) && useCols.includes("scraped_at")) {
      where = `WHERE scraped_at > '${lastSyncAt}'`;
    }

    // Count matching rows
    const totalRows = parseInt(sqliteExec(`SELECT COUNT(*) FROM ${table} ${where}`), 10);
    console.log(`  Rows to sync: ${totalRows}`);

    if (totalRows === 0) {
      syncCounts[table] = 0;
      continue;
    }

    // Batch insert
    const BATCH_SIZE = 200;
    let inserted = 0;

    for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
      const rows = sqliteJson(
        `SELECT ${colList} FROM ${table} ${where} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );

      const stmts = rows.map((row) => ({
        sql: `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`,
        args: useCols.map((c) => row[c] ?? null),
      }));

      await client.batch(stmts, "write");
      inserted += rows.length;

      if (inserted % 1000 === 0 || offset + BATCH_SIZE >= totalRows) {
        console.log(`  ${inserted}/${totalRows} rows`);
      }
    }

    syncCounts[table] = inserted;
    console.log(`  Done: ${inserted} rows pushed`);
  }

  // 3. Save sync state
  saveLastSync(syncCounts);
  console.log("\n--- All done! ---");
  console.log("Sync counts:", syncCounts);
  client.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Push the local SQLite database to Turso.
 * Reads the SQL dump and executes it in batches.
 *
 * Usage: node scripts/push-to-turso.mjs
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { execSync } from "child_process";

const TURSO_URL = process.env.TURSO_DATABASE_URL || "libsql://efda-tettemqe.aws-eu-west-1.turso.io";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_TOKEN) {
  console.error("Set TURSO_AUTH_TOKEN env var");
  process.exit(1);
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// Only dump the tables the dashboard actually uses
const TABLES = ["import_permits", "import_permit_products", "scrape_log"];

async function main() {
  console.log("Connected to Turso:", TURSO_URL);

  // 1. Create schema
  console.log("\n--- Creating schema ---");
  const schemaSql = execSync(
    `sqlite3 ../data/efda.sqlite3 ".schema"`,
    { encoding: "utf-8" }
  );

  // Split by semicolons, filter to our tables + indexes
  const schemaStatements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      // Include CREATE TABLE for our tables
      for (const t of TABLES) {
        if (s.includes(`CREATE TABLE ${t}`)) return true;
      }
      // Include CREATE INDEX on our tables
      if (s.includes("CREATE INDEX") && TABLES.some((t) => s.includes(`ON ${t}`))) return true;
      return false;
    });

  for (const stmt of schemaStatements) {
    const sql = stmt.replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
                     .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
    try {
      await client.execute(sql + ";");
      console.log("  OK:", sql.slice(0, 80) + "...");
    } catch (err) {
      console.log("  SKIP:", err.message.slice(0, 100));
    }
  }

  // 2. Push data table by table using CSV-style inserts
  for (const table of TABLES) {
    console.log(`\n--- Pushing ${table} ---`);

    // Get column names
    const cols = execSync(
      `sqlite3 ../data/efda.sqlite3 "PRAGMA table_info(${table})"`,
      { encoding: "utf-8" }
    )
      .trim()
      .split("\n")
      .map((line) => line.split("|")[1]);

    // Count rows
    const countStr = execSync(
      `sqlite3 ../data/efda.sqlite3 "SELECT COUNT(*) FROM ${table}"`,
      { encoding: "utf-8" }
    ).trim();
    const totalRows = parseInt(countStr, 10);
    console.log(`  Total rows: ${totalRows}, Columns: ${cols.join(", ")}`);

    if (totalRows === 0) continue;

    // Skip raw_json column for import_permits and import_permit_products (huge, not used by dashboard)
    const skipCols = ["raw_json"];
    const useCols = cols.filter((c) => !skipCols.includes(c));
    const colList = useCols.join(", ");
    const placeholders = useCols.map(() => "?").join(", ");

    // Batch insert
    const BATCH_SIZE = 200;
    let inserted = 0;

    for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
      // Fetch batch as JSON
      const jsonStr = execSync(
        `sqlite3 -json ../data/efda.sqlite3 "SELECT ${colList} FROM ${table} LIMIT ${BATCH_SIZE} OFFSET ${offset}"`,
        { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 }
      );

      const rows = JSON.parse(jsonStr);

      // Build batch of statements
      const stmts = rows.map((row) => ({
        sql: `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`,
        args: useCols.map((c) => row[c] ?? null),
      }));

      await client.batch(stmts, "write");
      inserted += rows.length;

      if (inserted % 1000 === 0 || inserted === totalRows) {
        console.log(`  ${inserted}/${totalRows} rows`);
      }
    }

    console.log(`  Done: ${inserted} rows inserted`);
  }

  console.log("\n--- All done! ---");
  client.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

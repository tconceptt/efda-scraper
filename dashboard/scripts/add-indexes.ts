/**
 * One-time script to add performance indexes to the EFDA SQLite database.
 *
 * Usage:  npx tsx scripts/add-indexes.ts
 *
 * Safe to run multiple times — uses CREATE INDEX IF NOT EXISTS.
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "..", "..", "data", "efda.sqlite3");
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const indexes = [
  // Expression index for the product grouping key used in every product query
  `CREATE INDEX IF NOT EXISTS idx_products_group_key
     ON import_permit_products(
       LOWER(TRIM(generic_name)) || '||' || LOWER(TRIM(COALESCE(dosage_form, ''))) || '||' || LOWER(TRIM(COALESCE(dosage_strength, '')))
     )`,

  // Generic name for search / filtering
  `CREATE INDEX IF NOT EXISTS idx_products_generic_name
     ON import_permit_products(generic_name)`,

  // Import permits: type filter (Medicine / Medical Device)
  `CREATE INDEX IF NOT EXISTS idx_permits_type
     ON import_permits(submodule_type_code)`,

  // Import permits: date ordering / range queries
  `CREATE INDEX IF NOT EXISTS idx_permits_requested_date
     ON import_permits(requested_date)`,

  // Import permits: supplier grouping
  `CREATE INDEX IF NOT EXISTS idx_permits_supplier
     ON import_permits(supplier_name)`,
];

for (const sql of indexes) {
  const name = sql.match(/idx_\w+/)?.[0] ?? "unknown";
  try {
    db.exec(sql);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}:`, (err as Error).message);
  }
}

db.close();
console.log("Done.");

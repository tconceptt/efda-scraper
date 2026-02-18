import { getDb } from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Execute a query returning all rows as plain objects, cast to T[] */
async function queryAll<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const db = getDb();
  const result = await db.execute({ sql, args: args as never[] });
  // libsql returns Row class instances — spread into plain objects
  // so they can be passed from Server Components to Client Components.
  return result.rows.map((row) => ({ ...row }) as unknown as T);
}

/** Execute a query returning the first row, cast to T | null */
async function queryOne<T>(sql: string, args: unknown[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, args);
  return rows[0] ?? null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OverviewStats {
  totalImports: number;
  totalValue: number;
  uniqueSuppliers: number;
  uniqueAgents: number;
  totalProducts: number;
}

export interface MonthlyData {
  month: string;
  count: number;
  value: number;
}

export interface MonthlyByType {
  month: string;
  mdcn_count: number;
  mdcn_value: number;
  md_count: number;
  md_value: number;
}

export interface SupplierStat {
  name: string;
  count: number;
  value: number;
}

export interface PortStat {
  port: string;
  count: number;
  value: number;
}

export interface TypeStat {
  type: string;
  label: string;
  count: number;
  value: number;
}

export interface ImportRow {
  id: number;
  import_permit_number: string;
  agent_name: string;
  supplier_name: string;
  port_of_entry: string;
  amount: number;
  currency: string;
  status: string;
  submodule_type_code: string;
  requested_date: string;
  expiry_date: string;
}

export interface ImportDetail extends ImportRow {
  application_id: string | null;
  freight_cost: number;
  status_code: string;
  payment_mode: string | null;
  shipping_method: string | null;
  performa_invoice_number: string | null;
  submission_date: string | null;
  decision_date: string | null;
  delivery: string | null;
  remark: string | null;
}

export interface ProductRow {
  id: number;
  import_permit_id: number;
  import_permit_number: string;
  product_name: string;
  full_item_name: string | null;
  generic_name: string;
  brand_name: string;
  manufacturer_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  amount: number;
  product_status: string;
  hs_code: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  dosage_unit: string | null;
  description: string | null;
  indication: string | null;
  manufacturer_site: string | null;
}

export interface ManufacturerStat {
  name: string;
  count: number;
  value: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportFilters {
  search?: string;
  type?: string;
  port?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductFilters {
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: string; // "MDCN" | "MD"
  lookback?: number; // months for growth/decline reports
  minPriorOrders?: number; // minimum prior-period orders for decline report
}

// ─── Generic Product Grouping ──────────────────────────────────────────────
// Products are grouped by: generic_name + dosage_form + dosage_strength
// This groups all brands of the same drug/device formulation together.
// Uses normalized columns when available, falling back to originals for
// backwards compatibility with older Turso schemas.

const NORM_GROUP_KEY_SQL = `LOWER(TRIM(COALESCE(p.norm_generic_name, p.generic_name))) || '||' || LOWER(TRIM(COALESCE(p.norm_dosage_form, p.dosage_form, ''))) || '||' || LOWER(TRIM(COALESCE(p.norm_dosage_strength, p.dosage_strength, '')))`;
const ORIG_GROUP_KEY_SQL = `LOWER(TRIM(p.generic_name)) || '||' || LOWER(TRIM(COALESCE(p.dosage_form, ''))) || '||' || LOWER(TRIM(COALESCE(p.dosage_strength, '')))`;

/** Cached result of column detection */
let _normAvailable: boolean | null = null;

/** Check once whether the norm_* columns exist in the remote DB */
async function hasNormColumns(): Promise<boolean> {
  if (_normAvailable !== null) return _normAvailable;
  try {
    const db = getDb();
    await db.execute({ sql: "SELECT norm_generic_name FROM import_permit_products LIMIT 1", args: [] });
    _normAvailable = true;
  } catch {
    _normAvailable = false;
  }
  return _normAvailable;
}

/** SQL expression that produces the grouping key (auto-detects schema) */
async function getGroupKeySql(): Promise<string> {
  return (await hasNormColumns()) ? NORM_GROUP_KEY_SQL : ORIG_GROUP_KEY_SQL;
}

/** SQL fragments for display columns in aggregated queries */
async function getNormSelectFragments(): Promise<{ genericName: string; dosageForm: string }> {
  if (await hasNormColumns()) {
    return {
      genericName: `COALESCE(p.norm_generic_name, p.generic_name)`,
      dosageForm: `COALESCE(p.norm_dosage_form, p.dosage_form)`,
    };
  }
  return {
    genericName: `p.generic_name`,
    dosageForm: `p.dosage_form`,
  };
}

/** Build the same key from JS values (for URL encoding) */
export function makeProductSlug(
  genericName: string,
  dosageForm: string | null,
  dosageStrength: string | null
): string {
  const key = [
    genericName.toLowerCase().trim(),
    (dosageForm ?? "").toLowerCase().trim(),
    (dosageStrength ?? "").toLowerCase().trim(),
  ].join("||");
  return encodeURIComponent(Buffer.from(key).toString("base64url"));
}

/** Decode a slug back to the grouping key */
export function decodeProductSlug(slug: string): string {
  return Buffer.from(decodeURIComponent(slug), "base64url").toString("utf-8");
}

export interface AggregatedProductRow {
  slug: string;
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  dosage_unit: string | null;
  brand_count: number;
  supplier_count: number;
  order_count: number;
  total_quantity: number;
  avg_price: number;
  total_value: number;
}

export interface ProductInfo {
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  dosage_unit: string | null;
  brand_names: string;
  manufacturer_names: string;
}

export interface ProductStats {
  totalOrders: number;
  totalQuantity: number;
  totalValue: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  uniqueImporters: number;
  uniqueSuppliers: number;
  uniqueBrands: number;
}

export interface ProductPriceTrend {
  month: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  order_count: number;
}

export interface ProductMonthlyVolume {
  month: string;
  quantity: number;
  order_count: number;
}

export interface ProductMonthlySupplier {
  month: string;
  supplier_name: string;
  avg_price: number;
  quantity: number;
  order_count: number;
}

export interface ProductSupplierPrice {
  supplier_name: string;
  avg_price: number;
  order_count: number;
  total_value: number;
}

export interface ProductImporterStat {
  agent_name: string;
  order_count: number;
  total_spend: number;
  total_quantity: number;
}

export interface ProductOrderRow {
  id: number;
  import_permit_id: number;
  import_permit_number: string;
  requested_date: string;
  agent_name: string;
  supplier_name: string;
  port_of_entry: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  const imports = await queryOne<{
    totalImports: number; totalValue: number;
    uniqueSuppliers: number; uniqueAgents: number;
  }>(
    `SELECT
      COUNT(*) as totalImports,
      COALESCE(SUM(amount), 0) as totalValue,
      COUNT(DISTINCT supplier_name) as uniqueSuppliers,
      COUNT(DISTINCT agent_name) as uniqueAgents
    FROM import_permits`
  );

  const products = await queryOne<{ totalProducts: number }>(
    `SELECT COUNT(*) as totalProducts FROM import_permit_products`
  );

  return {
    totalImports: imports?.totalImports ?? 0,
    totalValue: imports?.totalValue ?? 0,
    uniqueSuppliers: imports?.uniqueSuppliers ?? 0,
    uniqueAgents: imports?.uniqueAgents ?? 0,
    totalProducts: products?.totalProducts ?? 0,
  };
}

export async function getImportsOverTime(): Promise<MonthlyData[]> {
  return queryAll<MonthlyData>(
    `SELECT
      strftime('%Y-%m', requested_date) as month,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as value
    FROM import_permits
    WHERE requested_date IS NOT NULL
    GROUP BY month
    ORDER BY month`
  );
}

export async function getMonthlyByType(filters?: AnalyticsFilters): Promise<MonthlyByType[]> {
  const conditions: string[] = ["requested_date IS NOT NULL"];
  const params: (string | number)[] = [];
  if (filters?.dateFrom) { conditions.push("requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("submodule_type_code = ?"); params.push(filters.type); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  return queryAll<MonthlyByType>(
    `SELECT
      strftime('%Y-%m', requested_date) as month,
      SUM(CASE WHEN submodule_type_code = 'MDCN' THEN 1 ELSE 0 END) as mdcn_count,
      SUM(CASE WHEN submodule_type_code = 'MDCN' THEN COALESCE(amount, 0) ELSE 0 END) as mdcn_value,
      SUM(CASE WHEN submodule_type_code = 'MD' THEN 1 ELSE 0 END) as md_count,
      SUM(CASE WHEN submodule_type_code = 'MD' THEN COALESCE(amount, 0) ELSE 0 END) as md_value
    FROM import_permits
    ${where}
    GROUP BY month
    ORDER BY month`,
    params
  );
}

export async function getTopSuppliers(limit = 10): Promise<SupplierStat[]> {
  return queryAll<SupplierStat>(
    `SELECT
      supplier_name as name,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as value
    FROM import_permits
    WHERE supplier_name IS NOT NULL AND supplier_name != ''
    GROUP BY supplier_name
    ORDER BY value DESC
    LIMIT ?`,
    [limit]
  );
}

export async function getPortDistribution(): Promise<PortStat[]> {
  return queryAll<PortStat>(
    `SELECT
      port_of_entry as port,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as value
    FROM import_permits
    WHERE port_of_entry IS NOT NULL AND port_of_entry != ''
    GROUP BY port_of_entry
    ORDER BY count DESC`
  );
}

export async function getTypeBreakdown(): Promise<TypeStat[]> {
  const rows = await queryAll<{ type: string; count: number; value: number }>(
    `SELECT
      submodule_type_code as type,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as value
    FROM import_permits
    GROUP BY submodule_type_code
    ORDER BY count DESC`
  );

  return rows.map((r) => ({
    ...r,
    label: r.type === "MDCN" ? "Medicine" : r.type === "MD" ? "Medical Device" : r.type,
  }));
}

export async function getRecentImports(limit = 10): Promise<ImportRow[]> {
  return queryAll<ImportRow>(
    `SELECT
      id, import_permit_number, agent_name, supplier_name,
      port_of_entry, amount, currency, status, submodule_type_code,
      requested_date, expiry_date
    FROM import_permits
    ORDER BY id DESC
    LIMIT ?`,
    [limit]
  );
}

export async function getImports(
  page = 1,
  pageSize = 25,
  filters: ImportFilters = {},
  sortBy = "id",
  sortDir: "asc" | "desc" = "desc"
): Promise<PaginatedResult<ImportRow>> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.search) {
    conditions.push(
      `(import_permit_number LIKE ? OR agent_name LIKE ? OR supplier_name LIKE ?)`
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like);
  }
  if (filters.type) {
    conditions.push(`submodule_type_code = ?`);
    params.push(filters.type);
  }
  if (filters.port) {
    conditions.push(`port_of_entry = ?`);
    params.push(filters.port);
  }
  if (filters.dateFrom) {
    conditions.push(`requested_date >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`requested_date < date(?, '+1 day')`);
    params.push(filters.dateTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const allowedSort = [
    "id", "import_permit_number", "agent_name", "supplier_name",
    "port_of_entry", "amount", "requested_date",
  ];
  const safeSort = allowedSort.includes(sortBy) ? sortBy : "id";
  const safeDir = sortDir === "asc" ? "ASC" : "DESC";

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM import_permits ${where}`,
    params
  );
  const total = countRow?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const data = await queryAll<ImportRow>(
    `SELECT
      id, import_permit_number, agent_name, supplier_name,
      port_of_entry, amount, currency, status, submodule_type_code,
      requested_date, expiry_date
    FROM import_permits
    ${where}
    ORDER BY ${safeSort} ${safeDir}
    LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getImportById(id: number): Promise<ImportDetail | null> {
  return queryOne<ImportDetail>(
    `SELECT
      id, import_permit_number, application_id, agent_name, supplier_name,
      port_of_entry, amount, currency, freight_cost, status, status_code,
      submodule_type_code, payment_mode, shipping_method,
      performa_invoice_number, requested_date, expiry_date,
      submission_date, decision_date, delivery, remark
    FROM import_permits
    WHERE id = ?`,
    [id]
  );
}

export async function getImportProducts(importId: number): Promise<ProductRow[]> {
  return queryAll<ProductRow>(
    `SELECT
      id, import_permit_id, import_permit_number,
      product_name, full_item_name, generic_name, brand_name,
      manufacturer_name, quantity, unit_price, discount, amount,
      product_status, hs_code, dosage_form, dosage_strength,
      dosage_unit, description, indication, manufacturer_site
    FROM import_permit_products
    WHERE import_permit_id = ?
    ORDER BY id`,
    [importId]
  );
}

export async function getAggregatedProducts(
  page = 1,
  pageSize = 25,
  filters: ProductFilters = {},
  sortBy = "order_count",
  sortDir: "asc" | "desc" = "desc"
): Promise<PaginatedResult<AggregatedProductRow>> {
  const GROUP_KEY = await getGroupKeySql();
  const { genericName, dosageForm } = await getNormSelectFragments();

  const conditions: string[] = [
    `p.generic_name IS NOT NULL`,
    `p.generic_name != ''`,
  ];
  const params: (string | number)[] = [];

  if (filters.search) {
    conditions.push(
      `(p.generic_name LIKE ? OR p.product_name LIKE ? OR p.full_item_name LIKE ? OR p.brand_name LIKE ?)`
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like, like);
  }
  if (filters.type) {
    conditions.push(`i.submodule_type_code = ?`);
    params.push(filters.type);
  }
  if (filters.dateFrom) {
    conditions.push(`i.requested_date >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`i.requested_date < date(?, '+1 day')`);
    params.push(filters.dateTo);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const allowedSort: Record<string, string> = {
    order_count: "order_count",
    generic_name: "generic_name",
    total_quantity: "total_quantity",
    avg_price: "avg_price",
    total_value: "total_value",
    brand_count: "brand_count",
    supplier_count: "supplier_count",
  };
  const safeSort = allowedSort[sortBy] ?? "order_count";
  const safeDir = sortDir === "asc" ? "ASC" : "DESC";

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
      SELECT 1 FROM import_permit_products p
      JOIN import_permits i ON p.import_permit_id = i.id
      ${where}
      GROUP BY ${GROUP_KEY}
    )`,
    params
  );
  const total = countRow?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const data = await queryAll<Omit<AggregatedProductRow, "slug"> & { group_key: string }>(
    `SELECT
      ${GROUP_KEY} as group_key,
      ${genericName} as generic_name,
      ${dosageForm} as dosage_form,
      p.dosage_strength,
      p.dosage_unit,
      COUNT(DISTINCT p.product_id) as brand_count,
      COUNT(DISTINCT i.supplier_name) as supplier_count,
      COUNT(DISTINCT p.import_permit_id) as order_count,
      COALESCE(SUM(p.quantity), 0) as total_quantity,
      COALESCE(AVG(p.unit_price), 0) as avg_price,
      COALESCE(SUM(p.amount), 0) as total_value
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    ${where}
    GROUP BY ${GROUP_KEY}
    ORDER BY ${safeSort} ${safeDir}
    LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const rows: AggregatedProductRow[] = data.map((row) => ({
    slug: encodeURIComponent(Buffer.from(row.group_key).toString("base64url")),
    generic_name: row.generic_name,
    dosage_form: row.dosage_form,
    dosage_strength: row.dosage_strength,
    dosage_unit: row.dosage_unit,
    brand_count: row.brand_count,
    supplier_count: row.supplier_count,
    order_count: row.order_count,
    total_quantity: row.total_quantity,
    avg_price: row.avg_price,
    total_value: row.total_value,
  }));

  return {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getTopManufacturers(limit = 10, filters?: AnalyticsFilters): Promise<ManufacturerStat[]> {
  const conditions: string[] = ["p.manufacturer_name IS NOT NULL", "p.manufacturer_name != ''"];
  const params: (string | number)[] = [];
  const needsJoin = !!(filters?.dateFrom || filters?.dateTo || filters?.type);
  if (filters?.dateFrom) { conditions.push("i.requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("i.requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("i.submodule_type_code = ?"); params.push(filters.type); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const join = needsJoin ? "JOIN import_permits i ON p.import_permit_id = i.id" : "";
  return queryAll<ManufacturerStat>(
    `SELECT
      p.manufacturer_name as name,
      COUNT(*) as count,
      COALESCE(SUM(p.amount), 0) as value
    FROM import_permit_products p
    ${join}
    ${where}
    GROUP BY p.manufacturer_name
    ORDER BY count DESC
    LIMIT ?`,
    [...params, limit]
  );
}

export async function getTopAgents(limit = 20, filters?: AnalyticsFilters): Promise<SupplierStat[]> {
  const conditions: string[] = ["agent_name IS NOT NULL", "agent_name != ''"];
  const params: (string | number)[] = [];
  if (filters?.dateFrom) { conditions.push("requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("submodule_type_code = ?"); params.push(filters.type); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  return queryAll<SupplierStat>(
    `SELECT
      agent_name as name,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as value
    FROM import_permits
    ${where}
    GROUP BY agent_name
    ORDER BY value DESC
    LIMIT ?`,
    [...params, limit]
  );
}

export async function getPortsOverTime(): Promise<{ month: string; port: string; count: number }[]> {
  return queryAll<{ month: string; port: string; count: number }>(
    `SELECT
      strftime('%Y-%m', requested_date) as month,
      port_of_entry as port,
      COUNT(*) as count
    FROM import_permits
    WHERE requested_date IS NOT NULL AND port_of_entry IS NOT NULL
    GROUP BY month, port
    ORDER BY month`
  );
}

export async function getAvgOrderValueTrend(filters?: AnalyticsFilters): Promise<{ month: string; avg_value: number }[]> {
  const conditions: string[] = ["requested_date IS NOT NULL", "amount > 0"];
  const params: (string | number)[] = [];
  if (filters?.dateFrom) { conditions.push("requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("submodule_type_code = ?"); params.push(filters.type); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  return queryAll<{ month: string; avg_value: number }>(
    `SELECT
      strftime('%Y-%m', requested_date) as month,
      AVG(amount) as avg_value
    FROM import_permits
    ${where}
    GROUP BY month
    ORDER BY month`,
    params
  );
}

export async function getPorts(): Promise<string[]> {
  const rows = await queryAll<{ port: string }>(
    `SELECT DISTINCT port_of_entry as port
    FROM import_permits
    WHERE port_of_entry IS NOT NULL AND port_of_entry != ''
    ORDER BY port`
  );
  return rows.map((r) => r.port);
}

// ─── Product Detail Queries (by group key) ──────────────────────────────────

export async function getProductBySlug(slug: string): Promise<ProductInfo | null> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  return queryOne<ProductInfo>(
    `SELECT
      p.generic_name,
      p.dosage_form,
      p.dosage_strength,
      p.dosage_unit,
      GROUP_CONCAT(DISTINCT p.product_name) as brand_names,
      GROUP_CONCAT(DISTINCT p.manufacturer_name) as manufacturer_names
    FROM import_permit_products p
    WHERE ${GROUP_KEY} = ?
    GROUP BY ${GROUP_KEY}`,
    [groupKey]
  );
}

export async function getProductStatsBySlug(slug: string): Promise<ProductStats> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  const row = await queryOne<ProductStats>(
    `SELECT
      COUNT(DISTINCT p.import_permit_id) as totalOrders,
      COALESCE(SUM(p.quantity), 0) as totalQuantity,
      COALESCE(SUM(p.amount), 0) as totalValue,
      COALESCE(AVG(p.unit_price), 0) as avgUnitPrice,
      COALESCE(MIN(CASE WHEN p.unit_price > 0 THEN p.unit_price END), 0) as minUnitPrice,
      COALESCE(MAX(p.unit_price), 0) as maxUnitPrice,
      COUNT(DISTINCT i.agent_name) as uniqueImporters,
      COUNT(DISTINCT i.supplier_name) as uniqueSuppliers,
      COUNT(DISTINCT p.product_id) as uniqueBrands
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${GROUP_KEY} = ?`,
    [groupKey]
  );
  return row!;
}

export async function getProductPriceTrendBySlug(slug: string, filters?: AnalyticsFilters): Promise<ProductPriceTrend[]> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  const conditions: string[] = [`${GROUP_KEY} = ?`, "i.requested_date IS NOT NULL", "p.unit_price > 0"];
  const params: (string | number)[] = [groupKey];
  if (filters?.dateFrom) { conditions.push("i.requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("i.requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("i.submodule_type_code = ?"); params.push(filters.type); }
  return queryAll<ProductPriceTrend>(
    `SELECT
      strftime('%Y-%m', i.requested_date) as month,
      AVG(p.unit_price) as avg_price,
      MIN(p.unit_price) as min_price,
      MAX(p.unit_price) as max_price,
      COUNT(*) as order_count
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY month
    ORDER BY month`,
    params
  );
}

export async function getProductMonthlyVolumeBySlug(slug: string, filters?: AnalyticsFilters): Promise<ProductMonthlyVolume[]> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  const conditions: string[] = [`${GROUP_KEY} = ?`, "i.requested_date IS NOT NULL"];
  const params: (string | number)[] = [groupKey];
  if (filters?.dateFrom) { conditions.push("i.requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("i.requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("i.submodule_type_code = ?"); params.push(filters.type); }
  return queryAll<ProductMonthlyVolume>(
    `SELECT
      strftime('%Y-%m', i.requested_date) as month,
      COALESCE(SUM(p.quantity), 0) as quantity,
      COUNT(DISTINCT p.import_permit_id) as order_count
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY month
    ORDER BY month`,
    params
  );
}

export async function getProductSupplierPricesBySlug(slug: string): Promise<ProductSupplierPrice[]> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  return queryAll<ProductSupplierPrice>(
    `SELECT
      i.supplier_name,
      AVG(p.unit_price) as avg_price,
      COUNT(*) as order_count,
      COALESCE(SUM(p.amount), 0) as total_value
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${GROUP_KEY} = ? AND i.supplier_name IS NOT NULL AND i.supplier_name != ''
    GROUP BY i.supplier_name
    ORDER BY avg_price ASC`,
    [groupKey]
  );
}

export async function getProductTopImportersBySlug(slug: string, limit = 10): Promise<ProductImporterStat[]> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  return queryAll<ProductImporterStat>(
    `SELECT
      i.agent_name,
      COUNT(DISTINCT p.import_permit_id) as order_count,
      COALESCE(SUM(p.amount), 0) as total_spend,
      COALESCE(SUM(p.quantity), 0) as total_quantity
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${GROUP_KEY} = ? AND i.agent_name IS NOT NULL AND i.agent_name != ''
    GROUP BY i.agent_name
    ORDER BY total_spend DESC
    LIMIT ?`,
    [groupKey, limit]
  );
}

export async function getProductMonthlySupplierBySlug(slug: string): Promise<ProductMonthlySupplier[]> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);
  return queryAll<ProductMonthlySupplier>(
    `SELECT
      strftime('%Y-%m', i.requested_date) as month,
      i.supplier_name,
      AVG(p.unit_price) as avg_price,
      COALESCE(SUM(p.quantity), 0) as quantity,
      COUNT(*) as order_count
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${GROUP_KEY} = ? AND i.requested_date IS NOT NULL
      AND i.supplier_name IS NOT NULL AND i.supplier_name != ''
    GROUP BY month, i.supplier_name
    ORDER BY month`,
    [groupKey]
  );
}

export async function getProductOrderHistoryBySlug(
  slug: string,
  page = 1,
  pageSize = 25
): Promise<PaginatedResult<ProductOrderRow>> {
  const GROUP_KEY = await getGroupKeySql();
  const groupKey = decodeProductSlug(slug);

  const countRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM import_permit_products p WHERE ${GROUP_KEY} = ?`,
    [groupKey]
  );
  const total = countRow?.count ?? 0;

  const offset = (page - 1) * pageSize;
  const data = await queryAll<ProductOrderRow>(
    `SELECT
      p.id, p.import_permit_id, p.import_permit_number, p.product_name,
      i.requested_date, i.agent_name, i.supplier_name, i.port_of_entry,
      p.quantity, p.unit_price, p.amount
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    WHERE ${GROUP_KEY} = ?
    ORDER BY i.requested_date DESC
    LIMIT ? OFFSET ?`,
    [groupKey, pageSize, offset]
  );

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ─── Analytics: Product Intelligence ─────────────────────────────────────────

export interface ProductPriceSpread {
  slug: string;
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  order_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  spread_pct: number;
}

/** Top products with the widest price variation — biggest negotiation opportunities */
export async function getTopProductPriceSpreads(limit = 15, typeOrFilters?: string | AnalyticsFilters): Promise<ProductPriceSpread[]> {
  const GROUP_KEY = await getGroupKeySql();
  const { genericName, dosageForm } = await getNormSelectFragments();
  const filters: AnalyticsFilters | undefined = typeof typeOrFilters === "string" ? { type: typeOrFilters } : typeOrFilters;
  const conditions: string[] = ["p.generic_name IS NOT NULL", "p.generic_name != ''", "p.unit_price > 0"];
  const params: (string | number)[] = [];
  const needsJoin = !!(filters?.dateFrom || filters?.dateTo || filters?.type);
  if (filters?.dateFrom) { conditions.push("i.requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("i.requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("i.submodule_type_code = ?"); params.push(filters.type); }
  const join = needsJoin ? "JOIN import_permits i ON p.import_permit_id = i.id" : "";
  const where = `WHERE ${conditions.join(" AND ")}`;
  const rows = await queryAll<Omit<ProductPriceSpread, "spread_pct" | "slug">>(
    `SELECT
      ${genericName} as generic_name,
      ${dosageForm} as dosage_form,
      p.dosage_strength,
      COUNT(DISTINCT p.import_permit_id) as order_count,
      AVG(CASE WHEN p.unit_price > 0 THEN p.unit_price END) as avg_price,
      MIN(CASE WHEN p.unit_price > 0 THEN p.unit_price END) as min_price,
      MAX(CASE WHEN p.unit_price > 0 THEN p.unit_price END) as max_price
    FROM import_permit_products p
    ${join}
    ${where}
    GROUP BY ${GROUP_KEY}
    HAVING order_count >= 5 AND min_price < max_price
    ORDER BY (max_price - min_price) * 1.0 / avg_price DESC
    LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => ({
    ...r,
    slug: makeProductSlug(r.generic_name, r.dosage_form, r.dosage_strength),
    spread_pct: Math.round(((r.max_price - r.min_price) / r.avg_price) * 100),
  }));
}

/** Paginated price spreads — capped at 100 results total */
export async function getPaginatedPriceSpreads(
  page = 1,
  pageSize = 25,
  type?: string
): Promise<PaginatedResult<ProductPriceSpread>> {
  const MAX_RESULTS = 100;
  const all = await getTopProductPriceSpreads(MAX_RESULTS, type);
  const total = all.length;
  const offset = (page - 1) * pageSize;
  const data = all.slice(offset, offset + pageSize);
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export interface ProductGrowth {
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  recent_orders: number;
  prior_orders: number;
  growth_pct: number;
}

/** Products with the highest growth in import orders (recent 6 months vs prior 6 months) */
export async function getProductVolumeGrowth(limit = 15, filters?: AnalyticsFilters): Promise<ProductGrowth[]> {
  const GROUP_KEY = await getGroupKeySql();
  const { genericName, dosageForm } = await getNormSelectFragments();
  const extraConditions: string[] = [];
  const extraParams: (string | number)[] = [];
  if (filters?.type) { extraConditions.push("i.submodule_type_code = ?"); extraParams.push(filters.type); }

  // When date filters provided, use them as bounds instead of CTE auto-calculation
  let boundsCte: string;
  let dateFilter: string;
  if (filters?.dateFrom && filters?.dateTo) {
    boundsCte = `WITH bounds AS (
      SELECT
        ? as latest,
        date(?, '-' || (julianday(?) - julianday(?)) / 2 || ' days') as mid,
        ? as earliest
      FROM (SELECT 1)
    )`;
    extraParams.unshift(filters.dateTo, filters.dateFrom, filters.dateTo, filters.dateFrom, filters.dateFrom);
    dateFilter = `AND i.requested_date >= b.earliest AND i.requested_date < date(b.latest, '+1 day')`;
  } else {
    const lb = filters?.lookback ?? 6;
    boundsCte = `WITH bounds AS (
      SELECT
        MAX(requested_date) as latest,
        date(MAX(requested_date), '-${lb} months') as mid,
        date(MAX(requested_date), '-${lb * 2} months') as earliest
      FROM import_permits WHERE requested_date IS NOT NULL
    )`;
    dateFilter = `AND i.requested_date >= b.earliest`;
  }

  const typeFilter = extraConditions.length > 0 ? `AND ${extraConditions.join(" AND ")}` : "";
  const rows = await queryAll<Omit<ProductGrowth, "growth_pct">>(
    `${boundsCte}
    SELECT
      ${genericName} as generic_name,
      ${dosageForm} as dosage_form,
      p.dosage_strength,
      COUNT(DISTINCT CASE WHEN i.requested_date >= b.mid THEN p.import_permit_id END) as recent_orders,
      COUNT(DISTINCT CASE WHEN i.requested_date < b.mid AND i.requested_date >= b.earliest THEN p.import_permit_id END) as prior_orders
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    CROSS JOIN bounds b
    WHERE p.generic_name IS NOT NULL AND p.generic_name != ''
      ${dateFilter}
      ${typeFilter}
    GROUP BY ${GROUP_KEY}
    HAVING prior_orders >= 3 AND recent_orders >= 1
    ORDER BY (CAST(recent_orders AS REAL) / MAX(1, prior_orders)) DESC
    LIMIT ?`,
    [...extraParams, limit]
  );
  return rows.map((r) => ({
    ...r,
    growth_pct: Math.round(((r.recent_orders / Math.max(1, r.prior_orders)) - 1) * 100),
  }));
}

/** Products with the biggest decline in import orders (recent N months vs prior N months) */
export async function getProductVolumeDecline(limit = 15, filters?: AnalyticsFilters): Promise<ProductGrowth[]> {
  const GROUP_KEY = await getGroupKeySql();
  const { genericName, dosageForm } = await getNormSelectFragments();
  const extraConditions: string[] = [];
  const extraParams: (string | number)[] = [];
  if (filters?.type) { extraConditions.push("i.submodule_type_code = ?"); extraParams.push(filters.type); }

  const lb = filters?.lookback ?? 6;
  const boundsCte = `WITH bounds AS (
    SELECT
      MAX(requested_date) as latest,
      date(MAX(requested_date), '-${lb} months') as mid,
      date(MAX(requested_date), '-${lb * 2} months') as earliest
    FROM import_permits WHERE requested_date IS NOT NULL
  )`;
  const dateFilter = `AND i.requested_date >= b.earliest`;

  const typeFilter = extraConditions.length > 0 ? `AND ${extraConditions.join(" AND ")}` : "";
  const rows = await queryAll<Omit<ProductGrowth, "growth_pct">>(
    `${boundsCte}
    SELECT
      ${genericName} as generic_name,
      ${dosageForm} as dosage_form,
      p.dosage_strength,
      COUNT(DISTINCT CASE WHEN i.requested_date >= b.mid THEN p.import_permit_id END) as recent_orders,
      COUNT(DISTINCT CASE WHEN i.requested_date < b.mid AND i.requested_date >= b.earliest THEN p.import_permit_id END) as prior_orders
    FROM import_permit_products p
    JOIN import_permits i ON p.import_permit_id = i.id
    CROSS JOIN bounds b
    WHERE p.generic_name IS NOT NULL AND p.generic_name != ''
      ${dateFilter}
      ${typeFilter}
    GROUP BY ${GROUP_KEY}
    HAVING prior_orders >= ? AND recent_orders < prior_orders
    ORDER BY (CAST(recent_orders AS REAL) / MAX(1, prior_orders)) ASC
    LIMIT ?`,
    [...extraParams, filters?.minPriorOrders ?? 10, limit]
  );
  return rows.map((r) => ({
    ...r,
    growth_pct: Math.round(((r.recent_orders / Math.max(1, r.prior_orders)) - 1) * 100),
  }));
}

export interface DosageFormMarket {
  dosage_form: string;
  order_count: number;
  total_value: number;
  product_count: number;
}

/** Market breakdown by dosage form category */
export async function getDosageFormMarketShare(filters?: AnalyticsFilters): Promise<DosageFormMarket[]> {
  const { dosageForm } = await getNormSelectFragments();
  const GROUP_KEY = await getGroupKeySql();
  const conditions: string[] = [
    "p.generic_name IS NOT NULL", "p.generic_name != ''",
    "p.dosage_form IS NOT NULL", "p.dosage_form != ''",
  ];
  const params: (string | number)[] = [];
  const needsJoin = !!(filters?.dateFrom || filters?.dateTo || filters?.type);
  if (filters?.dateFrom) { conditions.push("i.requested_date >= ?"); params.push(filters.dateFrom); }
  if (filters?.dateTo) { conditions.push("i.requested_date < date(?, '+1 day')"); params.push(filters.dateTo); }
  if (filters?.type) { conditions.push("i.submodule_type_code = ?"); params.push(filters.type); }
  const join = needsJoin ? "JOIN import_permits i ON p.import_permit_id = i.id" : "";
  const where = `WHERE ${conditions.join(" AND ")}`;
  return queryAll<DosageFormMarket>(
    `SELECT
      ${dosageForm} as dosage_form,
      COUNT(DISTINCT p.import_permit_id) as order_count,
      COALESCE(SUM(p.amount), 0) as total_value,
      COUNT(DISTINCT ${GROUP_KEY}) as product_count
    FROM import_permit_products p
    ${join}
    ${where}
    GROUP BY ${dosageForm}
    HAVING total_value > 0
    ORDER BY total_value DESC
    LIMIT 12`,
    params
  );
}

// ─── Product Search (for compare product picker) ─────────────────────────────

export interface ProductSearchResult {
  slug: string;
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  order_count: number;
}

export async function searchProductsByName(query: string, limit = 20): Promise<ProductSearchResult[]> {
  const GROUP_KEY = await getGroupKeySql();
  const { genericName, dosageForm } = await getNormSelectFragments();
  const like = `%${query}%`;
  const rows = await queryAll<Omit<ProductSearchResult, "slug"> & { group_key: string }>(
    `SELECT
      ${GROUP_KEY} as group_key,
      ${genericName} as generic_name,
      ${dosageForm} as dosage_form,
      p.dosage_strength,
      COUNT(DISTINCT p.import_permit_id) as order_count
    FROM import_permit_products p
    WHERE p.generic_name IS NOT NULL AND p.generic_name != ''
      AND p.generic_name LIKE ?
    GROUP BY ${GROUP_KEY}
    HAVING order_count >= 2
    ORDER BY order_count DESC
    LIMIT ?`,
    [like, limit]
  );
  return rows.map((row) => ({
    slug: encodeURIComponent(Buffer.from(row.group_key).toString("base64url")),
    generic_name: row.generic_name,
    dosage_form: row.dosage_form,
    dosage_strength: row.dosage_strength,
    order_count: row.order_count,
  }));
}

import type {
  MonthlyByType,
  SupplierStat,
  ManufacturerStat,
  DosageFormMarket,
  ProductGrowth,
  ProductPriceSpread,
  ProductPriceTrend,
  ProductMonthlyVolume,
} from "./queries";

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function normalizeMonth(yyyymm: string): { index: number; label: string } {
  const parts = yyyymm.split("-");
  const m = parseInt(parts[1] ?? "1", 10);
  return { index: m - 1, label: MONTH_NAMES[m - 1] ?? yyyymm };
}

function unionByKey<A, B>(
  dataA: A[],
  dataB: B[],
  keyFn: (item: A | B) => string,
  merge: (key: string, a: A | undefined, b: B | undefined) => unknown
) {
  const map = new Map<string, { a?: A; b?: B }>();
  for (const item of dataA) {
    const k = keyFn(item);
    map.set(k, { ...map.get(k), a: item });
  }
  for (const item of dataB) {
    const k = keyFn(item as unknown as A | B);
    map.set(k, { ...map.get(k), b: item });
  }
  return Array.from(map.entries()).map(([key, { a, b }]) => merge(key, a, b));
}

// ─── Value Trends (AreaChart) ────────────────────────────────────────────────

export interface MergedValueTrend {
  label: string;
  a_mdcn_value: number;
  a_md_value: number;
  b_mdcn_value: number;
  b_md_value: number;
}

export function mergeValueTrends(dataA: MonthlyByType[], dataB: MonthlyByType[]): MergedValueTrend[] {
  const allMonths = new Set<number>();
  const mapA = new Map<number, MonthlyByType>();
  const mapB = new Map<number, MonthlyByType>();

  for (const row of dataA) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapA.set(index, row);
  }
  for (const row of dataB) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapB.set(index, row);
  }

  return Array.from(allMonths)
    .sort((a, b) => a - b)
    .map((idx) => ({
      label: MONTH_NAMES[idx]!,
      a_mdcn_value: mapA.get(idx)?.mdcn_value ?? 0,
      a_md_value: mapA.get(idx)?.md_value ?? 0,
      b_mdcn_value: mapB.get(idx)?.mdcn_value ?? 0,
      b_md_value: mapB.get(idx)?.md_value ?? 0,
    }));
}

// ─── Avg Order Value (LineChart) ─────────────────────────────────────────────

export interface MergedAvgOrderValue {
  label: string;
  a_avg_value: number | null;
  b_avg_value: number | null;
}

export function mergeAvgOrderValue(
  dataA: { month: string; avg_value: number }[],
  dataB: { month: string; avg_value: number }[]
): MergedAvgOrderValue[] {
  const allMonths = new Set<number>();
  const mapA = new Map<number, number>();
  const mapB = new Map<number, number>();

  for (const row of dataA) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapA.set(index, row.avg_value);
  }
  for (const row of dataB) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapB.set(index, row.avg_value);
  }

  return Array.from(allMonths)
    .sort((a, b) => a - b)
    .map((idx) => ({
      label: MONTH_NAMES[idx]!,
      a_avg_value: mapA.get(idx) ?? null,
      b_avg_value: mapB.get(idx) ?? null,
    }));
}

// ─── Top Agents (BarChart) ───────────────────────────────────────────────────

export interface MergedAgent {
  name: string;
  fullName: string;
  a_value: number;
  b_value: number;
}

export function mergeTopAgents(dataA: SupplierStat[], dataB: SupplierStat[]): MergedAgent[] {
  const merged = unionByKey(
    dataA,
    dataB,
    (item) => (item as SupplierStat).name,
    (key, a, b) => ({
      name: key.length > 30 ? key.slice(0, 27) + "..." : key,
      fullName: key,
      a_value: (a as SupplierStat | undefined)?.value ?? 0,
      b_value: (b as SupplierStat | undefined)?.value ?? 0,
    })
  ) as MergedAgent[];

  return merged
    .sort((x, y) => Math.max(y.a_value, y.b_value) - Math.max(x.a_value, x.b_value))
    .slice(0, 15);
}

// ─── Top Manufacturers (BarChart) ────────────────────────────────────────────

export interface MergedManufacturer {
  name: string;
  fullName: string;
  a_count: number;
  b_count: number;
}

export function mergeTopManufacturers(dataA: ManufacturerStat[], dataB: ManufacturerStat[]): MergedManufacturer[] {
  const merged = unionByKey(
    dataA,
    dataB,
    (item) => (item as ManufacturerStat).name,
    (key, a, b) => ({
      name: key.length > 25 ? key.slice(0, 22) + "..." : key,
      fullName: key,
      a_count: (a as ManufacturerStat | undefined)?.count ?? 0,
      b_count: (b as ManufacturerStat | undefined)?.count ?? 0,
    })
  ) as MergedManufacturer[];

  return merged
    .sort((x, y) => Math.max(y.a_count, y.b_count) - Math.max(x.a_count, x.b_count))
    .slice(0, 15);
}

// ─── Market by Category (BarChart) ───────────────────────────────────────────

export interface MergedMarketCategory {
  label: string;
  dosage_form: string;
  a_total_value: number;
  b_total_value: number;
}

export function mergeMarketByCategory(dataA: DosageFormMarket[], dataB: DosageFormMarket[]): MergedMarketCategory[] {
  const merged = unionByKey(
    dataA,
    dataB,
    (item) => (item as DosageFormMarket).dosage_form,
    (key, a, b) => ({
      label: key.charAt(0) + key.slice(1).toLowerCase(),
      dosage_form: key,
      a_total_value: (a as DosageFormMarket | undefined)?.total_value ?? 0,
      b_total_value: (b as DosageFormMarket | undefined)?.total_value ?? 0,
    })
  ) as MergedMarketCategory[];

  return merged.sort(
    (x, y) => Math.max(y.a_total_value, y.b_total_value) - Math.max(x.a_total_value, x.b_total_value)
  );
}

// ─── Product Growth (BarChart) ───────────────────────────────────────────────

export interface MergedProductGrowth {
  label: string;
  fullLabel: string;
  a_growth_pct: number;
  b_growth_pct: number;
}

function productLabel(r: ProductGrowth): string {
  const parts = [r.generic_name];
  if (r.dosage_strength) parts.push(r.dosage_strength);
  if (r.dosage_form) parts.push(r.dosage_form.toLowerCase());
  const label = parts.join(" ");
  return label.length > 35 ? label.slice(0, 32) + "..." : label;
}

function productFullLabel(r: ProductGrowth): string {
  return `${r.generic_name} ${r.dosage_strength ?? ""} ${r.dosage_form ?? ""}`.trim();
}

function productKey(r: ProductGrowth): string {
  return `${r.generic_name}||${r.dosage_form ?? ""}||${r.dosage_strength ?? ""}`.toLowerCase();
}

export function mergeProductGrowth(dataA: ProductGrowth[], dataB: ProductGrowth[]): MergedProductGrowth[] {
  const merged = unionByKey(
    dataA,
    dataB,
    (item) => productKey(item as ProductGrowth),
    (_key, a, b) => {
      const ref = (a ?? b) as ProductGrowth;
      return {
        label: productLabel(ref),
        fullLabel: productFullLabel(ref),
        a_growth_pct: (a as ProductGrowth | undefined)?.growth_pct ?? 0,
        b_growth_pct: (b as ProductGrowth | undefined)?.growth_pct ?? 0,
      };
    }
  ) as MergedProductGrowth[];

  return merged
    .sort((x, y) => Math.max(Math.abs(y.a_growth_pct), Math.abs(y.b_growth_pct)) - Math.max(Math.abs(x.a_growth_pct), Math.abs(x.b_growth_pct)))
    .slice(0, 15);
}

// ─── Price Spreads (Table) ───────────────────────────────────────────────────

export interface MergedPriceSpread {
  slug: string;
  generic_name: string;
  dosage_form: string | null;
  dosage_strength: string | null;
  a_order_count: number;
  a_avg_price: number;
  a_min_price: number;
  a_max_price: number;
  a_spread_pct: number;
  b_order_count: number;
  b_avg_price: number;
  b_min_price: number;
  b_max_price: number;
  b_spread_pct: number;
}

export function mergePriceSpreads(dataA: ProductPriceSpread[], dataB: ProductPriceSpread[]): MergedPriceSpread[] {
  const merged = unionByKey(
    dataA,
    dataB,
    (item) => (item as ProductPriceSpread).slug,
    (_key, a, b) => {
      const refA = a as ProductPriceSpread | undefined;
      const refB = b as ProductPriceSpread | undefined;
      const ref = refA ?? refB!;
      return {
        slug: ref.slug,
        generic_name: ref.generic_name,
        dosage_form: ref.dosage_form,
        dosage_strength: ref.dosage_strength,
        a_order_count: refA?.order_count ?? 0,
        a_avg_price: refA?.avg_price ?? 0,
        a_min_price: refA?.min_price ?? 0,
        a_max_price: refA?.max_price ?? 0,
        a_spread_pct: refA?.spread_pct ?? 0,
        b_order_count: refB?.order_count ?? 0,
        b_avg_price: refB?.avg_price ?? 0,
        b_min_price: refB?.min_price ?? 0,
        b_max_price: refB?.max_price ?? 0,
        b_spread_pct: refB?.spread_pct ?? 0,
      };
    }
  ) as MergedPriceSpread[];

  return merged.sort(
    (x, y) => Math.max(y.a_spread_pct, y.b_spread_pct) - Math.max(x.a_spread_pct, x.b_spread_pct)
  );
}

// ─── Product Price Trend (LineChart) ─────────────────────────────────────────

export interface MergedProductPrice {
  label: string;
  a_avg_price: number | null;
  b_avg_price: number | null;
}

export function mergeProductPriceTrend(dataA: ProductPriceTrend[], dataB: ProductPriceTrend[]): MergedProductPrice[] {
  const allMonths = new Set<number>();
  const mapA = new Map<number, number>();
  const mapB = new Map<number, number>();

  for (const row of dataA) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapA.set(index, row.avg_price);
  }
  for (const row of dataB) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapB.set(index, row.avg_price);
  }

  return Array.from(allMonths)
    .sort((a, b) => a - b)
    .map((idx) => ({
      label: MONTH_NAMES[idx]!,
      a_avg_price: mapA.get(idx) ?? null,
      b_avg_price: mapB.get(idx) ?? null,
    }));
}

// ─── Product Volume (BarChart) ───────────────────────────────────────────────

export interface MergedProductVolume {
  label: string;
  a_quantity: number;
  b_quantity: number;
}

export function mergeProductVolume(dataA: ProductMonthlyVolume[], dataB: ProductMonthlyVolume[]): MergedProductVolume[] {
  const allMonths = new Set<number>();
  const mapA = new Map<number, number>();
  const mapB = new Map<number, number>();

  for (const row of dataA) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapA.set(index, row.quantity);
  }
  for (const row of dataB) {
    const { index } = normalizeMonth(row.month);
    allMonths.add(index);
    mapB.set(index, row.quantity);
  }

  return Array.from(allMonths)
    .sort((a, b) => a - b)
    .map((idx) => ({
      label: MONTH_NAMES[idx]!,
      a_quantity: mapA.get(idx) ?? 0,
      b_quantity: mapB.get(idx) ?? 0,
    }));
}

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    if (value < 1 && value > 0) return `$${value.toFixed(2)}`;
  }
  // Show 2 decimal places for values under $1000 (unit prices often in cents)
  const fractionDigits = Math.abs(value) < 1000 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

export function formatMonth(month: string): string {
  // "2024-03" → "Mar 2024"
  try {
    const [y, m] = month.split("-");
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  } catch {
    return month;
  }
}

export function shortPort(port: string): string {
  return port
    .replace(" International Airport", "")
    .replace(" Entry and Exit port", "")
    .replace(" Entry and Exit Port", "");
}

export function typeLabel(code: string): string {
  if (code === "MDCN") return "Medicine";
  if (code === "MD") return "Medical Device";
  return code;
}

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

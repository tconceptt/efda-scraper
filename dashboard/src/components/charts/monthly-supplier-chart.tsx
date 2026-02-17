"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductMonthlySupplier } from "@/lib/queries";
import { formatMonth, formatNumber, formatCurrency, CHART_COLORS } from "@/lib/format";

const OTHER_COLOR = "var(--muted-foreground)";
const MAX_SUPPLIERS = 5;

interface SupplierDetail {
  qty: number;
  avgPrice: number;
  orders: number;
}

type MonthDetails = Record<string, SupplierDetail>;

interface MonthlySupplierChartProps {
  data: ProductMonthlySupplier[];
}

export function MonthlySupplierChart({ data }: MonthlySupplierChartProps) {
  const { chartData, suppliers, detailMap } = useMemo(() => {
    if (data.length === 0) return { chartData: [], suppliers: [], detailMap: new Map<string, MonthDetails>() };

    // Rank suppliers by total quantity
    const supplierTotals = new Map<string, number>();
    for (const row of data) {
      supplierTotals.set(
        row.supplier_name,
        (supplierTotals.get(row.supplier_name) ?? 0) + row.quantity
      );
    }
    const ranked = [...supplierTotals.entries()]
      .sort((a, b) => b[1] - a[1]);

    const topSuppliers = ranked.slice(0, MAX_SUPPLIERS).map(([name]) => name);
    const hasOther = ranked.length > MAX_SUPPLIERS;
    const supplierKeys = hasOther ? [...topSuppliers, "Other"] : topSuppliers;

    // Short supplier names for chart keys (long names break the layout)
    const shortName = (name: string) =>
      name.length > 25 ? name.slice(0, 23) + "\u2026" : name;

    const supplierLabels = supplierKeys.map((s) =>
      s === "Other" ? "Other" : shortName(s)
    );

    // Build a map from short label back to full name for tooltip
    const labelToFull = new Map<string, string>();
    supplierKeys.forEach((full, i) => labelToFull.set(supplierLabels[i], full));

    // Pivot data: one object per month with supplier quantities as keys
    const monthMap = new Map<string, Record<string, string | number>>();
    const detailMap = new Map<string, MonthDetails>();

    for (const row of data) {
      const isTop = topSuppliers.includes(row.supplier_name);
      const label = isTop ? shortName(row.supplier_name) : "Other";

      if (!monthMap.has(row.month)) {
        monthMap.set(row.month, { month: row.month });
        detailMap.set(row.month, {});
      }

      const monthObj = monthMap.get(row.month)!;
      monthObj[label] = ((monthObj[label] as number) ?? 0) + row.quantity;

      // Detail map for tooltip
      const details = detailMap.get(row.month)!;
      if (!details[label]) {
        details[label] = { qty: 0, avgPrice: 0, orders: 0 };
      }
      // Weighted avg price: accumulate qty*price then divide later
      const prev = details[label];
      const totalQty = prev.qty + row.quantity;
      prev.avgPrice =
        totalQty > 0
          ? (prev.avgPrice * prev.qty + row.avg_price * row.quantity) / totalQty
          : 0;
      prev.qty = totalQty;
      prev.orders += row.order_count;
    }

    const chartData = [...monthMap.values()].sort((a, b) =>
      (a.month as string).localeCompare(b.month as string)
    );

    return { chartData, suppliers: supplierLabels, detailMap };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Volume by Supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Volume by Supplier</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => formatNumber(v)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const details = detailMap.get(label as string);
                  return (
                    <div
                      className="rounded-md border px-3 py-2 text-sm shadow-md"
                      style={{
                        backgroundColor: "var(--popover)",
                        color: "var(--popover-foreground)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <p className="mb-1 font-medium">{formatMonth(label as string)}</p>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Total: {formatNumber(
                          payload.reduce((sum, p) => sum + ((p.value as number) ?? 0), 0)
                        )} units
                      </p>
                      {payload
                        .filter((p) => (p.value as number) > 0)
                        .reverse()
                        .map((entry) => {
                          const name = entry.dataKey as string;
                          const detail = details?.[name];
                          return (
                            <div
                              key={name}
                              className="flex items-start gap-2 py-0.5"
                            >
                              <span
                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatNumber(detail?.qty ?? 0)} units
                                  {detail?.avgPrice
                                    ? ` \u00B7 avg ${formatCurrency(detail.avgPrice)}`
                                    : ""}
                                  {detail?.orders
                                    ? ` \u00B7 ${detail.orders} order${detail.orders !== 1 ? "s" : ""}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
              {suppliers.map((supplier, idx) => (
                <Bar
                  key={supplier}
                  dataKey={supplier}
                  stackId="volume"
                  fill={
                    supplier === "Other"
                      ? OTHER_COLOR
                      : CHART_COLORS[idx % CHART_COLORS.length]
                  }
                  radius={
                    idx === suppliers.length - 1 ? [4, 4, 0, 0] : undefined
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

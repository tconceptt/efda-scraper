"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductSupplierPrice } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

export function SupplierPriceComparison({
  data,
}: {
  data: ProductSupplierPrice[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supplier Price Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No supplier data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    name:
      d.supplier_name.length > 25
        ? d.supplier_name.slice(0, 22) + "..."
        : d.supplier_name,
    fullName: d.supplier_name,
  }));

  const height = Math.max(250, chartData.length * 40);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supplier Price Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                tickFormatter={(v) => formatCurrency(v, true)}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={150}
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) => [
                  String(name) === "Avg Unit Price"
                    ? formatCurrency(Number(value))
                    : formatNumber(Number(value)),
                  String(name),
                ]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ?? ""
                }
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                }}
                labelStyle={{ color: "var(--popover-foreground)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
              />
              <Bar
                dataKey="avg_price"
                name="Avg Unit Price"
                fill="var(--chart-2)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

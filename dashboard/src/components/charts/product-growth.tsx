"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductGrowth } from "@/lib/queries";

function productLabel(r: ProductGrowth): string {
  const parts = [r.generic_name];
  if (r.dosage_strength) parts.push(r.dosage_strength);
  if (r.dosage_form) parts.push(r.dosage_form.toLowerCase());
  const label = parts.join(" ");
  return label.length > 35 ? label.slice(0, 32) + "..." : label;
}

export function ProductGrowthChart({ data }: { data: ProductGrowth[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fastest Growing Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            Not enough data yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: productLabel(d),
    fullLabel: `${d.generic_name} ${d.dosage_strength ?? ""} ${d.dosage_form ?? ""}`.trim(),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Fastest Growing Products — Last 6 Months
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Order growth vs the prior 6-month period. Rising demand signals import opportunities.
        </p>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(350, data.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="label"
                type="category"
                width={200}
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const d = props.payload;
                  const sign = Number(value) > 0 ? "+" : "";
                  return [
                    `${sign}${value}% growth`,
                    `Recent: ${d.recent_orders} orders / Prior: ${d.prior_orders} orders`,
                  ];
                }}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullLabel ?? ""
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
              <Bar dataKey="growth_pct" name="Growth" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.growth_pct >= 0 ? "var(--chart-3)" : "var(--chart-4)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

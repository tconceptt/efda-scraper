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
import type { ProductPriceSpread } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";

function productLabel(r: ProductPriceSpread): string {
  const parts = [r.generic_name];
  if (r.dosage_strength) parts.push(r.dosage_strength);
  if (r.dosage_form) parts.push(r.dosage_form.toLowerCase());
  const label = parts.join(" ");
  return label.length > 35 ? label.slice(0, 32) + "..." : label;
}

export function PriceSpread({ data }: { data: ProductPriceSpread[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price Variation by Product</CardTitle>
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
          Price Variation by Product — Negotiation Opportunities
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Products with the widest price spreads across import orders. Higher spread = more room to negotiate.
        </p>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(350, data.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v}%`}
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
                  return [
                    `${value}% spread`,
                    `Min ${formatCurrency(d.min_price)} / Avg ${formatCurrency(d.avg_price)} / Max ${formatCurrency(d.max_price)}`,
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
              <Bar
                dataKey="spread_pct"
                name="Price Spread"
                fill="var(--chart-4)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

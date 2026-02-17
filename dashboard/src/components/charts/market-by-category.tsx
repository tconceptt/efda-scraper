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
import type { DosageFormMarket } from "@/lib/queries";
import { formatCurrency, formatNumber, CHART_COLORS } from "@/lib/format";

export function MarketByCategory({ data }: { data: DosageFormMarket[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market Structure by Dosage Form</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            Not enough data yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.total_value, 0);
  const chartData = data.map((d) => ({
    ...d,
    label: d.dosage_form.charAt(0) + d.dosage_form.slice(1).toLowerCase(),
    pct: Math.round((d.total_value / total) * 100),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Market Structure by Dosage Form
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Total import value by product category. Shows where the market volume is concentrated.
        </p>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(300, data.length * 36 + 40) }}>
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
                dataKey="label"
                type="category"
                width={120}
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const d = props.payload;
                  return [
                    formatCurrency(Number(value), true),
                    `${d.pct}% of market | ${formatNumber(d.order_count)} orders | ${formatNumber(d.product_count)} products`,
                  ];
                }}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.dosage_form ?? ""
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
              <Bar dataKey="total_value" name="Total Value" radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell
                    key={index}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
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

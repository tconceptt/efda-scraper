"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductPriceTrend } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { mergeProductPriceTrend } from "@/lib/compare-transforms";

interface Props {
  dataA: ProductPriceTrend[];
  dataB: ProductPriceTrend[];
  labelA: string;
  labelB: string;
  productName?: string;
}

export function ProductPriceCompare({ dataA, dataB, labelA, labelB, productName }: Props) {
  const merged = mergeProductPriceTrend(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {productName ? `${productName} — ` : ""}Price Trend — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCurrency(v, true)}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                }}
                labelStyle={{ color: "var(--popover-foreground)" }}
                itemStyle={{ color: "var(--popover-foreground)" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="a_avg_price"
                name={`Avg Price (${labelA})`}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="b_avg_price"
                name={`Avg Price (${labelB})`}
                stroke="var(--chart-3)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

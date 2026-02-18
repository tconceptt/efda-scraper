"use client";

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
import type { DosageFormMarket } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { mergeMarketByCategory } from "@/lib/compare-transforms";

interface Props {
  dataA: DosageFormMarket[];
  dataB: DosageFormMarket[];
  labelA: string;
  labelB: string;
}

export function MarketByCategoryCompare({ dataA, dataB, labelA, labelB }: Props) {
  const merged = mergeMarketByCategory(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Market by Category — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(350, merged.length * 40 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged} layout="vertical" margin={{ left: 20 }}>
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
                formatter={(value, name) => [formatCurrency(Number(value), true), String(name)]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.dosage_form ?? ""}
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
              <Bar dataKey="a_total_value" name={labelA} fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="b_total_value" name={labelB} fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

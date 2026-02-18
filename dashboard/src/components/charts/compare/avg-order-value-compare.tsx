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
import { formatCurrency } from "@/lib/format";
import { mergeAvgOrderValue } from "@/lib/compare-transforms";

interface Props {
  dataA: { month: string; avg_value: number }[];
  dataB: { month: string; avg_value: number }[];
  labelA: string;
  labelB: string;
}

export function AvgOrderValueCompare({ dataA, dataB, labelA, labelB }: Props) {
  const merged = mergeAvgOrderValue(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Avg Order Value — {labelA} vs {labelB}
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
                dataKey="a_avg_value"
                name={labelA}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="b_avg_value"
                name={labelB}
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

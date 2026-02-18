"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { mergeValueTrends } from "@/lib/compare-transforms";
import type { MonthlyByType } from "@/lib/queries";

interface Props {
  dataA: MonthlyByType[];
  dataB: MonthlyByType[];
  labelA: string;
  labelB: string;
}

export function ValueTrendsCompare({ dataA, dataB, labelA, labelB }: Props) {
  const merged = mergeValueTrends(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Value Trends — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged}>
              <defs>
                <linearGradient id="cmpMdcnA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cmpMdA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                formatter={(value, name) => [formatCurrency(Number(value), true), String(name)]}
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
              <Area
                type="monotone"
                dataKey="a_mdcn_value"
                name={`Medicine (${labelA})`}
                stroke="var(--chart-1)"
                fill="url(#cmpMdcnA)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="a_md_value"
                name={`Med Device (${labelA})`}
                stroke="var(--chart-2)"
                fill="url(#cmpMdA)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="b_mdcn_value"
                name={`Medicine (${labelB})`}
                stroke="var(--chart-3)"
                fill="none"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
              <Area
                type="monotone"
                dataKey="b_md_value"
                name={`Med Device (${labelB})`}
                stroke="var(--chart-4)"
                fill="none"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

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
import type { ProductMonthlyVolume } from "@/lib/queries";
import { formatNumber } from "@/lib/format";
import { mergeProductVolume } from "@/lib/compare-transforms";

interface Props {
  dataA: ProductMonthlyVolume[];
  dataB: ProductMonthlyVolume[];
  labelA: string;
  labelB: string;
  productName?: string;
}

export function ProductVolumeCompare({ dataA, dataB, labelA, labelB, productName }: Props) {
  const merged = mergeProductVolume(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {productName ? `${productName} — ` : ""}Volume — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatNumber(v)}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
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
              <Bar dataKey="a_quantity" name={labelA} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="b_quantity" name={labelB} fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

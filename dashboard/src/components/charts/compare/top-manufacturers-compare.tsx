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
import type { ManufacturerStat } from "@/lib/queries";
import { formatNumber } from "@/lib/format";
import { mergeTopManufacturers } from "@/lib/compare-transforms";

interface Props {
  dataA: ManufacturerStat[];
  dataB: ManufacturerStat[];
  labelA: string;
  labelB: string;
}

export function TopManufacturersCompare({ dataA, dataB, labelA, labelB }: Props) {
  const merged = mergeTopManufacturers(dataA, dataB);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Top Manufacturers — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(350, merged.length * 40 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
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
                formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
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
              <Bar dataKey="a_count" name={labelA} fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="b_count" name={labelB} fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

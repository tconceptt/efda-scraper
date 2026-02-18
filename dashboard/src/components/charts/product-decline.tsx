"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import type { ProductGrowth } from "@/lib/queries";

const LOOKBACK_LABELS: Record<string, string> = {
  "1": "Last Month",
  "3": "Last 3 Months",
  "6": "Last 6 Months",
  "12": "Last Year",
};

export function ProductDeclineChart({
  data,
  lookback = 6,
}: {
  data: ProductGrowth[];
  lookback?: number;
}) {
  const periodLabel = LOOKBACK_LABELS[String(lookback)] ?? `Last ${lookback} Months`;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Declining Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            No declining products found for this period.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Declining Products — {periodLabel}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Order decline vs the prior period. Falling demand signals reduced import activity.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        {/* Mobile cards */}
        <div className="space-y-3 px-4 md:hidden">
          {data.map((row) => (
            <div key={`${row.generic_name}-${row.dosage_strength}-${row.dosage_form}`} className="rounded-lg border p-3">
              <div className="truncate text-sm font-medium">
                {row.generic_name}
                {row.dosage_strength && (
                  <span className="ml-1 text-muted-foreground">
                    {row.dosage_strength}
                  </span>
                )}
              </div>
              {row.dosage_form && (
                <div className="truncate text-xs text-muted-foreground">
                  {row.dosage_form}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatNumber(row.prior_orders)} → {formatNumber(row.recent_orders)} orders
                </span>
                <Badge
                  variant="outline"
                  className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                >
                  {row.growth_pct}%
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Prior</TableHead>
                <TableHead className="text-right">Recent</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={`${row.generic_name}-${row.dosage_strength}-${row.dosage_form}`}>
                  <TableCell className="max-w-[200px]">
                    <div className="truncate text-sm font-medium">
                      {row.generic_name}
                      {row.dosage_strength && (
                        <span className="ml-1 text-muted-foreground">
                          {row.dosage_strength}
                        </span>
                      )}
                    </div>
                    {row.dosage_form && (
                      <div className="truncate text-xs text-muted-foreground">
                        {row.dosage_form}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.prior_orders)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.recent_orders)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    >
                      {row.growth_pct}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

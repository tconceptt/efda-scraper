"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductPriceSpread } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";
import { mergePriceSpreads } from "@/lib/compare-transforms";

interface Props {
  dataA: ProductPriceSpread[];
  dataB: ProductPriceSpread[];
  labelA: string;
  labelB: string;
}

export function PriceSpreadCompare({ dataA, dataB, labelA, labelB }: Props) {
  const merged = mergePriceSpreads(dataA, dataB);

  if (merged.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price Variation Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            Not enough data for comparison.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Price Variation — {labelA} vs {labelB}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        {/* Mobile cards */}
        <div className="space-y-3 px-4 md:hidden">
          {merged.map((row) => (
            <div key={row.slug} className="rounded-lg border p-3 space-y-2">
              <div className="truncate text-sm font-medium">
                {row.generic_name}
                {row.dosage_strength && (
                  <span className="ml-1 text-muted-foreground">{row.dosage_strength}</span>
                )}
              </div>
              {row.dosage_form && (
                <div className="truncate text-xs text-muted-foreground">{row.dosage_form}</div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-muted/40 p-2 space-y-1">
                  <div className="font-semibold">{labelA}</div>
                  {row.a_order_count > 0 ? (
                    <>
                      <div className="font-mono">{formatNumber(row.a_order_count)} orders</div>
                      <div className="font-mono text-muted-foreground">
                        Avg {formatCurrency(row.a_avg_price)}
                      </div>
                      <div className="font-mono font-medium">{row.a_spread_pct}% spread</div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No data</div>
                  )}
                </div>
                <div className="rounded-md bg-muted/40 p-2 space-y-1">
                  <div className="font-semibold">{labelB}</div>
                  {row.b_order_count > 0 ? (
                    <>
                      <div className="font-mono">{formatNumber(row.b_order_count)} orders</div>
                      <div className="font-mono text-muted-foreground">
                        Avg {formatCurrency(row.b_avg_price)}
                      </div>
                      <div className="font-mono font-medium">{row.b_spread_pct}% spread</div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">No data</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto px-2">
          <table className="w-full text-sm">
            <thead>
              {/* Group header row */}
              <tr className="border-b">
                <th className="p-2 text-left font-medium text-foreground" />
                <th
                  colSpan={4}
                  className="p-2 text-center font-semibold text-sm bg-muted/50 border-l-2 border-border"
                >
                  {labelA}
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center font-semibold text-sm bg-muted/30 border-l-4 border-border"
                >
                  {labelB}
                </th>
              </tr>
              {/* Column header row */}
              <tr className="border-b text-muted-foreground">
                <th className="p-2 text-left text-xs font-medium">Product</th>
                <th className="p-2 text-right text-xs font-medium border-l-2 border-border bg-muted/50">Orders</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/50">Avg</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/50">Min</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/50">Spread</th>
                <th className="p-2 text-right text-xs font-medium border-l-4 border-border bg-muted/30">Orders</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/30">Avg</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/30">Min</th>
                <th className="p-2 text-right text-xs font-medium bg-muted/30">Spread</th>
              </tr>
            </thead>
            <tbody>
              {merged.map((row) => (
                <tr key={row.slug} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-2 max-w-[200px]">
                    <div className="truncate text-sm font-medium">
                      {row.generic_name}
                      {row.dosage_strength && (
                        <span className="ml-1 text-muted-foreground">{row.dosage_strength}</span>
                      )}
                    </div>
                    {row.dosage_form && (
                      <div className="truncate text-xs text-muted-foreground">{row.dosage_form}</div>
                    )}
                  </td>
                  {/* Period A */}
                  <td className="p-2 text-right font-mono text-sm border-l-2 border-border bg-muted/20">
                    {row.a_order_count || "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm bg-muted/20">
                    {row.a_order_count ? formatCurrency(row.a_avg_price) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm bg-muted/20">
                    {row.a_order_count ? formatCurrency(row.a_min_price) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm font-medium bg-muted/20">
                    {row.a_order_count ? `${row.a_spread_pct}%` : "—"}
                  </td>
                  {/* Period B */}
                  <td className="p-2 text-right font-mono text-sm border-l-4 border-border">
                    {row.b_order_count || "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm">
                    {row.b_order_count ? formatCurrency(row.b_avg_price) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm">
                    {row.b_order_count ? formatCurrency(row.b_min_price) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono text-sm font-medium">
                    {row.b_order_count ? `${row.b_spread_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

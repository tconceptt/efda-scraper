import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductPriceSpread } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

export function PriceSpread({ data }: { data: ProductPriceSpread[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price Variation by Product</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            Not enough data yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Price Variation — Negotiation Opportunities
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Products with the widest price spreads across import orders.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead className="text-right">Spread</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.slug}>
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
                  {formatNumber(row.order_count)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(row.min_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(row.avg_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(row.max_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">
                  {row.spread_pct}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 px-6">
          <Link
            href="/analytics/price-variance"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View all →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

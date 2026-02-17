"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import type { PaginatedResult, ProductPriceSpread } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

interface PriceVarianceTableProps {
  result: PaginatedResult<ProductPriceSpread>;
}

export function PriceVarianceTable({ result }: PriceVarianceTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (!("page" in updates)) {
        params.delete("page");
      }
      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition]
  );

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={searchParams.get("type") ?? "all"}
          onValueChange={(v) => updateParams({ type: v === "all" ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MDCN">Medicine</SelectItem>
            <SelectItem value="MD">Medical Device</SelectItem>
          </SelectContent>
        </Select>
        {isPending && (
          <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Min Price</TableHead>
              <TableHead className="text-right">Avg Price</TableHead>
              <TableHead className="text-right">Max Price</TableHead>
              <TableHead className="text-right">Spread %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((row) => (
                <TableRow
                  key={row.slug}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/products/${row.slug}`)}
                >
                  <TableCell className="max-w-[300px]">
                    <div className="truncate font-medium">
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
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.order_count)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.min_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.avg_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.max_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {row.spread_pct}%
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {result.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(result.page - 1) * result.pageSize + 1}–
            {Math.min(result.page * result.pageSize, result.total)} of{" "}
            {result.total.toLocaleString()} products
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={result.page <= 1}
              onClick={() => updateParams({ page: "1" })}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page <= 1}
              onClick={() =>
                updateParams({ page: String(result.page - 1) })
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              Page {result.page} of {result.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page >= result.totalPages}
              onClick={() =>
                updateParams({ page: String(result.page + 1) })
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page >= result.totalPages}
              onClick={() =>
                updateParams({ page: String(result.totalPages) })
              }
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

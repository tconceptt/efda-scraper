"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import type { AggregatedProductRow, PaginatedResult } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

interface ProductsTableProps {
  result: PaginatedResult<AggregatedProductRow>;
}

export function ProductsTable({ result }: ProductsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") ?? ""
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");

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

  const currentSort = searchParams.get("sort") ?? "order_count";
  const currentDir = searchParams.get("dir") ?? "desc";

  function toggleSort(col: string) {
    if (currentSort === col) {
      updateParams({ sort: col, dir: currentDir === "desc" ? "asc" : "desc" });
    } else {
      updateParams({ sort: col, dir: "desc" });
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (currentSort !== col)
      return <ChevronDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return currentDir === "desc" ? (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search generic name, brand..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParams({ search: searchInput });
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={searchParams.get("type") ?? "all"}
          onValueChange={(v) => updateParams({ type: v === "all" ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MDCN">Medicine</SelectItem>
            <SelectItem value="MD">Medical Device</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          placeholder="From"
          value={dateFrom}
          onChange={(e) => {
            const v = e.target.value;
            setDateFrom(v);
            if (v && dateTo) updateParams({ dateFrom: v, dateTo });
            else if (!v && !dateTo) updateParams({ dateFrom: null, dateTo: null });
          }}
          onKeyDown={(e) => e.preventDefault()}
          className="w-full sm:w-[160px]"
        />
        <Input
          type="date"
          placeholder="To"
          value={dateTo}
          onChange={(e) => {
            const v = e.target.value;
            setDateTo(v);
            if (dateFrom && v) updateParams({ dateFrom, dateTo: v });
            else if (!dateFrom && !v) updateParams({ dateFrom: null, dateTo: null });
          }}
          onKeyDown={(e) => e.preventDefault()}
          className="w-full sm:w-[160px]"
        />
        {isPending && (
          <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />
        )}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {result.data.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No products found.</p>
        ) : (
          result.data.map((row) => (
            <div
              key={row.slug}
              className="cursor-pointer rounded-lg border p-3 active:bg-muted/50"
              onClick={() => router.push(`/products/${row.slug}`)}
            >
              <div className="truncate font-medium">
                {row.generic_name}
                {row.dosage_strength && (
                  <span className="ml-1 text-muted-foreground">
                    {row.dosage_strength}
                    {row.dosage_unit ? ` ${row.dosage_unit}` : ""}
                  </span>
                )}
              </div>
              {row.dosage_form && (
                <div className="truncate text-xs text-muted-foreground">{row.dosage_form}</div>
              )}
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{formatNumber(row.order_count)} orders</span>
                <span>{formatNumber(row.brand_count)} brands</span>
                <span>{formatNumber(row.supplier_count)} suppliers</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Avg {row.avg_price ? formatCurrency(row.avg_price) : "\u2014"}
                </span>
                <span className="font-mono font-medium">
                  {row.total_value ? formatCurrency(row.total_value) : "\u2014"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("generic_name")}
              >
                Product <SortIcon col="generic_name" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("brand_count")}
              >
                Brands <SortIcon col="brand_count" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("supplier_count")}
              >
                Suppliers <SortIcon col="supplier_count" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("order_count")}
              >
                Orders <SortIcon col="order_count" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("total_quantity")}
              >
                Total Qty <SortIcon col="total_quantity" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("avg_price")}
              >
                Avg Price <SortIcon col="avg_price" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("total_value")}
              >
                Total Value <SortIcon col="total_value" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                            {row.dosage_unit ? ` ${row.dosage_unit}` : ""}
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
                      {formatNumber(row.brand_count)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(row.supplier_count)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatNumber(row.order_count)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.total_quantity ? formatNumber(row.total_quantity) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.avg_price ? formatCurrency(row.avg_price) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.total_value ? formatCurrency(row.total_value) : "\u2014"}
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

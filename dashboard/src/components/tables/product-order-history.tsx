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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import type { ProductOrderRow, PaginatedResult } from "@/lib/queries";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

interface ProductOrderHistoryProps {
  result: PaginatedResult<ProductOrderRow>;
}

export function ProductOrderHistory({ result }: ProductOrderHistoryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updatePage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete("historyPage");
      } else {
        params.set("historyPage", String(page));
      }
      startTransition(() => {
        router.push(`?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams, startTransition]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">Order History</h3>
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Importer</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No order history.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/imports/${row.import_permit_id}`)}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.requested_date)}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {row.product_name}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {row.agent_name}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {row.supplier_name}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.quantity ? formatNumber(row.quantity) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.unit_price ? formatCurrency(row.unit_price) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.amount ? formatCurrency(row.amount) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {result.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(result.page - 1) * result.pageSize + 1}–
            {Math.min(result.page * result.pageSize, result.total)} of{" "}
            {result.total.toLocaleString()} orders
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={result.page <= 1}
              onClick={() => updatePage(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page <= 1}
              onClick={() => updatePage(result.page - 1)}
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
              onClick={() => updatePage(result.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={result.page >= result.totalPages}
              onClick={() => updatePage(result.totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

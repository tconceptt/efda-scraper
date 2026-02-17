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
import { Badge } from "@/components/ui/badge";
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
import type { ImportRow, PaginatedResult } from "@/lib/queries";
import { formatCurrency, formatDate, typeLabel, shortPort } from "@/lib/format";

interface ImportsTableProps {
  result: PaginatedResult<ImportRow>;
  ports: string[];
}

export function ImportsTable({ result, ports }: ImportsTableProps) {
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
      // Reset to page 1 on filter change unless page is being explicitly set
      if (!("page" in updates)) {
        params.delete("page");
      }
      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition]
  );

  const currentSort = searchParams.get("sort") ?? "id";
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
            placeholder="Search permit #, agent, supplier..."
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
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MDCN">Medicine</SelectItem>
            <SelectItem value="MD">Medical Device</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("port") ?? "all"}
          onValueChange={(v) => updateParams({ port: v === "all" ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Port" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ports</SelectItem>
            {ports.map((p) => (
              <SelectItem key={p} value={p}>
                {shortPort(p)}
              </SelectItem>
            ))}
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
        {isPending && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" />}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {result.data.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No results found.</p>
        ) : (
          result.data.map((row) => (
            <div
              key={row.id}
              className="cursor-pointer rounded-lg border p-3 active:bg-muted/50"
              onClick={() => router.push(`/imports/${row.id}`)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">{row.import_permit_number}</span>
                <Badge
                  variant={row.submodule_type_code === "MDCN" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {typeLabel(row.submodule_type_code)}
                </Badge>
              </div>
              <div className="mt-1.5 truncate text-sm font-medium">{row.agent_name}</div>
              <div className="truncate text-sm text-muted-foreground">{row.supplier_name}</div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="font-mono font-medium">{formatCurrency(row.amount)}</span>
                <span className="text-muted-foreground">{formatDate(row.requested_date)}</span>
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
                onClick={() => toggleSort("import_permit_number")}
              >
                Permit # <SortIcon col="import_permit_number" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("agent_name")}
              >
                Agent <SortIcon col="agent_name" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("supplier_name")}
              >
                Supplier <SortIcon col="supplier_name" />
              </TableHead>
              <TableHead>Port</TableHead>
              <TableHead>Type</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("amount")}
              >
                Amount <SortIcon col="amount" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("requested_date")}
              >
                Date <SortIcon col="requested_date" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/imports/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {row.import_permit_number}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {row.agent_name}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {row.supplier_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {shortPort(row.port_of_entry)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.submodule_type_code === "MDCN"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {typeLabel(row.submodule_type_code)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.requested_date)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(result.page - 1) * result.pageSize + 1}–
          {Math.min(result.page * result.pageSize, result.total)} of{" "}
          {result.total.toLocaleString()}
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
    </div>
  );
}

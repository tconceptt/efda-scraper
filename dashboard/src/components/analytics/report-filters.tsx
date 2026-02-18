"use client";

import { ArrowLeft, GitCompareArrows, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductPicker } from "./product-picker";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = Array.from({ length: 7 }, (_, i) => String(2020 + i));

const QUARTERS = [
  { value: "1", label: "Q1 (Jan–Mar)" },
  { value: "2", label: "Q2 (Apr–Jun)" },
  { value: "3", label: "Q3 (Jul–Sep)" },
  { value: "4", label: "Q4 (Oct–Dec)" },
];

export type CmpPeriodType = "month" | "quarter" | "year";

interface ReportFiltersProps {
  dateFrom: string;
  dateTo: string;
  type: string;
  compare: boolean;
  canCompare: boolean;
  useLookback?: boolean;
  lookback?: string;
  onLookbackChange?: (v: string) => void;
  showMinPriorOrders?: boolean;
  minPriorOrders?: string;
  onMinPriorOrdersChange?: (v: string) => void;
  cmpPeriodType: CmpPeriodType;
  cmpYearA: string;
  cmpMonthA: string;
  cmpQuarterA: string;
  cmpYearB: string;
  cmpMonthB: string;
  cmpQuarterB: string;
  loading: boolean;
  productSlug: string | null;
  productName: string | null;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onCompareToggle: () => void;
  onCmpPeriodTypeChange: (v: CmpPeriodType) => void;
  onCmpYearAChange: (v: string) => void;
  onCmpMonthAChange: (v: string) => void;
  onCmpQuarterAChange: (v: string) => void;
  onCmpYearBChange: (v: string) => void;
  onCmpMonthBChange: (v: string) => void;
  onCmpQuarterBChange: (v: string) => void;
  onProductChange: (slug: string | null, name: string | null) => void;
  onReset: () => void;
  onRun: () => void;
  onBack: () => void;
}

export function ReportFilters({
  dateFrom,
  dateTo,
  type,
  compare,
  canCompare,
  useLookback,
  lookback,
  onLookbackChange,
  showMinPriorOrders,
  minPriorOrders,
  onMinPriorOrdersChange,
  cmpPeriodType,
  cmpYearA,
  cmpMonthA,
  cmpQuarterA,
  cmpYearB,
  cmpMonthB,
  cmpQuarterB,
  loading,
  productSlug,
  productName,
  onDateFromChange,
  onDateToChange,
  onTypeChange,
  onCompareToggle,
  onCmpPeriodTypeChange,
  onCmpYearAChange,
  onCmpMonthAChange,
  onCmpQuarterAChange,
  onCmpYearBChange,
  onCmpMonthBChange,
  onCmpQuarterBChange,
  onProductChange,
  onReset,
  onRun,
  onBack,
}: ReportFiltersProps) {
  const hasActiveFilters =
    dateFrom !== "" ||
    dateTo !== "" ||
    type !== "all" ||
    compare ||
    (useLookback && lookback !== "6") ||
    (showMinPriorOrders && minPriorOrders !== "10");

  return (
    <div className="space-y-4">
      {/* Main filter row */}
      <div className="flex flex-wrap items-end gap-3">
        {useLookback ? (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Lookback Period
              </label>
              <Select value={lookback ?? "6"} onValueChange={onLookbackChange ?? (() => {})}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last Month</SelectItem>
                  <SelectItem value="3">Last 3 Months</SelectItem>
                  <SelectItem value="6">Last 6 Months</SelectItem>
                  <SelectItem value="12">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showMinPriorOrders && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Min Prior Orders
                </label>
                <div className="flex gap-2">
                  <Select
                    value={["10", "50", "100", "500"].includes(minPriorOrders ?? "10") ? (minPriorOrders ?? "10") : "custom"}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        onMinPriorOrdersChange?.(minPriorOrders ?? "10");
                      } else {
                        onMinPriorOrdersChange?.(v);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {!["10", "50", "100", "500"].includes(minPriorOrders ?? "10") && (
                    <Input
                      type="number"
                      min={1}
                      value={minPriorOrders ?? "10"}
                      onChange={(e) => onMinPriorOrdersChange?.(e.target.value)}
                      className="w-[80px]"
                    />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Date To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="w-[150px]"
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <Select value={type} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="MDCN">Medicine</SelectItem>
              <SelectItem value="MD">Medical Device</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onRun} disabled={loading}>
          {loading ? "Loading..." : "Run Report"}
        </Button>
        {canCompare && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCompareToggle}
            className={compare ? "border-primary text-primary" : ""}
          >
            <GitCompareArrows className="size-4" />
            Compare
          </Button>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to Reports
        </Button>
      </div>

      {/* Compare period selectors */}
      {compare && canCompare && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground">
              Period Type
            </label>
            <Select
              value={cmpPeriodType}
              onValueChange={(v) => onCmpPeriodTypeChange(v as CmpPeriodType)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Period A */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Period A
              </span>
              <div className="flex gap-2">
                <Select value={cmpYearA} onValueChange={onCmpYearAChange}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cmpPeriodType === "month" && (
                  <Select value={cmpMonthA} onValueChange={onCmpMonthAChange}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {cmpPeriodType === "quarter" && (
                  <Select value={cmpQuarterA} onValueChange={onCmpQuarterAChange}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {/* Period B */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Period B
              </span>
              <div className="flex gap-2">
                <Select value={cmpYearB} onValueChange={onCmpYearBChange}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cmpPeriodType === "month" && (
                  <Select value={cmpMonthB} onValueChange={onCmpMonthBChange}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {cmpPeriodType === "quarter" && (
                  <Select value={cmpQuarterB} onValueChange={onCmpQuarterBChange}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1 pt-1 border-t border-border/50">
            <label className="text-xs font-medium text-muted-foreground">
              Product (optional)
            </label>
            <ProductPicker
              value={productSlug}
              displayName={productName}
              onSelect={onProductChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

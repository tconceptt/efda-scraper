"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { REPORT_TYPES, REPORT_SLUGS, type ReportType } from "@/app/analytics/report-config";
import { ReportSelector } from "./report-selector";
import { ReportFilters } from "./report-filters";

import { ValueTrends } from "@/components/charts/value-trends";
import { TopAgents } from "@/components/charts/top-agents";
import { TopManufacturers } from "@/components/charts/top-manufacturers";
import { AvgOrderValue } from "@/components/charts/avg-order-value";
import { PriceSpread } from "@/components/charts/price-spread";
import { ProductGrowthChart } from "@/components/charts/product-growth";
import { ProductDeclineChart } from "@/components/charts/product-decline";
import { MarketByCategory } from "@/components/charts/market-by-category";

import { ValueTrendsCompare } from "@/components/charts/compare/value-trends-compare";
import { AvgOrderValueCompare } from "@/components/charts/compare/avg-order-value-compare";
import { TopManufacturersCompare } from "@/components/charts/compare/top-manufacturers-compare";
import { MarketByCategoryCompare } from "@/components/charts/compare/market-by-category-compare";
import { PriceSpreadCompare } from "@/components/charts/compare/price-spread-compare";
import { ProductPriceCompare } from "@/components/charts/compare/product-price-compare";
import { ProductVolumeCompare } from "@/components/charts/compare/product-volume-compare";

import {
  fetchMonthlyByType,
  fetchTopAgents,
  fetchTopManufacturers,
  fetchAvgOrderValue,
  fetchPriceSpreads,
  fetchProductGrowth,
  fetchProductDecline,
  fetchMarketByCategory,
  fetchProductPriceTrend,
  fetchProductMonthlyVolume,
} from "@/app/analytics/actions";

import type { AnalyticsFilters } from "@/lib/queries";
import type { CmpPeriodType } from "./report-filters";

type ActionFn = (filters?: AnalyticsFilters) => Promise<unknown>;

const ACTION_MAP: Record<ReportType, ActionFn> = {
  "value-trends": fetchMonthlyByType,
  "top-agents": fetchTopAgents,
  "top-manufacturers": fetchTopManufacturers,
  "avg-order-value": fetchAvgOrderValue,
  "price-spreads": fetchPriceSpreads,
  "product-growth": fetchProductGrowth,
  "product-decline": fetchProductDecline,
  "market-by-category": fetchMarketByCategory,
};

const LOOKBACK_REPORTS = new Set<ReportType>(["product-growth", "product-decline"]);

const COMPARABLE_REPORTS = new Set<ReportType>([
  "value-trends",
  "top-manufacturers",
  "avg-order-value",
  "price-spreads",
  "market-by-category",
]);

const QUARTER_RANGES: Record<string, { startMonth: string; endMonth: string; endDay: string }> = {
  "1": { startMonth: "01", endMonth: "03", endDay: "31" },
  "2": { startMonth: "04", endMonth: "06", endDay: "30" },
  "3": { startMonth: "07", endMonth: "09", endDay: "30" },
  "4": { startMonth: "10", endMonth: "12", endDay: "31" },
};

function periodToFilters(
  periodType: CmpPeriodType,
  year: string,
  month: string,
  quarter: string,
  type: string
): AnalyticsFilters {
  const filters: AnalyticsFilters = {};
  if (type && type !== "all") filters.type = type;
  if (periodType === "year") {
    filters.dateFrom = `${year}-01-01`;
    filters.dateTo = `${year}-12-31`;
  } else if (periodType === "quarter") {
    const qr = QUARTER_RANGES[quarter] ?? QUARTER_RANGES["1"];
    filters.dateFrom = `${year}-${qr.startMonth}-01`;
    filters.dateTo = `${year}-${qr.endMonth}-${qr.endDay}`;
  } else {
    const m = month.padStart(2, "0");
    const y = parseInt(year);
    const mi = parseInt(m);
    const lastDay = new Date(y, mi, 0).getDate();
    filters.dateFrom = `${year}-${m}-01`;
    filters.dateTo = `${year}-${m}-${String(lastDay).padStart(2, "0")}`;
  }
  return filters;
}

function periodLabel(
  periodType: CmpPeriodType,
  year: string,
  month: string,
  quarter: string
): string {
  if (periodType === "year") return year;
  if (periodType === "quarter") return `Q${quarter} ${year}`;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(month) - 1] ?? month} ${year}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function renderChart(report: ReportType, data: any, lookback?: number) {
  switch (report) {
    case "value-trends":
      return <ValueTrends data={data} />;
    case "top-agents":
      return <TopAgents data={data} />;
    case "top-manufacturers":
      return <TopManufacturers data={data} />;
    case "avg-order-value":
      return <AvgOrderValue data={data} />;
    case "price-spreads":
      return <PriceSpread data={data} />;
    case "product-growth":
      return <ProductGrowthChart data={data} lookback={lookback} />;
    case "product-decline":
      return <ProductDeclineChart data={data} lookback={lookback} />;
    case "market-by-category":
      return <MarketByCategory data={data} />;
  }
}

function renderCompareChart(
  report: ReportType,
  dataA: any,
  dataB: any,
  labelA: string,
  labelB: string
) {
  switch (report) {
    case "value-trends":
      return <ValueTrendsCompare dataA={dataA} dataB={dataB} labelA={labelA} labelB={labelB} />;
    case "top-manufacturers":
      return <TopManufacturersCompare dataA={dataA} dataB={dataB} labelA={labelA} labelB={labelB} />;
    case "avg-order-value":
      return <AvgOrderValueCompare dataA={dataA} dataB={dataB} labelA={labelA} labelB={labelB} />;
    case "price-spreads":
      return <PriceSpreadCompare dataA={dataA} dataB={dataB} labelA={labelA} labelB={labelB} />;
    case "market-by-category":
      return <MarketByCategoryCompare dataA={dataA} dataB={dataB} labelA={labelA} labelB={labelB} />;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function AnalyticsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-synced state
  const reportParam = searchParams.get("report") as ReportType | null;
  const report = reportParam && REPORT_SLUGS.includes(reportParam) ? reportParam : null;

  // Filter state
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "all");
  const [lookback, setLookback] = useState(searchParams.get("lookback") ?? "6");
  const [minPriorOrders, setMinPriorOrders] = useState(searchParams.get("minPriorOrders") ?? "10");

  // Compare state
  const [compare, setCompare] = useState(searchParams.get("compare") === "1");
  const [cmpPeriodType, setCmpPeriodType] = useState<CmpPeriodType>(
    (searchParams.get("cmpPeriodType") as CmpPeriodType) || "month"
  );
  const [cmpYearA, setCmpYearA] = useState(searchParams.get("cmpYearA") ?? "2024");
  const [cmpMonthA, setCmpMonthA] = useState(searchParams.get("cmpMonthA") ?? "01");
  const [cmpQuarterA, setCmpQuarterA] = useState(searchParams.get("cmpQuarterA") ?? "1");
  const [cmpYearB, setCmpYearB] = useState(searchParams.get("cmpYearB") ?? "2023");
  const [cmpMonthB, setCmpMonthB] = useState(searchParams.get("cmpMonthB") ?? "01");
  const [cmpQuarterB, setCmpQuarterB] = useState(searchParams.get("cmpQuarterB") ?? "1");

  // Product compare state
  const [productSlug, setProductSlug] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [productCompareData, setProductCompareData] = useState<{
    priceA: unknown;
    priceB: unknown;
    volumeA: unknown;
    volumeB: unknown;
  } | null>(null);

  // Data state
  const [data, setData] = useState<unknown>(null);
  const [compareDataA, setCompareDataA] = useState<unknown>(null);
  const [compareDataB, setCompareDataB] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      startTransition(() => {
        router.push(`/analytics?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams, startTransition]
  );

  const handleSelectReport = useCallback(
    (slug: ReportType) => {
      updateUrl({ report: slug });
    },
    [updateUrl]
  );

  const resetFilters = useCallback(() => {
    setData(null);
    setCompareDataA(null);
    setCompareDataB(null);
    setProductCompareData(null);
    setDateFrom("");
    setDateTo("");
    setType("all");
    setLookback("6");
    setMinPriorOrders("10");
    setCompare(false);
    setCmpPeriodType("month");
    setCmpYearA("2024");
    setCmpMonthA("01");
    setCmpQuarterA("1");
    setCmpYearB("2023");
    setCmpMonthB("01");
    setCmpQuarterB("1");
    setProductSlug(null);
    setProductName(null);
  }, []);

  const handleBack = useCallback(() => {
    resetFilters();
    router.push("/analytics");
  }, [router, resetFilters]);

  const handleProductChange = useCallback((slug: string | null, name: string | null) => {
    setProductSlug(slug);
    setProductName(name);
    setProductCompareData(null);
  }, []);

  const buildFilters = useCallback((): AnalyticsFilters => {
    const filters: AnalyticsFilters = {};
    if (report && LOOKBACK_REPORTS.has(report)) {
      filters.lookback = parseInt(lookback) || 6;
      filters.minPriorOrders = parseInt(minPriorOrders) || 10;
    } else {
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
    }
    if (type && type !== "all") filters.type = type;
    return filters;
  }, [report, lookback, minPriorOrders, dateFrom, dateTo, type]);

  const runReport = useCallback(async () => {
    if (!report) return;
    setLoading(true);
    try {
      if (compare) {
        const filtersA = periodToFilters(cmpPeriodType, cmpYearA, cmpMonthA, cmpQuarterA, type);
        const filtersB = periodToFilters(cmpPeriodType, cmpYearB, cmpMonthB, cmpQuarterB, type);

        if (productSlug) {
          // Product-level comparison
          const [priceA, priceB, volumeA, volumeB] = await Promise.all([
            fetchProductPriceTrend(productSlug, filtersA),
            fetchProductPriceTrend(productSlug, filtersB),
            fetchProductMonthlyVolume(productSlug, filtersA),
            fetchProductMonthlyVolume(productSlug, filtersB),
          ]);
          setProductCompareData({ priceA, priceB, volumeA, volumeB });
          setCompareDataA(null);
          setCompareDataB(null);
          setData(null);
        } else {
          // Report-level comparison
          const action = ACTION_MAP[report];
          const [resultA, resultB] = await Promise.all([
            action(filtersA),
            action(filtersB),
          ]);
          setCompareDataA(resultA);
          setCompareDataB(resultB);
          setProductCompareData(null);
          setData(null);
        }
      } else {
        const action = ACTION_MAP[report];
        const result = await action(buildFilters());
        setData(result);
        setCompareDataA(null);
        setCompareDataB(null);
        setProductCompareData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [report, compare, buildFilters, cmpPeriodType, cmpYearA, cmpMonthA, cmpQuarterA, cmpYearB, cmpMonthB, cmpQuarterB, type, productSlug]);

  // Auto-fetch clean data whenever the report changes
  useEffect(() => {
    if (!report) return;
    // Always start a fresh report with no filters / no compare
    setCompare(false);
    setProductSlug(null);
    setProductName(null);
    setCompareDataA(null);
    setCompareDataB(null);
    setProductCompareData(null);
    setLookback("6");
    setLoading(true);
    const defaultFilters: AnalyticsFilters = LOOKBACK_REPORTS.has(report) ? { lookback: 6, minPriorOrders: 10 } : {};
    ACTION_MAP[report](defaultFilters).then((result) => {
      setData(result);
    }).finally(() => {
      setLoading(false);
    });
    // Only run when the selected report changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  // No report selected — show selector grid
  if (!report) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div>
          <h2 className="text-lg font-semibold">Select a Report</h2>
          <p className="text-sm text-muted-foreground">
            Choose a report type to view, filter, and compare analytics data.
          </p>
        </div>
        <ReportSelector onSelect={handleSelectReport} />
      </div>
    );
  }

  const config = REPORT_TYPES[report];
  const labelA = periodLabel(cmpPeriodType, cmpYearA, cmpMonthA, cmpQuarterA);
  const labelB = periodLabel(cmpPeriodType, cmpYearB, cmpMonthB, cmpQuarterB);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-semibold">{config.label}</h2>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </div>

      <ReportFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        type={type}
        compare={compare}
        canCompare={COMPARABLE_REPORTS.has(report)}
        useLookback={LOOKBACK_REPORTS.has(report)}
        lookback={lookback}
        onLookbackChange={setLookback}
        showMinPriorOrders={report === "product-decline"}
        minPriorOrders={minPriorOrders}
        onMinPriorOrdersChange={setMinPriorOrders}
        cmpPeriodType={cmpPeriodType}
        cmpYearA={cmpYearA}
        cmpMonthA={cmpMonthA}
        cmpQuarterA={cmpQuarterA}
        cmpYearB={cmpYearB}
        cmpMonthB={cmpMonthB}
        cmpQuarterB={cmpQuarterB}
        loading={loading || isPending}
        productSlug={productSlug}
        productName={productName}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onTypeChange={setType}
        onCompareToggle={() => setCompare((v) => !v)}
        onCmpPeriodTypeChange={setCmpPeriodType}
        onCmpYearAChange={setCmpYearA}
        onCmpMonthAChange={setCmpMonthA}
        onCmpQuarterAChange={setCmpQuarterA}
        onCmpYearBChange={setCmpYearB}
        onCmpMonthBChange={setCmpMonthB}
        onCmpQuarterBChange={setCmpQuarterB}
        onProductChange={handleProductChange}
        onReset={resetFilters}
        onRun={runReport}
        onBack={handleBack}
      />

      {/* Chart area */}
      {loading ? (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          Loading report data...
        </div>
      ) : !compare && data ? (
        renderChart(report, data, parseInt(lookback) || 6)
      ) : compare && productCompareData ? (
        <div className="space-y-6">
          <ProductPriceCompare
            dataA={productCompareData.priceA as never}
            dataB={productCompareData.priceB as never}
            labelA={labelA}
            labelB={labelB}
            productName={productName ?? undefined}
          />
          <ProductVolumeCompare
            dataA={productCompareData.volumeA as never}
            dataB={productCompareData.volumeB as never}
            labelA={labelA}
            labelB={labelB}
            productName={productName ?? undefined}
          />
        </div>
      ) : compare && compareDataA && compareDataB ? (
        renderCompareChart(report, compareDataA, compareDataB, labelA, labelB)
      ) : (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          Configure filters and click &quot;Run Report&quot; to view data.
        </div>
      )}
    </div>
  );
}

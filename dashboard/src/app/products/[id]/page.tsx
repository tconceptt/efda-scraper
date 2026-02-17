import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, ShoppingCart, DollarSign, TrendingUp, TrendingDown, Users, Tag, Building } from "lucide-react";
import { MobileNav } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getProductBySlug,
  getProductStatsBySlug,
  getProductPriceTrendBySlug,
  getProductMonthlySupplierBySlug,
  getProductSupplierPricesBySlug,
  getProductTopImportersBySlug,
  getProductOrderHistoryBySlug,
} from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PriceOverTime } from "@/components/charts/price-over-time";
import { MonthlySupplierChart } from "@/components/charts/monthly-supplier-chart";
import { SupplierPricesTable } from "@/components/tables/supplier-prices-table";
import { TopImportersTable } from "@/components/tables/top-importers-table";
import { ProductOrderHistory } from "@/components/tables/product-order-history";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historyPage?: string }>;
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { id: slug } = await params;
  const { historyPage } = await searchParams;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const orderHistoryPage = Math.max(1, parseInt(historyPage ?? "1", 10) || 1);
  const [stats, priceTrend, monthlySupplier, supplierPrices, topImporters, orderHistory] =
    await Promise.all([
      getProductStatsBySlug(slug),
      getProductPriceTrendBySlug(slug),
      getProductMonthlySupplierBySlug(slug),
      getProductSupplierPricesBySlug(slug),
      getProductTopImportersBySlug(slug, 10),
      getProductOrderHistoryBySlug(slug, orderHistoryPage, 15),
    ]);

  const brandList = product.brand_names
    ? product.brand_names.split(",").filter((b) => b && b !== "-")
    : [];

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 px-4 py-4 lg:px-6">
        <div className="flex items-start gap-2 sm:gap-4">
          <MobileNav />
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
              {product.generic_name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {product.dosage_form && (
                <Badge variant="outline" className="font-normal">
                  {product.dosage_form}
                </Badge>
              )}
              {product.dosage_strength && (
                <Badge variant="outline" className="font-normal">
                  {product.dosage_strength}{product.dosage_unit ? ` ${product.dosage_unit}` : ""}
                </Badge>
              )}
              {brandList.length > 0 && (
                <span className="text-xs">
                  Brands: {brandList.slice(0, 5).join(", ")}
                  {brandList.length > 5 && ` +${brandList.length - 5} more`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Orders</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatNumber(stats.totalOrders)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Qty</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatNumber(stats.totalQuantity)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Value</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(stats.totalValue, true)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Price</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(stats.avgUnitPrice)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Price Range</span>
              </div>
              <p className="mt-2 text-sm font-bold sm:text-lg">
                {stats.minUnitPrice > 0
                  ? `${formatCurrency(stats.minUnitPrice)} – ${formatCurrency(stats.maxUnitPrice)}`
                  : "\u2014"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Brands</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatNumber(stats.uniqueBrands)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Suppliers</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatNumber(stats.uniqueSuppliers)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Importers</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatNumber(stats.uniqueImporters)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Price Over Time — full width */}
        <PriceOverTime data={priceTrend} />

        {/* Monthly Volume by Supplier — full width */}
        <MonthlySupplierChart data={monthlySupplier} />

        {/* Supplier Comparison */}
        <SupplierPricesTable data={supplierPrices} />

        {/* Top Importers */}
        <TopImportersTable data={topImporters} />

        {/* Order History — full width */}
        <ProductOrderHistory result={orderHistory} />
      </div>
    </div>
  );
}

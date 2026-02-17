import { Header } from "@/components/layout/header";
import { ValueTrends } from "@/components/charts/value-trends";
import { TopAgents } from "@/components/charts/top-agents";
import { TopManufacturers } from "@/components/charts/top-manufacturers";
import { AvgOrderValue } from "@/components/charts/avg-order-value";
import { PriceSpread } from "@/components/charts/price-spread";
import { ProductGrowthChart } from "@/components/charts/product-growth";
import { MarketByCategory } from "@/components/charts/market-by-category";
import {
  getMonthlyByType,
  getTopAgents,
  getTopManufacturers,
  getAvgOrderValueTrend,
  getTopProductPriceSpreads,
  getProductVolumeGrowth,
  getDosageFormMarketShare,
} from "@/lib/queries";

export const revalidate = 300;

export default async function AnalyticsPage() {
  const [
    monthlyByType,
    topAgents,
    topManufacturers,
    avgOrderValue,
    priceSpreads,
    productGrowth,
    dosageFormMarket,
  ] = await Promise.all([
    getMonthlyByType(),
    getTopAgents(20),
    getTopManufacturers(10),
    getAvgOrderValueTrend(),
    getTopProductPriceSpreads(15),
    getProductVolumeGrowth(15),
    getDosageFormMarketShare(),
  ]);

  return (
    <>
      <Header title="Analytics" />
      <div className="space-y-6 p-4 lg:p-6">
        <ValueTrends data={monthlyByType} />
        <div className="grid gap-6 lg:grid-cols-2">
          <AvgOrderValue data={avgOrderValue} />
          <MarketByCategory data={dosageFormMarket} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <PriceSpread data={priceSpreads} />
          <ProductGrowthChart data={productGrowth} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TopManufacturers data={topManufacturers} />
          <TopAgents data={topAgents} />
        </div>
      </div>
    </>
  );
}

import { Header } from "@/components/layout/header";
import { ValueTrends } from "@/components/charts/value-trends";
import { TopAgents } from "@/components/charts/top-agents";
import { TopManufacturers } from "@/components/charts/top-manufacturers";
import { AvgOrderValue } from "@/components/charts/avg-order-value";
import {
  getMonthlyByType,
  getTopAgents,
  getTopManufacturers,
  getAvgOrderValueTrend,
} from "@/lib/queries";

export const revalidate = 300;

export default async function AnalyticsPage() {
  const [monthlyByType, topAgents, topManufacturers, avgOrderValue] = await Promise.all([
    getMonthlyByType(),
    getTopAgents(20),
    getTopManufacturers(10),
    getAvgOrderValueTrend(),
  ]);

  return (
    <>
      <Header title="Analytics" />
      <div className="space-y-6 p-4 lg:p-6">
        <ValueTrends data={monthlyByType} />
        <div className="grid gap-6 lg:grid-cols-2">
          <AvgOrderValue data={avgOrderValue} />
          <TopManufacturers data={topManufacturers} />
        </div>
        <TopAgents data={topAgents} />
      </div>
    </>
  );
}

import { Header } from "@/components/layout/header";
import { KpiCards } from "@/components/kpi-cards";
import { ImportsOverTime } from "@/components/charts/imports-over-time";
import { TopSuppliers } from "@/components/charts/top-suppliers";
import { PortDistribution } from "@/components/charts/port-distribution";
import { TypeBreakdown } from "@/components/charts/type-breakdown";
import { RecentImports } from "@/components/tables/recent-imports";
import {
  getOverviewStats,
  getImportsOverTime,
  getTopSuppliers,
  getPortDistribution,
  getTypeBreakdown,
  getRecentImports,
} from "@/lib/queries";

export const revalidate = 300;

export default async function OverviewPage() {
  const [stats, monthly, topSuppliers, ports, types, recent] = await Promise.all([
    getOverviewStats(),
    getImportsOverTime(),
    getTopSuppliers(10),
    getPortDistribution(),
    getTypeBreakdown(),
    getRecentImports(10),
  ]);

  return (
    <>
      <Header title="Overview" />
      <div className="space-y-6 p-4 lg:p-6">
        <KpiCards stats={stats} />
        <div className="grid gap-6 lg:grid-cols-2">
          <ImportsOverTime data={monthly} />
          <TopSuppliers data={topSuppliers} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <PortDistribution data={ports} />
          <TypeBreakdown data={types} />
        </div>
        <RecentImports data={recent} />
      </div>
    </>
  );
}

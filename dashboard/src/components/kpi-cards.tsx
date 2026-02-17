import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, Users, Package } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { OverviewStats } from "@/lib/queries";

const cards = [
  {
    key: "totalImports" as const,
    title: "Total Imports",
    icon: FileText,
    format: (v: number) => formatNumber(v),
  },
  {
    key: "totalValue" as const,
    title: "Total Value",
    icon: DollarSign,
    format: (v: number) => formatCurrency(v, true),
  },
  {
    key: "uniqueSuppliers" as const,
    title: "Unique Suppliers",
    icon: Users,
    format: (v: number) => formatNumber(v),
  },
  {
    key: "totalProducts" as const,
    title: "Products Scraped",
    icon: Package,
    format: (v: number) => formatNumber(v),
  },
];

export function KpiCards({ stats }: { stats: OverviewStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.title}
            </CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{c.format(stats[c.key])}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

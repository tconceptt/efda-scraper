import {
  TrendingUp,
  TrendingDown,
  Users,
  Factory,
  DollarSign,
  ArrowLeftRight,
  Sprout,
  PieChart,
  type LucideIcon,
} from "lucide-react";

export const REPORT_TYPES = {
  "value-trends": {
    label: "Value Trends",
    description: "Monthly import value breakdown by medicine vs medical devices",
    icon: TrendingUp,
  },
  "top-agents": {
    label: "Top Importers",
    description: "Highest-value importing agents ranked by total order value",
    icon: Users,
  },
  "top-manufacturers": {
    label: "Top Manufacturers",
    description: "Leading manufacturers by product count across import orders",
    icon: Factory,
  },
  "avg-order-value": {
    label: "Avg Order Value",
    description: "Average import order value trend over time",
    icon: DollarSign,
  },
  "price-spreads": {
    label: "Price Variation",
    description: "Products with the widest price spreads — negotiation opportunities",
    icon: ArrowLeftRight,
  },
  "product-growth": {
    label: "Product Growth",
    description: "Fastest growing products by import order volume",
    icon: Sprout,
  },
  "product-decline": {
    label: "Declining Products",
    description: "Products losing import demand — declining order volume",
    icon: TrendingDown,
  },
  "market-by-category": {
    label: "Market by Category",
    description: "Import market structure broken down by dosage form",
    icon: PieChart,
  },
} as const satisfies Record<string, { label: string; description: string; icon: LucideIcon }>;

export type ReportType = keyof typeof REPORT_TYPES;

export const REPORT_SLUGS = Object.keys(REPORT_TYPES) as ReportType[];

import { Header } from "@/components/layout/header";
import { PriceVarianceTable } from "@/components/tables/price-variance-table";
import { getPaginatedPriceSpreads } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    type?: string;
  }>;
}

export default async function PriceVariancePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const type = params.type || undefined;

  const result = await getPaginatedPriceSpreads(page, 25, type);

  return (
    <>
      <Header title="Price Variance" />
      <div className="p-4 lg:p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Top 100 products with the widest price spreads across import orders.
          Higher spread indicates more room to negotiate.
        </p>
        <PriceVarianceTable result={result} />
      </div>
    </>
  );
}

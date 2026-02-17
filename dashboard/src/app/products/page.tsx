import { Header } from "@/components/layout/header";
import { ProductsTable } from "@/components/tables/products-table";
import { getAggregatedProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    sort?: string;
    dir?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sortBy = params.sort ?? "order_count";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const result = await getAggregatedProducts(
    page,
    25,
    { search: params.search, type: params.type, dateFrom: params.dateFrom, dateTo: params.dateTo },
    sortBy,
    sortDir
  );

  return (
    <>
      <Header title="Products" />
      <div className="p-4 lg:p-6">
        <ProductsTable result={result} />
      </div>
    </>
  );
}

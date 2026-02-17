import { Header } from "@/components/layout/header";
import { ImportsTable } from "@/components/tables/imports-table";
import { getImports, getPorts } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    type?: string;
    port?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function ImportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sortBy = params.sort ?? "id";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const [result, ports] = await Promise.all([
    getImports(page, 25, {
      search: params.search,
      type: params.type,
      port: params.port,
    }, sortBy, sortDir),
    getPorts(),
  ]);

  return (
    <>
      <Header title="Import Permits" />
      <div className="p-4 lg:p-6">
        <ImportsTable result={result} ports={ports} />
      </div>
    </>
  );
}

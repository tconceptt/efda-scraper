import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductImporterStat } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

export function TopImportersTable({
  data,
}: {
  data: ProductImporterStat[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Importers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No importer data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Importers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Importer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.agent_name}>
                  <TableCell className="max-w-[280px] truncate font-medium">
                    {row.agent_name}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.order_count)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.total_quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.total_spend)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

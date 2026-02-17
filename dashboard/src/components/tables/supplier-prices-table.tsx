import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductSupplierPrice } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/format";

export function SupplierPricesTable({
  data,
}: {
  data: ProductSupplierPrice[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supplier Price Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No supplier data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supplier Price Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Avg Unit Price</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.supplier_name}>
                  <TableCell className="max-w-[280px] truncate font-medium">
                    {row.supplier_name}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.avg_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.order_count)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.total_value)}
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

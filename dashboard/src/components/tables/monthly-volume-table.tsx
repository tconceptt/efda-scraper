import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductMonthlyVolume } from "@/lib/queries";
import { formatNumber, formatMonth } from "@/lib/format";

export function MonthlyVolumeTable({
  data,
}: {
  data: ProductMonthlyVolume[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Order Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No volume data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show newest months first
  const sorted = [...data].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Order Volume</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">
                    {formatMonth(row.month)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.order_count)}
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

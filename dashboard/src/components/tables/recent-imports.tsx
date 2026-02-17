import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportRow } from "@/lib/queries";
import { formatCurrency, formatDate, typeLabel } from "@/lib/format";

export function RecentImports({ data }: { data: ImportRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Imports</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permit #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  {row.import_permit_number}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {row.supplier_name}
                </TableCell>
                <TableCell>
                  <Badge variant={row.submodule_type_code === "MDCN" ? "default" : "secondary"}>
                    {typeLabel(row.submodule_type_code)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(row.amount)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(row.requested_date)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

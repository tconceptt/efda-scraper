"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface Product {
  id: number;
  generic_name: string;
  product_name: string;
  brand_name: string;
  manufacturer_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  dosage_form: string | null;
  dosage_strength: string | null;
  dosage_unit: string | null;
  slug: string | null;
}

export function ImportProductsTable({ products }: { products: Product[] }) {
  const router = useRouter();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Manufacturer</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow
              key={p.id}
              className={p.slug ? "cursor-pointer hover:bg-muted/50" : ""}
              onClick={p.slug ? () => router.push(`/products/${p.slug}`) : undefined}
            >
              <TableCell>
                <div>
                  <p className="font-medium">{p.generic_name || p.product_name}</p>
                  {p.dosage_form && (
                    <p className="text-xs text-muted-foreground">
                      {p.dosage_form}
                      {p.dosage_strength ? ` ${p.dosage_strength}` : ""}
                      {p.dosage_unit ? ` ${p.dosage_unit}` : ""}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm">{p.brand_name || "—"}</TableCell>
              <TableCell className="text-sm max-w-[160px] truncate">
                {p.manufacturer_name || "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {p.quantity?.toLocaleString() ?? "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {p.unit_price ? formatCurrency(p.unit_price) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(p.amount)}
              </TableCell>
              <TableCell>
                {p.slug && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

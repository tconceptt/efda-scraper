import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ship,
  Plane,
  FileText,
  Building,
  MapPin,
  DollarSign,
  Calendar,
  Package,
  CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MobileNav } from "@/components/layout/sidebar";
import { ImportProductsTable } from "@/components/tables/import-products-table";
import { getImportById, getImportProducts, makeProductSlug } from "@/lib/queries";
import { formatCurrency, formatDate, typeLabel, shortPort } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ImportDetailPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) notFound();

  const permit = await getImportById(id);
  if (!permit) notFound();

  const products = await getImportProducts(id);

  const statusColor =
    permit.status_code === "APR"
      ? "default"
      : permit.status_code === "REJ"
        ? "destructive"
        : "secondary";

  const ShippingIcon = permit.shipping_method?.toLowerCase().includes("air")
    ? Plane
    : Ship;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 px-4 py-5 lg:px-6">
        <div className="flex items-start gap-2 sm:gap-4">
          <MobileNav />
          <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
            <Link href="/imports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl font-mono">
                  {permit.import_permit_number}
                </h1>
                <Badge variant={statusColor}>{permit.status}</Badge>
                <Badge
                  variant={permit.submodule_type_code === "MDCN" ? "default" : "secondary"}
                >
                  {typeLabel(permit.submodule_type_code)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {permit.agent_name} &mdash; {formatDate(permit.requested_date)}
              </p>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground text-base">{formatCurrency(permit.amount)}</span>
                <span>{permit.currency ?? "USD"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShippingIcon className="h-3.5 w-3.5" />
                {shortPort(permit.port_of_entry)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                {products.length} product{products.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6">
        {/* Details Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Parties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                  <Building className="h-3.5 w-3.5" />
                </span>
                Parties
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Agent / Importer</p>
                <p className="font-medium">{permit.agent_name}</p>
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Supplier</p>
                <p className="font-medium">{permit.supplier_name}</p>
              </div>
            </CardContent>
          </Card>

          {/* Shipment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                  <ShippingIcon className="h-3.5 w-3.5" />
                </span>
                Shipment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Port of Entry</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {shortPort(permit.port_of_entry)}
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Shipping Method</p>
                  <p className="font-medium">{permit.shipping_method ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Delivery</p>
                  <p className="font-medium">{permit.delivery ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card className="border-l-2 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                </span>
                Financial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Total Amount</p>
                  <p className="font-bold text-xl tabular-nums">{formatCurrency(permit.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Freight Cost</p>
                  <p className="font-medium">
                    {permit.freight_cost ? formatCurrency(permit.freight_cost) : "—"}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Currency</p>
                  <p className="font-medium">{permit.currency ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Payment Mode</p>
                  <p className="font-medium">{permit.payment_mode ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
                Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Requested</p>
                  <p className="font-medium">{formatDate(permit.requested_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Submission</p>
                  <p className="font-medium">{formatDate(permit.submission_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Decision</p>
                  <p className="font-medium">{formatDate(permit.decision_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Expiry</p>
                  <p className="font-medium">{formatDate(permit.expiry_date)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reference */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Application ID</p>
                  <p className="font-mono text-xs">{permit.application_id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Proforma Invoice</p>
                  <p className="font-mono text-xs">
                    {permit.performa_invoice_number ?? "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Remark */}
          {permit.remark && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                    <CreditCard className="h-3.5 w-3.5" />
                  </span>
                  Remark
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{permit.remark}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Products */}
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
              <Package className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold">Products</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {products.length}
            </span>
          </div>

          {products.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No products found for this import permit.
              </CardContent>
            </Card>
          ) : (
            <ImportProductsTable
              products={products.map((p) => ({
                id: p.id,
                generic_name: p.generic_name,
                product_name: p.product_name,
                brand_name: p.brand_name,
                manufacturer_name: p.manufacturer_name,
                quantity: p.quantity,
                unit_price: p.unit_price,
                amount: p.amount,
                dosage_form: p.dosage_form,
                dosage_strength: p.dosage_strength,
                dosage_unit: p.dosage_unit,
                slug: p.generic_name
                  ? makeProductSlug(p.generic_name, p.dosage_form, p.dosage_strength)
                  : null,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

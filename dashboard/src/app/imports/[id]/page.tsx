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
      <div className="border-b bg-background/95 px-4 py-4 lg:px-6">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href="/imports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight lg:text-2xl font-mono">
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
        </div>
      </div>

      <div className="p-4 lg:p-6 space-y-6">
        {/* Details Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Parties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building className="h-4 w-4" /> Parties
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Agent / Importer</p>
                <p className="font-medium">{permit.agent_name}</p>
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground text-xs">Supplier</p>
                <p className="font-medium">{permit.supplier_name}</p>
              </div>
            </CardContent>
          </Card>

          {/* Shipment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShippingIcon className="h-4 w-4" /> Shipment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Port of Entry</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {shortPort(permit.port_of_entry)}
                </p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Shipping Method</p>
                  <p className="font-medium">{permit.shipping_method ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Delivery</p>
                  <p className="font-medium">{permit.delivery ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Financial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Total Amount</p>
                  <p className="font-bold text-lg">{formatCurrency(permit.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Freight Cost</p>
                  <p className="font-medium">
                    {permit.freight_cost ? formatCurrency(permit.freight_cost) : "—"}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Currency</p>
                  <p className="font-medium">{permit.currency ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Payment Mode</p>
                  <p className="font-medium">{permit.payment_mode ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Requested</p>
                  <p className="font-medium">{formatDate(permit.requested_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Submission</p>
                  <p className="font-medium">{formatDate(permit.submission_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Decision</p>
                  <p className="font-medium">{formatDate(permit.decision_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Expiry</p>
                  <p className="font-medium">{formatDate(permit.expiry_date)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reference */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Application ID</p>
                  <p className="font-mono text-xs">{permit.application_id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Proforma Invoice</p>
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
                  <CreditCard className="h-4 w-4" /> Remark
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
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Products ({products.length})
          </h2>

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

import { goBack } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Receipt, Package, Clock, Download, FileText, CheckCircle2, AlertCircle, Ban } from "lucide-react";
import { format, isSameMonth, startOfMonth, parseISO } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { useToast } from "@/hooks/use-toast";

type AwaitingJob = {
  id: string;
  jobNumber: number;
  description: string | null;
  dispatchDate: string | null;
  totalQuantity: number;
  lineItems: Array<{
    jobType: string;
    description: string | null;
    quantity: number;
    stitchCount: number;
  }>;
};

type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber: string;
  Date: string;
  DueDate: string;
  Status: string;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  Reference: string;
  CurrencyCode: string;
};

type InvoicesResponse = {
  awaitingInvoice: AwaitingJob[];
  xeroInvoices: XeroInvoice[];
  xeroConnected: boolean;
};

function parseXeroDate(raw: string): Date | null {
  if (!raw) return null;
  // Handle /Date(1234567890000+0000)/ format
  const msMatch = raw.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (msMatch) return new Date(parseInt(msMatch[1]));
  try {
    return parseISO(raw);
  } catch {
    return null;
  }
}

function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PAID":
      return (
        <Badge variant="outline" className="text-xs gap-1 text-green-700 dark:text-green-400 border-green-300">
          <CheckCircle2 className="h-3 w-3" />Paid
        </Badge>
      );
    case "AUTHORISED":
      return (
        <Badge variant="outline" className="text-xs gap-1 text-blue-700 dark:text-blue-400 border-blue-300">
          <FileText className="h-3 w-3" />Issued
        </Badge>
      );
    case "DRAFT":
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <AlertCircle className="h-3 w-3" />Draft
        </Badge>
      );
    case "VOIDED":
      return (
        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
          <Ban className="h-3 w-3" />Voided
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function groupXeroByMonth(invoices: XeroInvoice[]): { label: string; date: Date; invoices: XeroInvoice[] }[] {
  const groups: { label: string; date: Date; invoices: XeroInvoice[] }[] = [];
  for (const inv of invoices) {
    const d = parseXeroDate(inv.Date);
    if (!d) continue;
    const existing = groups.find(g => isSameMonth(g.date, d));
    if (existing) {
      existing.invoices.push(inv);
    } else {
      groups.push({ date: startOfMonth(d), label: format(d, "MMMM yyyy"), invoices: [inv] });
    }
  }
  return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function XeroInvoiceCard({ invoice }: { invoice: XeroInvoice }) {
  const { toast } = useToast();
  const invoiceDate = parseXeroDate(invoice.Date);
  const dueDate = parseXeroDate(invoice.DueDate);
  const isPaid = invoice.Status === "PAID";

  async function handleDownload() {
    try {
      const res = await fetch(`/api/customer-portal/invoices/${invoice.InvoiceID}/pdf`);
      if (!res.ok) throw new Error("Failed to download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.InvoiceNumber || "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not download the invoice PDF.", variant: "destructive" });
    }
  }

  return (
    <Card data-testid={`card-xero-invoice-${invoice.InvoiceID}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm">
              {invoice.InvoiceNumber || "Draft"}
            </span>
            {invoice.Reference && (
              <span className="text-xs text-muted-foreground">— {invoice.Reference}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={invoice.Status} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              data-testid={`button-download-invoice-${invoice.InvoiceID}`}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap text-sm border-t pt-3">
          <div className="flex gap-6 flex-wrap text-muted-foreground text-xs">
            {invoiceDate && (
              <span>Issued {format(invoiceDate, "d MMM yyyy")}</span>
            )}
            {dueDate && !isPaid && (
              <span>Due {format(dueDate, "d MMM yyyy")}</span>
            )}
          </div>
          <div className="text-right">
            <p className="font-semibold text-base">{formatCurrency(invoice.Total, invoice.CurrencyCode || "GBP")}</p>
            {!isPaid && invoice.AmountDue > 0 && invoice.AmountDue !== invoice.Total && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(invoice.AmountDue, invoice.CurrencyCode || "GBP")} outstanding
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AwaitingCard({ job }: { job: AwaitingJob }) {
  return (
    <Card data-testid={`card-awaiting-${job.id}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold text-sm">Job #{job.jobNumber}</span>
            {job.description && (
              <span className="text-sm text-muted-foreground">— {job.description}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {job.totalQuantity} item{job.totalQuantity !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              Invoice pending
            </Badge>
          </div>
        </div>

        {job.lineItems.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            {job.lineItems.map((li, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {li.jobType}
                  {li.description ? ` — ${li.description}` : ""}
                  {li.stitchCount > 0 ? ` (${li.stitchCount.toLocaleString()} stitches)` : ""}
                </span>
                <span className="font-medium text-foreground ml-4">qty {li.quantity}</span>
              </div>
            ))}
          </div>
        )}

        {job.dispatchDate && (
          <p className="text-xs text-muted-foreground">
            Dispatched {format(new Date(job.dispatchDate), "d MMM yyyy")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerInvoices() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ["/api/customer-portal/invoices"],
  });

  const awaitingInvoice = data?.awaitingInvoice ?? [];
  const xeroInvoices = data?.xeroInvoices ?? [];
  const xeroConnected = data?.xeroConnected ?? true; // default true to avoid false warning while loading
  const groups = groupXeroByMonth(xeroInvoices);
  const hasAny = awaitingInvoice.length > 0 || xeroInvoices.length > 0;

  return (
    <div style={{ minHeight: "100dvh" }} className="bg-background flex flex-col">
      <ImpersonationBanner />

      <div className="container mx-auto px-4 py-6 max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => goBack("/customer/dashboard", setLocation)} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Invoice History</h1>
            <p className="text-sm text-muted-foreground">Your invoices from Select Branding Solutions</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground text-center">
            <Receipt className="h-10 w-10 opacity-30" />
            {!xeroConnected ? (
              <>
                <p className="text-sm font-medium">Invoice history temporarily unavailable</p>
                <p className="text-xs max-w-xs">Our invoicing system is reconnecting. Please check back shortly, or contact us if this persists.</p>
              </>
            ) : (
              <p className="text-sm">No invoices yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Jobs completed but not yet invoiced */}
            {awaitingInvoice.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Awaiting Invoice</h2>
                <div className="space-y-3">
                  {awaitingInvoice.map(job => <AwaitingCard key={job.id} job={job} />)}
                </div>
              </div>
            )}

            {/* Real Xero invoices grouped by month */}
            {groups.map(group => (
              <div key={group.label}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">{group.label}</h2>
                <div className="space-y-3">
                  {group.invoices.map(inv => <XeroInvoiceCard key={inv.InvoiceID} invoice={inv} />)}
                </div>
              </div>
            ))}

            {/* If Xero not connected but there are ready jobs, no history message */}
            {xeroInvoices.length === 0 && awaitingInvoice.length > 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Past invoices will appear here once they are issued.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Receipt, Package } from "lucide-react";
import { format, startOfMonth, isSameMonth } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

type InvoiceJob = {
  id: string;
  jobNumber: number;
  description: string | null;
  invoicedAt: string;
  dispatchDate: string | null;
  totalQuantity: number;
  lineItems: Array<{
    jobType: string;
    description: string | null;
    quantity: number;
    stitchCount: number;
  }>;
};

function groupByMonth(jobs: InvoiceJob[]): { label: string; jobs: InvoiceJob[] }[] {
  const groups: { date: Date; label: string; jobs: InvoiceJob[] }[] = [];
  for (const job of jobs) {
    const d = new Date(job.invoicedAt);
    const existing = groups.find(g => isSameMonth(g.date, d));
    if (existing) {
      existing.jobs.push(job);
    } else {
      groups.push({ date: startOfMonth(d), label: format(d, "MMMM yyyy"), jobs: [job] });
    }
  }
  return groups;
}

export default function CustomerInvoices() {
  const [, setLocation] = useLocation();

  const { data: invoices = [], isLoading } = useQuery<InvoiceJob[]>({
    queryKey: ["/api/customer-portal/invoices"],
  });

  const groups = groupByMonth(invoices);

  return (
    <div style={{ minHeight: "100dvh" }} className="bg-background flex flex-col">
      <ImpersonationBanner />

      <div className="container mx-auto px-4 py-6 max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/dashboard")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Invoice History</h1>
            <p className="text-sm text-muted-foreground">A record of your completed and invoiced orders</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="text-sm">No invoiced orders yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.label}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">{group.label}</h2>
                <div className="space-y-3">
                  {group.jobs.map(job => (
                    <Card key={job.id} data-testid={`card-invoice-${job.id}`}>
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
                            <Badge variant="secondary" className="text-xs">
                              Invoiced {format(new Date(job.invoicedAt), "d MMM")}
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
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

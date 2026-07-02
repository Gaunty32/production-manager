import { goBack } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  ArrowLeft,
  Package,
} from "lucide-react";
import { format } from "date-fns";

type SampleFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
};

type Sample = {
  id: string;
  title: string;
  description: string | null;
  status: "pending_approval" | "amends_required" | "approved";
  customerNotes: string | null;
  createdAt: string;
  updatedAt: string;
  files: SampleFile[];
};

type CustomerUser = {
  email: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

const STATUS_CONFIG = {
  pending_approval: {
    label: "Awaiting Your Approval",
    color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
    icon: Clock,
  },
  amends_required: {
    label: "Amends Requested",
    color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
    icon: AlertCircle,
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
    icon: CheckCircle,
  },
};

export default function CustomerSamples() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();
  const [amendsDialogSampleId, setAmendsDialogSampleId] = useState<string | null>(null);
  const [amendsNotes, setAmendsNotes] = useState("");

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: samples = [], isLoading } = useQuery<Sample[]>({
    queryKey: ["/api/customer-portal/samples"],
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (sampleId: string) => {
      const res = await apiRequest("POST", `/api/customer-portal/samples/${sampleId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/samples"] });
      toast({ title: "Sample approved", description: "We will proceed with your order" });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const amendsMutation = useMutation({
    mutationFn: async ({ sampleId, notes }: { sampleId: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/customer-portal/samples/${sampleId}/amends`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/samples"] });
      toast({ title: "Amends submitted", description: "We will review your feedback and get back to you" });
      setAmendsDialogSampleId(null);
      setAmendsNotes("");
    },
    onError: () => toast({ title: "Failed to submit amends", variant: "destructive" }),
  });

  const pending = samples.filter(s => s.status === "pending_approval");
  const amends = samples.filter(s => s.status === "amends_required");
  const approved = samples.filter(s => s.status === "approved");

  const amendsDialogSample = samples.find(s => s.id === amendsDialogSampleId);

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && customerUser && (
        <ImpersonationBanner customerEmail={customerUser.email} />
      )}

      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          {customerUser?.customerLogoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={customerUser.customerLogoUrl}
                alt={customerUser.customerName || "Customer logo"}
                className="max-h-16 max-w-[200px] object-contain"
              />
            </div>
          )}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => goBack("/customer/dashboard", setLocation)}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Sample Approvals</h1>
              <p className="text-sm text-muted-foreground">Review and approve samples from Select Branding</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : samples.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-medium text-muted-foreground">No samples yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Samples sent to you for approval will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <SampleSection
                title="Awaiting Your Approval"
                icon={<Clock className="h-4 w-4" />}
                samples={pending}
                onApprove={(id) => approveMutation.mutate(id)}
                onAmends={(id) => { setAmendsDialogSampleId(id); setAmendsNotes(""); }}
                isApproving={approveMutation.isPending}
              />
            )}
            {amends.length > 0 && (
              <SampleSection
                title="Amends Requested"
                icon={<AlertCircle className="h-4 w-4" />}
                samples={amends}
                onApprove={(id) => approveMutation.mutate(id)}
                onAmends={(id) => { setAmendsDialogSampleId(id); setAmendsNotes(""); }}
                isApproving={approveMutation.isPending}
              />
            )}
            {approved.length > 0 && (
              <SampleSection
                title="Approved"
                icon={<CheckCircle className="h-4 w-4" />}
                samples={approved}
                isApproving={false}
              />
            )}
          </div>
        )}
      </main>

      {/* Amends dialog */}
      <Dialog open={!!amendsDialogSampleId} onOpenChange={(open) => !open && setAmendsDialogSampleId(null)}>
        <DialogContent data-testid="dialog-amends">
          <DialogHeader>
            <DialogTitle>Request Amends</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Please describe what changes are needed for <strong>{amendsDialogSample?.title}</strong>.
            </p>
            <Textarea
              placeholder="Describe the changes you'd like made…"
              rows={5}
              value={amendsNotes}
              onChange={e => setAmendsNotes(e.target.value)}
              data-testid="input-amends-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendsDialogSampleId(null)}>Cancel</Button>
            <Button
              onClick={() => amendsDialogSampleId && amendsMutation.mutate({ sampleId: amendsDialogSampleId, notes: amendsNotes })}
              disabled={!amendsNotes.trim() || amendsMutation.isPending}
              data-testid="button-submit-amends"
            >
              {amendsMutation.isPending ? "Submitting…" : "Submit Amends"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SampleSection({
  title,
  icon,
  samples,
  onApprove,
  onAmends,
  isApproving,
}: {
  title: string;
  icon: React.ReactNode;
  samples: Sample[];
  onApprove?: (id: string) => void;
  onAmends?: (id: string) => void;
  isApproving: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-muted-foreground/60">({samples.length})</span>
      </div>
      <div className="grid gap-4">
        {samples.map(sample => {
          const cfg = STATUS_CONFIG[sample.status];
          const Icon = cfg.icon;
          return (
            <Card key={sample.id} data-testid={`sample-card-${sample.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{sample.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sent {format(new Date(sample.createdAt), "d MMMM yyyy")}
                    </p>
                  </div>
                  <Badge className={`${cfg.color} flex items-center gap-1 text-xs`}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sample.description && (
                  <p className="text-sm text-muted-foreground">{sample.description}</p>
                )}
                {sample.customerNotes && sample.status === "amends_required" && (
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Your amends request</p>
                    <p className="text-sm whitespace-pre-wrap">{sample.customerNotes}</p>
                  </div>
                )}

                {/* Files */}
                {sample.files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Sample files</p>
                    {sample.files.map(f => (
                      <a
                        key={f.id}
                        href={f.fileUrl.startsWith("/api/img") ? f.fileUrl : `/api/img${f.fileUrl.replace("/objects", "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3 bg-muted rounded-md hover:bg-muted/80 transition-colors"
                        data-testid={`link-sample-file-${f.id}`}
                      >
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.fileName}</p>
                          <p className="text-xs text-muted-foreground">{Math.round(f.fileSize / 1024)} KB</p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {sample.status !== "approved" && onApprove && onAmends && (
                  <div className="flex gap-3 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => onApprove(sample.id)}
                      disabled={isApproving}
                      data-testid={`button-approve-${sample.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Sample
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => onAmends(sample.id)}
                      data-testid={`button-amends-${sample.id}`}
                    >
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Request Amends
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

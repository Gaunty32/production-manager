import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Search, AlertTriangle } from "lucide-react";

interface PreviewResult {
  before: string;
  count: number;
  totalValue: number;
}

export function DataCleanupCard() {
  const { toast } = useToast();
  const [beforeDate, setBeforeDate] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewMutation = useMutation({
    mutationFn: async (before: string) => {
      const res = await fetch(
        `/api/admin/cleanup/old-jobs/preview?before=${encodeURIComponent(before)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to preview");
      }
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => setPreview(data),
    onError: (e: Error) =>
      toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (before: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/cleanup/old-jobs?before=${encodeURIComponent(before)}`
      );
      return res.json() as Promise<{ deletedCount: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Old jobs removed",
        description: `Permanently deleted ${data.deletedCount} completed & invoiced job${data.deletedCount === 1 ? "" : "s"}.`,
      });
      setPreview(null);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const handlePreview = () => {
    if (!beforeDate) {
      toast({ title: "Pick a date", description: "Choose a cut-off date first.", variant: "destructive" });
      return;
    }
    previewMutation.mutate(beforeDate);
  };

  const formattedTotal = preview
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(preview.totalValue)
    : "";

  return (
    <Card className="mt-6" data-testid="card-data-cleanup">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Data Cleanup
        </CardTitle>
        <CardDescription>
          Permanently remove old completed &amp; invoiced jobs to keep the system tidy. This cannot be undone.
          Invoice history reporting will no longer include deleted jobs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cleanup-before" className="text-sm">
                Delete jobs invoiced on or before
              </Label>
              <Input
                id="cleanup-before"
                type="date"
                value={beforeDate}
                onChange={(e) => {
                  setBeforeDate(e.target.value);
                  setPreview(null);
                }}
                className="w-48"
                data-testid="input-cleanup-before"
              />
            </div>
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              data-testid="button-cleanup-preview"
            >
              <Search className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? "Checking..." : "Preview"}
            </Button>
          </div>

          {preview && (
            <div className="rounded-md border p-4 space-y-3" data-testid="cleanup-preview-result">
              {preview.count === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed &amp; invoiced jobs found on or before that date.
                </p>
              ) : (
                <>
                  <div className="text-sm">
                    <p>
                      <span className="font-semibold" data-testid="text-cleanup-count">{preview.count}</span>{" "}
                      completed &amp; invoiced job{preview.count === 1 ? "" : "s"} will be permanently deleted.
                    </p>
                    <p className="text-muted-foreground">
                      Combined invoice value: <span data-testid="text-cleanup-value">{formattedTotal}</span>
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmOpen(true)}
                    data-testid="button-cleanup-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete {preview.count} job{preview.count === 1 ? "" : "s"} permanently
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Permanently delete {preview?.count} job{preview?.count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove these completed &amp; invoiced jobs and all their line items,
              schedules, and chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cleanup-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (beforeDate) deleteMutation.mutate(beforeDate);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cleanup-confirm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Yes, delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

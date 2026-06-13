import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { type Job, type Customer } from "@shared/schema";
import { Clock, Package, AlertTriangle, CheckCircle2, CheckCheck, Trash2 } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";

function urgencyInfo(job: Job): { label: string | null; color: string } {
  if (!job.requiredDispatchDate) return { label: null, color: "" };
  const days = differenceInCalendarDays(new Date(job.requiredDispatchDate), new Date());
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "text-destructive" };
  if (days === 0) return { label: "Due today", color: "text-destructive" };
  if (days <= 3) return { label: `${days}d left`, color: "text-orange-600 dark:text-orange-400" };
  if (days <= 7) return { label: `${days}d left`, color: "text-amber-600 dark:text-amber-400" };
  return { label: `${days}d left`, color: "text-muted-foreground" };
}

export function UnscheduledJobs() {
  const { toast } = useToast();
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [confirmStale, setConfirmStale] = useState(false);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/job-schedules"],
  });

  const completeJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("PATCH", `/api/jobs/${jobId}`, { completed: true, status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job marked as complete" });
    },
    onError: () => toast({ title: "Failed to mark job complete", variant: "destructive" }),
  });

  const completeAllMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      await Promise.all(
        jobIds.map(id => apiRequest("PATCH", `/api/jobs/${id}`, { completed: true, status: "completed" }))
      );
    },
    onSuccess: (_data, jobIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: `${jobIds.length} jobs marked as complete` });
    },
    onError: () => toast({ title: "Failed to mark jobs complete", variant: "destructive" }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("DELETE", `/api/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job deleted" });
    },
    onError: () => toast({ title: "Failed to delete job", variant: "destructive" }),
  });

  const clearStaleMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      const results = await Promise.allSettled(
        jobIds.map(id => apiRequest("DELETE", `/api/jobs/${id}`))
      );
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      return { succeeded, failed: results.length - succeeded };
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      if (failed > 0) {
        toast({
          title: `${succeeded} deleted, ${failed} could not be removed`,
          description: "Please try again to clear the remaining jobs.",
          variant: "destructive",
        });
      } else {
        toast({ title: `${succeeded} stale job${succeeded === 1 ? "" : "s"} deleted` });
      }
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Failed to clear stale jobs", variant: "destructive" });
    },
  });

  if (jobsLoading || customersLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const scheduledJobIds = new Set(schedules.map((s: any) => s.jobId));
  const unscheduledJobs = jobs
    .filter(job =>
      !job.completed &&
      job.status !== "completed" &&
      !scheduledJobIds.has(job.id)
    )
    .sort((a, b) => {
      if (!a.requiredDispatchDate && !b.requiredDispatchDate) return 0;
      if (!a.requiredDispatchDate) return 1;
      if (!b.requiredDispatchDate) return -1;
      return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
    });

  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || "Unknown";
  };

  if (unscheduledJobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Unscheduled Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">All jobs are scheduled</p>
        </CardContent>
      </Card>
    );
  }

  const urgentCount = unscheduledJobs.filter(j => {
    if (!j.requiredDispatchDate) return false;
    return differenceInCalendarDays(new Date(j.requiredDispatchDate), new Date()) <= 3;
  }).length;

  // "Stale" = badly overdue (more than 30 days past dispatch date) and never scheduled/produced.
  // Any job with financial or invoicing activity is kept, so awaiting-payment, deposit-paid,
  // and invoiced jobs are never bulk-deleted regardless of age.
  const STALE_OVERDUE_DAYS = 30;
  const staleJobs = unscheduledJobs.filter(j => {
    if (!j.requiredDispatchDate) return false;
    if (j.status === "pending_customer_approval") return false;
    if (j.paymentReceived) return false;
    if ((j.depositAmountPaid ?? 0) > 0) return false;
    if (j.invoiceStatus && j.invoiceStatus !== "pending") return false;
    if (j.invoiceTotal != null) return false;
    // Awaiting payment: customer must pay in advance and payment hasn't arrived yet — never delete these.
    const customer = customers.find(c => c.id === j.customerId);
    if (customer?.requiresAdvancePayment && !j.paymentReceived) return false;
    const daysOverdue = differenceInCalendarDays(new Date(), new Date(j.requiredDispatchDate));
    return daysOverdue > STALE_OVERDUE_DAYS;
  });

  const confirmJob = jobs.find(j => j.id === confirmJobId);
  const deleteJob = jobs.find(j => j.id === deleteJobId);

  return (
    <>
      <Card className="flex flex-col max-h-[400px]">
        <CardHeader className="flex-shrink-0 flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">
            Unscheduled Jobs ({unscheduledJobs.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            {urgentCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {urgentCount} urgent
              </Badge>
            )}
            {staleJobs.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-destructive"
                onClick={() => setConfirmStale(true)}
                disabled={clearStaleMutation.isPending}
                data-testid="button-clear-stale-jobs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear stale jobs ({staleJobs.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setConfirmAll(true)}
              disabled={completeAllMutation.isPending}
              data-testid="button-mark-all-complete"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all done
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 overflow-y-auto flex-1">
          {unscheduledJobs.map((job) => {
            const { label: urgLabel, color: urgColor } = urgencyInfo(job);
            const isUrgent = urgLabel && (urgLabel.includes("overdue") || urgLabel === "Due today" || urgLabel.match(/^[1-3]d left/));
            return (
              <div
                key={job.id}
                className={cn(
                  "p-3 border rounded-md space-y-1",
                  isUrgent ? "border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/10" : ""
                )}
                data-testid={`job-unscheduled-${job.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm leading-snug">{job.jobName}</div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-green-600"
                      onClick={() => setConfirmJobId(job.id)}
                      disabled={completeJobMutation.isPending}
                      title="Mark as complete"
                      data-testid={`button-complete-job-${job.id}`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteJobId(job.id)}
                      disabled={deleteJobMutation.isPending}
                      title="Delete job"
                      data-testid={`button-delete-job-${job.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {getCustomerName(job.customerId)}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    <span>{job.quantity} units</span>
                  </div>
                  {job.requiredDispatchDate && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(job.requiredDispatchDate), "MMM d")}</span>
                    </div>
                  )}
                  {urgLabel && (
                    <span className={cn("font-medium", urgColor)}>{urgLabel}</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Single job confirm */}
      <AlertDialog open={!!confirmJobId} onOpenChange={(o) => { if (!o) setConfirmJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark job as complete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <span className="font-semibold">{confirmJob?.jobName}</span> as completed and remove it from the unscheduled list. Only do this if the job has genuinely been finished.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmJobId) completeJobMutation.mutate(confirmJobId);
                setConfirmJobId(null);
              }}
            >
              Yes, mark complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteJobId} onOpenChange={(o) => { if (!o) setDeleteJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{deleteJob?.jobName}</span> and remove it from the system. Use this for old or abandoned jobs that were never produced. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteJobId) deleteJobMutation.mutate(deleteJobId);
                setDeleteJobId(null);
              }}
            >
              Yes, delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear stale jobs confirm */}
      <AlertDialog open={confirmStale} onOpenChange={setConfirmStale}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear {staleJobs.length} stale job{staleJobs.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These jobs are more than 30 days past their dispatch date and were never scheduled or produced. They will be permanently deleted. Jobs awaiting approval, or with any deposit, payment, or invoice recorded, are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul
            className="max-h-40 overflow-y-auto text-sm list-disc pl-5 space-y-0.5 border rounded-md p-3"
            data-testid="list-stale-jobs"
          >
            {staleJobs.map((j) => (
              <li key={j.id}>
                <span className="font-medium">{j.jobName}</span> — {getCustomerName(j.customerId)}
                {j.requiredDispatchDate && (
                  <span className="text-muted-foreground">
                    {" "}(due {format(new Date(j.requiredDispatchDate), "MMM d, yyyy")})
                  </span>
                )}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                clearStaleMutation.mutate(staleJobs.map(j => j.id));
                setConfirmStale(false);
              }}
              data-testid="button-confirm-clear-stale"
            >
              Yes, clear stale jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark all confirm */}
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all {unscheduledJobs.length} jobs as complete?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark every job in the unscheduled list as completed. Only do this if you are sure all of these jobs have been finished. This cannot be undone easily.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                completeAllMutation.mutate(unscheduledJobs.map(j => j.id));
                setConfirmAll(false);
              }}
            >
              Yes, mark all complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

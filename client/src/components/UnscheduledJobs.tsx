import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Job, type Customer } from "@shared/schema";
import { Clock, Package, AlertTriangle } from "lucide-react";
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
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/job-schedules"],
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

  return (
    <Card className="flex flex-col max-h-[400px]">
      <CardHeader className="flex-shrink-0 flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm font-medium">
          Unscheduled Jobs ({unscheduledJobs.length})
        </CardTitle>
        {urgentCount > 0 && (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />
            {urgentCount} urgent
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 overflow-y-auto flex-1">
        {unscheduledJobs.map((job) => {
          const { label: urgLabel, color: urgColor } = urgencyInfo(job);
          const isUrgent = urgLabel && (urgLabel.includes("overdue") || urgLabel === "Due today" || urgLabel.match(/^[1-3]d left/));
          return (
            <div
              key={job.id}
              className={cn(
                "p-3 border rounded-md space-y-1 hover-elevate active-elevate-2",
                isUrgent ? "border-orange-200 dark:border-orange-900/40" : ""
              )}
              data-testid={`job-unscheduled-${job.id}`}
            >
              <div className="font-medium text-sm">{job.jobName}</div>
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
              {job.machineId && (
                <Badge variant="secondary" className="text-xs">
                  Machine {job.machineId}
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

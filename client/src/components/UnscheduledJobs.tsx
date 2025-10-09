import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Job, type Customer } from "@shared/schema";
import { Clock, Package } from "lucide-react";
import { format } from "date-fns";

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

  const scheduledJobIds = new Set(schedules.map(s => s.jobId));
  const unscheduledJobs = jobs.filter(job => !job.completed && !scheduledJobIds.has(job.id));

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Unscheduled Jobs ({unscheduledJobs.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {unscheduledJobs.slice(0, 10).map((job) => (
          <div
            key={job.id}
            className="p-3 border rounded-md space-y-1 hover-elevate active-elevate-2"
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
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Due {format(new Date(job.requiredDispatchDate), "MMM d")}</span>
              </div>
            </div>
            {job.machineId && (
              <Badge variant="secondary" className="text-xs">
                Machine {job.machineId}
              </Badge>
            )}
          </div>
        ))}
        {unscheduledJobs.length > 10 && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            +{unscheduledJobs.length - 10} more jobs
          </p>
        )}
      </CardContent>
    </Card>
  );
}

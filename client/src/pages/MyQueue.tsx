import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarClock, ListChecks, Package, Timer } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DemoText } from "@/components/DemoText";

interface QueueJob {
  id: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  outstandingQty: number;
  totalQty: number;
  jobTypes: string[];
  machineName: string | null;
  awaitingStock: boolean;
  awaitingArtwork: boolean;
  overdue: boolean;
  dueToday: boolean;
}

interface QueueData {
  staffId: string;
  staffName: string;
  currentJob: QueueJob | null;
  nextJobs: QueueJob[];
  totals: {
    jobsAllocated: number;
    itemsRemaining: number;
    itemsCompletedToday: number;
    minutesRecordedToday: number;
  };
}

interface StaffMember { id: string; name: string; active: boolean }

function fmtDue(d: string | null) {
  if (!d) return "No date";
  try { return format(new Date(d + "T00:00:00"), "EEE d MMM"); } catch { return d; }
}

function JobCardView({ job, big }: { job: QueueJob; big?: boolean }) {
  return (
    <Link href={`/staff/job/${job.id}`}>
      <div className={`rounded-md border p-3 hover-elevate cursor-pointer space-y-2 ${big ? "border-primary" : ""}`} data-testid={`queue-job-${job.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-semibold truncate ${big ? "text-lg" : "text-sm"}`}>
              {job.jobNumber ? `#${job.jobNumber} ` : ""}<DemoText>{job.jobName}</DemoText>
            </p>
            <p className="text-sm text-muted-foreground truncate"><DemoText>{job.customerName}</DemoText></p>
          </div>
          <span className={`font-bold whitespace-nowrap ${big ? "text-xl" : "text-sm"}`}>
            {job.outstandingQty.toLocaleString()}
            <span className="text-xs font-normal text-muted-foreground"> outstanding</span>
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={job.overdue ? "destructive" : job.dueToday ? "default" : "secondary"}>
            <CalendarClock className="h-3 w-3 mr-1" />
            {job.overdue ? "Overdue — " : job.dueToday ? "Due today — " : ""}{fmtDue(job.requiredDispatchDate)}
          </Badge>
          {job.machineName && <Badge variant="outline">{job.machineName}</Badge>}
          {job.jobTypes.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
          {job.awaitingStock && <Badge variant="outline" className="text-amber-600">Waiting for stock</Badge>}
          {job.awaitingArtwork && <Badge variant="outline" className="text-amber-600">Waiting for artwork</Badge>}
        </div>
      </div>
    </Link>
  );
}

export default function MyQueue() {
  const { user } = useAuth();
  const isManager = ["super_admin", "admin", "manager"].includes(user?.role ?? "");
  const [viewStaffId, setViewStaffId] = useState<string>("me");

  const { data: staffList } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    enabled: isManager,
  });

  const queryUrl = viewStaffId === "me" ? "/api/my-queue" : `/api/my-queue?staffId=${viewStaffId}`;
  const { data, isLoading, error } = useQuery<QueueData>({
    queryKey: [queryUrl],
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">My Work Queue</h1>
          {data && <p className="text-sm text-muted-foreground"><DemoText>{data.staffName}</DemoText>'s allocated jobs, most urgent first.</p>}
        </div>
        {isManager && staffList && (
          <Select value={viewStaffId} onValueChange={setViewStaffId}>
            <SelectTrigger className="w-44" data-testid="select-queue-staff"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="me">My queue</SelectItem>
              {staffList.filter(s => s.active).map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {(error as any)?.message?.includes("404") || (error as any)?.message?.includes("No staff")
              ? "No staff record is linked to your login, so there is no personal queue to show."
              : "Could not load the queue."}
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card><CardContent className="p-3 text-center">
              <ListChecks className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xl font-bold">{data.totals.jobsAllocated}</p>
              <p className="text-xs text-muted-foreground">Jobs allocated</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <Package className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xl font-bold">{data.totals.itemsRemaining.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Items outstanding</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <Package className="h-4 w-4 mx-auto text-green-600" />
              <p className="text-xl font-bold">{data.totals.itemsCompletedToday.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Done today</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <Timer className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xl font-bold">{Math.round(data.totals.minutesRecordedToday / 6) / 10}h</p>
              <p className="text-xs text-muted-foreground">Time recorded today</p>
            </CardContent></Card>
          </div>

          {data.currentJob ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Work on this now</CardTitle></CardHeader>
              <CardContent><JobCardView job={data.currentJob} big /></CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No jobs allocated. Check with your production manager.
              </CardContent>
            </Card>
          )}

          {data.nextJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Up next ({data.nextJobs.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.nextJobs.map(j => <JobCardView key={j.id} job={j} />)}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

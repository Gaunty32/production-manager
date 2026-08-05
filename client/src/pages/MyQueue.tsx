import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarClock, CheckCircle2, ListChecks, Package, Timer } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DemoText } from "@/components/DemoText";

interface QueueLineItem {
  id: string;
  jobType: string;
  description: string | null;
  position: string | null;
  quantity: number;
  completed: boolean;
  awaitingStock: boolean;
  logoApproved: boolean;
  machineId: number | null;
}

interface QueueJob {
  id: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  outstandingQty: number;
  totalQty: number;
  jobTypes: string[];
  machineId: number | null;
  machineName: string | null;
  responsibleOperatorName: string | null;
  awaitingStock: boolean;
  awaitingArtwork: boolean;
  overdue: boolean;
  dueToday: boolean;
  shareQty?: number;
  lineItems: QueueLineItem[];
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
interface Machine { id: number; name: string; isActive: boolean }

function fmtDue(d: string | null) {
  if (!d) return "No date";
  try { return format(new Date(d + "T00:00:00"), "EEE d MMM"); } catch { return d; }
}

function JobBadges({ job }: { job: QueueJob }) {
  return (
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
  );
}

export default function MyQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = ["super_admin", "admin", "manager"].includes(user?.role ?? "");
  const [viewStaffId, setViewStaffId] = useState<string>("me");
  const [completing, setCompleting] = useState<{ job: QueueJob; item: QueueLineItem } | null>(null);
  const [minutes, setMinutes] = useState("");
  const [completeMachineId, setCompleteMachineId] = useState<string>("none");

  const { data: staffList } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    enabled: isManager,
  });
  const { data: machines } = useQuery<Machine[]>({ queryKey: ["/api/machines"] });

  const queryUrl = viewStaffId === "me" ? "/api/my-queue" : `/api/my-queue?staffId=${viewStaffId}`;
  const { data, isLoading, error } = useQuery<QueueData>({
    queryKey: [queryUrl],
    refetchInterval: 60_000,
  });

  const { data: allJobs, isLoading: allJobsLoading } = useQuery<QueueJob[]>({
    queryKey: ["/api/active-jobs-overview"],
    refetchInterval: 60_000,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!completing || !data) throw new Error("Nothing selected");
      const body: Record<string, unknown> = {
        completed: true,
        completedById: data.staffId,
        actualProductionTimeMinutes: Number(minutes),
      };
      if (completeMachineId !== "none") body.machineId = Number(completeMachineId);
      const res = await apiRequest("PATCH", `/api/job-line-items/${completing.item.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-jobs-overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setCompleting(null);
      setMinutes("");
      toast({ title: "Marked complete — nice work" });
    },
    onError: (e: any) => toast({ title: "Could not complete", description: e.message, variant: "destructive" }),
  });

  const openComplete = (job: QueueJob, item: QueueLineItem) => {
    setCompleting({ job, item });
    setMinutes("");
    setCompleteMachineId(item.machineId != null ? String(item.machineId) : job.machineId != null ? String(job.machineId) : "none");
  };

  const canComplete = viewStaffId === "me" || isManager;

  const MyJobCard = ({ job, big }: { job: QueueJob; big?: boolean }) => (
    <div className={`rounded-md border p-3 space-y-2 ${big ? "border-primary" : ""}`} data-testid={`queue-job-${job.id}`}>
      <Link href={`/staff/job/${job.id}`}>
        <div className="flex items-start justify-between gap-2 cursor-pointer hover-elevate rounded-md -m-1 p-1">
          <div className="min-w-0">
            <p className={`font-semibold truncate ${big ? "text-lg" : "text-sm"}`}>
              {job.jobNumber ? `#${job.jobNumber} ` : ""}<DemoText>{job.jobName}</DemoText>
            </p>
            <p className="text-sm text-muted-foreground truncate"><DemoText>{job.customerName}</DemoText></p>
          </div>
          <span className={`font-bold whitespace-nowrap ${big ? "text-xl" : "text-sm"}`}>
            {(job.shareQty ?? job.outstandingQty).toLocaleString()}
            <span className="text-xs font-normal text-muted-foreground">
              {job.shareQty != null && job.shareQty !== job.outstandingQty ? " yours" : " outstanding"}
            </span>
          </span>
        </div>
      </Link>
      <JobBadges job={job} />
      <div className="space-y-1.5">
        {job.lineItems.filter(li => !li.completed).map(li => (
          <div key={li.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5">
            <div className="min-w-0 text-sm">
              <span className="font-medium">{li.quantity.toLocaleString()}×</span>{" "}
              <span className="text-muted-foreground truncate">
                {li.jobType}{li.position ? ` · ${li.position}` : ""}{li.description ? ` · ${li.description}` : ""}
              </span>
            </div>
            {canComplete && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => openComplete(job, li)}
                data-testid={`button-complete-${li.id}`}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />Complete
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Jobs</h1>
          {data && <p className="text-sm text-muted-foreground">Your allocated jobs, most urgent first. You can only complete jobs allocated to you.</p>}
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

      <Tabs defaultValue="mine">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mine" data-testid="tab-my-jobs">My jobs</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-jobs">All jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-4">
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : error ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No staff record is linked to your login, so there is no personal queue to show.
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
                  <CardContent><MyJobCard job={data.currentJob} big /></CardContent>
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
                    {data.nextJobs.map(j => <MyJobCard key={j.id} job={j} />)}
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="all" className="mt-4 space-y-2">
          {allJobsLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (allJobs?.length ?? 0) === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No active jobs.</CardContent></Card>
          ) : (
            allJobs!.map(job => (
              <Link key={job.id} href={`/staff/job/${job.id}`}>
                <div className="rounded-md border p-3 hover-elevate cursor-pointer space-y-2 mb-2" data-testid={`all-job-${job.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-sm">
                        {job.jobNumber ? `#${job.jobNumber} ` : ""}<DemoText>{job.jobName}</DemoText>
                      </p>
                      <p className="text-sm text-muted-foreground truncate"><DemoText>{job.customerName}</DemoText></p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{job.outstandingQty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">outstanding</span></p>
                      <p className="text-xs text-muted-foreground">
                        {job.responsibleOperatorName ? <><DemoText>{job.responsibleOperatorName}</DemoText>'s job</> : "No owner yet"}
                      </p>
                    </div>
                  </div>
                  <JobBadges job={job} />
                </div>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!completing} onOpenChange={open => !open && setCompleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete line item</DialogTitle>
          </DialogHeader>
          {completing && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {completing.item.quantity.toLocaleString()}× {completing.item.jobType}
                {completing.item.description ? ` — ${completing.item.description}` : ""} on{" "}
                {completing.job.jobNumber ? `#${completing.job.jobNumber} ` : ""}{completing.job.jobName}
              </p>
              <div>
                <label className="text-sm font-medium block mb-1">Machine used</label>
                <Select value={completeMachineId} onValueChange={setCompleteMachineId}>
                  <SelectTrigger data-testid="select-complete-machine"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not applicable</SelectItem>
                    {machines?.filter(m => m.isActive).map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Time taken (minutes)</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  placeholder="e.g. 45"
                  data-testid="input-complete-minutes"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || !minutes || Number(minutes) <= 0}
              data-testid="button-confirm-complete"
            >
              {completeMutation.isPending ? "Saving…" : "Mark complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

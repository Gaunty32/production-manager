import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, UserX, Ban, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DemoText } from "@/components/DemoText";

interface JobCard {
  id: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  outstandingQty: number;
  totalQty: number;
  jobTypes: string[];
  responsibleOperatorId: string | null;
  responsibleOperatorName: string | null;
  allocationStatus: string;
  blockedReason: string | null;
  machineId: number | null;
  machineName: string | null;
  recommendedMachineId: number | null;
  recommendedMachineName: string | null;
  machineOverrideReason: string | null;
  awaitingStock: boolean;
  awaitingArtwork: boolean;
  overdue: boolean;
  dueToday: boolean;
}

interface BoardData {
  operators: Array<{
    staffId: string;
    name: string;
    jobs: JobCard[];
    jobCount: number;
    itemsRemaining: number;
    earliestDue: string | null;
    atRisk: number;
  }>;
  unallocated: JobCard[];
  blocked: JobCard[];
}

interface Machine { id: number; name: string; isActive: boolean }

function fmtDue(d: string | null) {
  if (!d) return "No date";
  try { return format(new Date(d + "T00:00:00"), "EEE d MMM"); } catch { return d; }
}

const BLOCK_REASONS = [
  "Machine issue", "Stock issue", "Artwork issue", "Operator unavailable",
  "Quality concern", "Missing instruction", "Awaiting manager decision",
  "Priority job inserted", "Other",
];

export default function AllocationBoard() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<JobCard | null>(null);
  const [operatorId, setOperatorId] = useState<string>("unallocated");
  const [machineId, setMachineId] = useState<string>("none");
  const [overrideReason, setOverrideReason] = useState("");
  const [blockReason, setBlockReason] = useState<string>("none");

  const { data: board, isLoading } = useQuery<BoardData>({ queryKey: ["/api/allocation/board"] });
  const { data: machines } = useQuery<Machine[]>({ queryKey: ["/api/machines"] });

  const { data: recommendation } = useQuery<{ machineId: number | null; machineName: string | null; reason: string }>({
    queryKey: ["/api/allocation/recommend", selected?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/allocation/recommend/${selected!.id}`);
      return res.json();
    },
    enabled: !!selected,
  });

  const allocateMutation = useMutation({
    mutationFn: async (payload: { jobId: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/jobs/${payload.jobId}/allocate`, payload.body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allocation/board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setSelected(null);
      toast({ title: "Job allocation updated" });
    },
    onError: (e: any) => toast({ title: "Could not update allocation", description: e.message, variant: "destructive" }),
  });

  const openAllocate = (job: JobCard) => {
    setSelected(job);
    setOperatorId(job.responsibleOperatorId ?? "unallocated");
    setMachineId(job.machineId != null ? String(job.machineId) : "none");
    setOverrideReason(job.machineOverrideReason ?? "");
    setBlockReason(job.blockedReason ?? "none");
  };

  const submitAllocation = () => {
    if (!selected) return;
    const chosenMachine = machineId === "none" ? null : Number(machineId);
    const isOverride = recommendation?.machineId != null && chosenMachine != null && chosenMachine !== recommendation.machineId;
    allocateMutation.mutate({
      jobId: selected.id,
      body: {
        responsibleOperatorId: operatorId === "unallocated" ? null : operatorId,
        machineId: chosenMachine,
        machineOverrideReason: isOverride ? (overrideReason || null) : null,
        blockedReason: blockReason === "none" ? null : blockReason,
      },
    });
  };

  const JobRow = ({ job }: { job: JobCard }) => (
    <button
      onClick={() => openAllocate(job)}
      className="w-full text-left rounded-md border p-2 hover-elevate space-y-1"
      data-testid={`allocation-job-${job.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">
          {job.jobNumber ? `#${job.jobNumber} ` : ""}<DemoText>{job.jobName}</DemoText>
        </span>
        <span className="text-xs whitespace-nowrap text-muted-foreground">{job.outstandingQty.toLocaleString()} items</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground truncate"><DemoText>{job.customerName}</DemoText></span>
        <Badge variant={job.overdue ? "destructive" : "secondary"} className="text-[10px]">
          <CalendarClock className="h-3 w-3 mr-1" />{fmtDue(job.requiredDispatchDate)}
        </Badge>
        {job.machineName && <Badge variant="outline" className="text-[10px]">{job.machineName}</Badge>}
        {job.awaitingStock && <Badge variant="outline" className="text-[10px] text-amber-600">Stock</Badge>}
        {job.awaitingArtwork && <Badge variant="outline" className="text-[10px] text-amber-600">Artwork</Badge>}
      </div>
    </button>
  );

  if (isLoading) return <div className="p-4"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Job Allocation</h1>
        <p className="text-sm text-muted-foreground">People own jobs. Machines provide capacity. Click any job to change its owner, machine or status.</p>
      </div>

      {(board?.unallocated.length ?? 0) > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserX className="h-4 w-4 text-amber-600" />
              Awaiting allocation ({board!.unallocated.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {board!.unallocated.map(j => <JobRow key={j.id} job={j} />)}
          </CardContent>
        </Card>
      )}

      {(board?.blocked.length ?? 0) > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" />
              Blocked ({board!.blocked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {board!.blocked.map(j => (
              <div key={j.id} className="space-y-1">
                <JobRow job={j} />
                <p className="text-xs text-destructive pl-2">{j.blockedReason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {board?.operators.map(op => (
          <Card key={op.staffId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <DemoText>{op.name}</DemoText>
                <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  {op.atRisk > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" />{op.atRisk} at risk
                    </Badge>
                  )}
                  {op.jobCount} jobs · {op.itemsRemaining.toLocaleString()} items
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {op.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs allocated.</p>
              ) : (
                op.jobs.map(j => <JobRow key={j.id} job={j} />)
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.jobNumber ? `#${selected.jobNumber} ` : ""}{selected?.jobName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Responsible operator</label>
              <Select value={operatorId} onValueChange={setOperatorId}>
                <SelectTrigger data-testid="select-responsible-operator"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unallocated">Unallocated</SelectItem>
                  {board?.operators.map(op => (
                    <SelectItem key={op.staffId} value={op.staffId}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Machine</label>
              {recommendation?.machineId != null && (
                <p className="text-xs text-muted-foreground mb-1">
                  Recommended: <span className="font-medium">{recommendation.machineName}</span> — {recommendation.reason}
                </p>
              )}
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger data-testid="select-confirmed-machine"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {machines?.filter(m => m.isActive).map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}{recommendation?.machineId === m.id ? " (recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recommendation?.machineId != null && machineId !== "none" && Number(machineId) !== recommendation.machineId && (
                <Textarea
                  className="mt-2"
                  placeholder="Reason for overriding the recommended machine (optional)"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  data-testid="input-override-reason"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Blocked?</label>
              <Select value={blockReason} onValueChange={setBlockReason}>
                <SelectTrigger data-testid="select-block-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not blocked</SelectItem>
                  {BLOCK_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {selected && (
              <Link href={`/staff/job/${selected.id}`} className="mr-auto text-sm text-muted-foreground underline">
                Open job
              </Link>
            )}
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={submitAllocation} disabled={allocateMutation.isPending} data-testid="button-save-allocation">
              {allocateMutation.isPending ? "Saving…" : "Save allocation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { minutesToTime } from "@shared/scheduling";
import { format } from "date-fns";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { useMachines } from "@/hooks/useMachines";
import { Sun, Trash2, Sparkles, CalendarClock, CheckCircle2, Pencil, UserPlus, Undo2, PoundSterling, Send, Plus } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

interface CasualStaffRow {
  id: string;
  firstName: string;
  lastName?: string | null;
  mobileNumber: string;
  active: boolean;
  hasPin: boolean;
  inviteSentAt?: string | null;
}

interface ShiftRow {
  id: string;
  machineId: number;
  machineName: string;
  date: string;
  startLabel: string;
  endLabel: string;
  startFlexMinutes?: number;
  status: string;
  claimedByName?: string | null;
  offeredToId?: string | null;
  offeredToName?: string | null;
}

interface PayrollRow {
  casualStaffId: string;
  name: string;
  mobileNumber: string;
  active: boolean;
  shiftCount: number;
  minutes: number;
  hours: number;
}

function minutesFromTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function SummerShifts() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Sun className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Casual Shifts</h1>
            <p className="text-sm text-muted-foreground">Offer machine shifts your casual staff can pick up. Manage casual staff on the Staff page.</p>
          </div>
        </div>

        <Tabs defaultValue="shifts">
          <TabsList>
            <TabsTrigger value="shifts" data-testid="tab-shifts"><CalendarClock className="mr-1.5 h-4 w-4" />Shifts</TabsTrigger>
            <TabsTrigger value="payroll" data-testid="tab-payroll"><PoundSterling className="mr-1.5 h-4 w-4" />Payroll</TabsTrigger>
          </TabsList>
          <TabsContent value="shifts" className="mt-4"><ShiftsTab /></TabsContent>
          <TabsContent value="payroll" className="mt-4"><PayrollTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ShiftsTab() {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState(8);
  const [dailyStart, setDailyStart] = useState("07:00");
  const [dailyEnd, setDailyEnd] = useState("18:00");
  const [minHours, setMinHours] = useState(2);
  const [includeSaturday, setIncludeSaturday] = useState(true);
  const [includeSunday, setIncludeSunday] = useState(false);
  const [editShift, setEditShift] = useState<ShiftRow | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editFlex, setEditFlex] = useState("0");
  const [offerShift, setOfferShift] = useState<ShiftRow | null>(null);
  const [offerPersonId, setOfferPersonId] = useState("");

  const { activeMachines } = useMachines();
  const [addOpen, setAddOpen] = useState(false);
  const [addMachineId, setAddMachineId] = useState("");
  const [addDate, setAddDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [addStart, setAddStart] = useState("07:00");
  const [addEnd, setAddEnd] = useState("18:00");
  const [addRecurring, setAddRecurring] = useState(false);
  const [addDays, setAddDays] = useState<number[]>([]);
  const [addWeeks, setAddWeeks] = useState(4);
  const [addDates, setAddDates] = useState<Date[]>([]);
  const [addAssignee, setAddAssignee] = useState("anyone");

  const openAdd = () => {
    setAddMachineId(activeMachines[0] ? String(activeMachines[0].id) : "");
    setAddDate(format(new Date(), "yyyy-MM-dd"));
    setAddStart("07:00");
    setAddEnd("18:00");
    setAddRecurring(false);
    setAddDays([]);
    setAddWeeks(4);
    setAddDates([]);
    setAddAssignee("anyone");
    setAddOpen(true);
  };

  const toggleAddDay = (v: number) =>
    setAddDays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v].sort()));

  const openEdit = (s: ShiftRow) => {
    setEditShift(s);
    setEditStart(s.startLabel);
    setEditEnd(s.endLabel);
    setEditFlex(String(s.startFlexMinutes ?? 0));
  };

  const { data: casualStaff = [] } = useQuery<CasualStaffRow[]>({ queryKey: ["/api/casual-staff"] });
  const activeStaff = casualStaff.filter((m) => m.active);
  const eligibleStaff = casualStaff.filter((m) => m.active && m.hasPin);

  const { data: suggested = [], isLoading: suggLoading } = useQuery<ShiftRow[]>({
    queryKey: ["/api/shifts", { status: "suggested" }],
    queryFn: async () => (await apiRequest("GET", "/api/shifts?status=suggested")).json(),
  });
  const { data: published = [], isLoading: pubLoading } = useQuery<ShiftRow[]>({
    queryKey: ["/api/shifts", { status: "published" }],
    queryFn: async () => {
      const a = await (await apiRequest("GET", "/api/shifts?status=available")).json();
      const c = await (await apiRequest("GET", "/api/shifts?status=claimed")).json();
      return [...a, ...c];
    },
  });

  const refreshShifts = () => queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });

  const availDate = addRecurring
    ? addDate
    : addDates[0]
      ? format(addDates[0], "yyyy-MM-dd")
      : addDate;

  const { data: machineAvailability = [], isLoading: availLoading } = useQuery<
    { machineId: number; available: boolean; occupiedBy: string | null }[]
  >({
    queryKey: ["/api/shifts/machine-availability", availDate],
    queryFn: async () =>
      (await apiRequest("GET", `/api/shifts/machine-availability?date=${availDate}`)).json(),
    enabled: addOpen && !!availDate,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const availByMachine = new Map(machineAvailability.map((a) => [a.machineId, a]));
  const selectedAvail = addMachineId ? availByMachine.get(Number(addMachineId)) : undefined;
  const selectedOccupied = !addRecurring && addDates.length === 1 && selectedAvail?.available === false;

  const createManualMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/shifts/manual", {
        machineId: Number(addMachineId),
        date: addDate,
        startTime: minutesFromTimeStr(addStart),
        endTime: minutesFromTimeStr(addEnd),
        isRecurring: addRecurring,
        recurringDaysOfWeek: addRecurring ? addDays : [],
        weeks: addWeeks,
        dates: addRecurring ? undefined : addDates.map((d) => format(d, "yyyy-MM-dd")),
        casualStaffId: addAssignee !== "anyone" ? addAssignee : undefined,
      })).json(),
    onSuccess: (res: any) => {
      const skipped = Number(res.skipped) || 0;
      const skipNote = skipped > 0
        ? ` ${skipped} day${skipped > 1 ? "s" : ""} skipped — the machine's operator was working those days.`
        : "";
      if (res.assigned) {
        toast({
          title: res.created > 1 ? `${res.created} shifts assigned` : "Shift assigned",
          description: (res.notified
            ? "They've been texted to accept or decline."
            : "Couldn't text them, but the shift is waiting in their app to accept.") + skipNote,
        });
      } else {
        toast({
          title: res.created > 1 ? `Added ${res.created} shifts` : "Shift added",
          description: (skipped > 0
            ? "Find the rest under suggested shifts below."
            : "Find it under suggested shifts below to assign or publish.") + skipNote,
        });
      }
      setAddOpen(false);
      refreshShifts();
    },
    onError: (err: any) => toast({ title: "Couldn't add shift", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/shifts/generate-suggestions", {
        weeks,
        dailyStartTime: minutesFromTimeStr(dailyStart),
        dailyEndTime: minutesFromTimeStr(dailyEnd),
        minShiftMinutes: minHours * 60,
        includeSaturday,
        includeSunday,
      });
    },
    onSuccess: () => { toast({ title: "Suggestions ready", description: "Review them below, then publish." }); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't generate", description: err.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/shifts/publish", {})).json(),
    onSuccess: (res: any) => { toast({ title: `Published ${res.published} shifts`, description: "Casual staff can now book them." }); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't publish", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/shifts/${id}`); },
    onSuccess: refreshShifts,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editShift) return;
      await apiRequest("PATCH", `/api/shifts/${editShift.id}`, {
        startTime: minutesFromTimeStr(editStart),
        endTime: minutesFromTimeStr(editEnd),
        startFlexMinutes: Number(editFlex),
      });
    },
    onSuccess: () => { toast({ title: "Shift updated" }); setEditShift(null); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't update", description: err.message, variant: "destructive" }),
  });

  const discardAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(suggested.map((s) => apiRequest("DELETE", `/api/shifts/${s.id}`)));
    },
    onSuccess: () => { toast({ title: "Suggestions cleared" }); refreshShifts(); },
  });

  // Assign (or unassign) a suggested shift to a specific person — quietly, no
  // notification yet. "anyone" clears the assignment.
  const assignMutation = useMutation({
    mutationFn: async ({ shift, personId }: { shift: ShiftRow; personId: string }) => {
      if (personId === "anyone") {
        await apiRequest("POST", `/api/shifts/${shift.id}/release`, {});
      } else {
        await apiRequest("POST", `/api/shifts/${shift.id}/offer`, { casualStaffId: personId });
      }
    },
    onSuccess: refreshShifts,
    onError: (err: any) => toast({ title: "Couldn't assign", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/shifts/invite", {})).json(),
    onSuccess: (res: any) => {
      const skippedNote = res.skipped
        ? ` ${res.skipped} skipped — those people still need to accept their invite and set a PIN.`
        : "";
      toast({
        title: res.invited === 0 ? "No invites sent" : `Invited ${res.peopleNotified} ${res.peopleNotified === 1 ? "person" : "people"}`,
        description: `${res.invited} shift${res.invited === 1 ? "" : "s"} sent out to accept or decline.${skippedNote}`,
        variant: res.invited === 0 ? "destructive" : undefined,
      });
      refreshShifts();
    },
    onError: (err: any) => toast({ title: "Couldn't send invites", description: err.message, variant: "destructive" }),
  });

  const assignedCount = suggested.filter((s) => s.offeredToId).length;

  const offerMutation = useMutation({
    mutationFn: async () => {
      if (!offerShift || !offerPersonId) return;
      await apiRequest("POST", `/api/shifts/${offerShift.id}/offer`, { casualStaffId: offerPersonId });
    },
    onSuccess: () => { toast({ title: "Shift offered", description: "They've been notified and can claim it." }); setOfferShift(null); setOfferPersonId(""); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't offer", description: err.message, variant: "destructive" }),
  });

  const releaseMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/shifts/${id}/release`, {}); },
    onSuccess: () => { toast({ title: "Released to everyone" }); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't release", description: err.message, variant: "destructive" }),
  });

  const openOffer = (s: ShiftRow) => { setOfferShift(s); setOfferPersonId(""); };

  const groupByDate = (rows: ShiftRow[]) => {
    const map = new Map<string, ShiftRow[]>();
    for (const r of rows) {
      const key = format(new Date(r.date), "EEEE d MMM yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Generate shift suggestions</CardTitle>
          <CardDescription>We look at each machine's free time over the next few weeks and suggest open shifts. Nothing goes live until you publish.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="weeks">Weeks ahead</Label>
              <Input id="weeks" type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} data-testid="input-weeks" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Day starts</Label>
              <Input id="start" type="time" value={dailyStart} onChange={(e) => setDailyStart(e.target.value)} data-testid="input-daily-start" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Day ends</Label>
              <Input id="end" type="time" value={dailyEnd} onChange={(e) => setDailyEnd(e.target.value)} data-testid="input-daily-end" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minh">Min hours / shift</Label>
              <Input id="minh" type="number" min={1} max={12} value={minHours} onChange={(e) => setMinHours(Number(e.target.value))} data-testid="input-min-hours" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="sat" checked={includeSaturday} onCheckedChange={setIncludeSaturday} data-testid="switch-saturday" />
              <Label htmlFor="sat">Include Saturdays</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sun" checked={includeSunday} onCheckedChange={setIncludeSunday} data-testid="switch-sunday" />
              <Label htmlFor="sun">Include Sundays</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-generate">
              {generateMutation.isPending ? "Generating..." : "Generate suggestions"}
            </Button>
            <span className="text-sm text-muted-foreground">or</span>
            <Button variant="outline" onClick={openAdd} data-testid="button-add-manual-shift">
              <Plus className="mr-1.5 h-4 w-4" />Add a shift manually
            </Button>
          </div>
        </CardContent>
      </Card>

      {suggested.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{suggested.length} suggested shifts</CardTitle>
              <CardDescription>Assign each shift to a person, then Invite them to accept or decline. Or Publish all to open every shift to everyone.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => discardAllMutation.mutate()} disabled={discardAllMutation.isPending} data-testid="button-discard-all">Discard all</Button>
              <Button variant="outline" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} data-testid="button-publish">
                {publishMutation.isPending ? "Publishing..." : "Publish all"}
              </Button>
              <Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending || assignedCount === 0} data-testid="button-invite-assigned">
                <Send className="mr-1.5 h-4 w-4" />{inviteMutation.isPending ? "Inviting..." : `Invite assigned${assignedCount ? ` (${assignedCount})` : ""}`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupByDate(suggested).map(([date, rows]) => (
              <div key={date}>
                <p className="mb-2 text-sm font-medium">{date}</p>
                <div className="space-y-1.5">
                  {rows.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5" data-testid={`row-suggested-${s.id}`}>
                      <span className="text-sm">{s.startLabel}–{s.endLabel} · <span className="text-muted-foreground">{s.machineName}</span>{s.startFlexMinutes ? <span className="ml-1.5 text-xs text-muted-foreground">(start ±{s.startFlexMinutes / 60}h)</span> : null}</span>
                      <div className="flex items-center gap-1">
                        <Select
                          value={s.offeredToId ?? "anyone"}
                          onValueChange={(v) => assignMutation.mutate({ shift: s, personId: v })}
                        >
                          <SelectTrigger className="w-[160px]" data-testid={`select-assign-${s.id}`}>
                            <SelectValue placeholder="Assign to" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="anyone" data-testid={`option-assign-anyone-${s.id}`}>Anyone</SelectItem>
                            {activeStaff.map((m) => (
                              <SelectItem key={m.id} value={m.id} disabled={!m.hasPin} data-testid={`option-assign-${s.id}-${m.id}`}>
                                {m.firstName} {m.lastName}{!m.hasPin ? " — needs to set up" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`button-edit-suggested-${s.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} data-testid={`button-delete-suggested-${s.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4" />Published shifts</CardTitle>
          <CardDescription>Live shifts staff can book, and who's taken them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pubLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : published.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-published">No published shifts yet. Generate and publish some above.</p>
          ) : (
            groupByDate(published).map(([date, rows]) => (
              <div key={date}>
                <p className="mb-2 text-sm font-medium">{date}</p>
                <div className="space-y-1.5">
                  {rows.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5" data-testid={`row-published-${s.id}`}>
                      <span className="text-sm">{s.startLabel}–{s.endLabel} · <span className="text-muted-foreground">{s.machineName}</span>{s.startFlexMinutes ? <span className="ml-1.5 text-xs text-muted-foreground">(start ±{s.startFlexMinutes / 60}h)</span> : null}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {s.status === "claimed" ? (
                          <Badge variant="secondary" data-testid={`badge-claimed-${s.id}`}>{s.claimedByName || "Booked"}</Badge>
                        ) : s.offeredToName ? (
                          <Badge variant="outline" data-testid={`badge-offered-${s.id}`}>Offered to {s.offeredToName}</Badge>
                        ) : (
                          <Badge>Available</Badge>
                        )}
                        {s.status !== "claimed" && (s.offeredToId ? (
                          <Button variant="outline" size="sm" onClick={() => releaseMutation.mutate(s.id)} disabled={releaseMutation.isPending} data-testid={`button-release-${s.id}`}>
                            <Undo2 className="mr-1.5 h-3.5 w-3.5" />Release
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => openOffer(s)} data-testid={`button-offer-${s.id}`}>
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" />Offer
                          </Button>
                        ))}
                        {s.status !== "claimed" && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`button-edit-published-${s.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} data-testid={`button-delete-published-${s.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a shift</DialogTitle>
            <DialogDescription>
              Pick a machine, one or more dates and the times. Leave it as "Anyone" to add to the suggested list, or assign it straight to a person to accept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Machine</Label>
              {activeMachines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active machines found.</p>
              ) : (
                <Select value={addMachineId} onValueChange={setAddMachineId}>
                  <SelectTrigger data-testid="select-add-machine">
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMachines.map((m) => {
                      const a = availByMachine.get(m.id);
                      const occupied = a?.available === false;
                      return (
                        <SelectItem
                          key={m.id}
                          value={String(m.id)}
                          disabled={!addRecurring && addDates.length === 1 && occupied}
                          data-testid={`option-add-machine-${m.id}`}
                        >
                          {m.name}
                          {occupied ? ` — ${a?.occupiedBy ?? "operator"} working` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              {availLoading && (
                <p className="text-xs text-muted-foreground">Checking machine availability…</p>
              )}
              {selectedOccupied && (
                <p className="text-xs text-destructive" data-testid="text-machine-occupied">
                  {selectedAvail?.occupiedBy ?? "The operator"} is working this machine on the selected day. Casual cover is only for machines whose operator is away.
                </p>
              )}
              {(addRecurring || addDates.length > 1) && (
                <p className="text-xs text-muted-foreground">
                  Days where the machine's operator is working will be skipped automatically.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={addAssignee} onValueChange={setAddAssignee}>
                <SelectTrigger data-testid="select-add-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anyone">Anyone (add to suggested list)</SelectItem>
                  {eligibleStaff.map((m) => (
                    <SelectItem key={m.id} value={m.id} data-testid={`option-add-assignee-${m.id}`}>
                      {m.firstName}{m.lastName ? ` ${m.lastName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {addAssignee === "anyone"
                  ? "Or pick a person to offer these shifts straight to them."
                  : "They'll be texted to accept or decline these shifts."}
              </p>
            </div>

            {addRecurring ? (
              <div className="space-y-1.5">
                <Label htmlFor="add-date">Start date</Label>
                <Input id="add-date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} data-testid="input-add-date" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Dates</Label>
                <div className="flex justify-center rounded-md border p-2">
                  <Calendar
                    mode="multiple"
                    selected={addDates}
                    onSelect={(d) => setAddDates(d ?? [])}
                    disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                    data-testid="calendar-add-dates"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {addDates.length === 0
                    ? "Pick one or more days."
                    : `${addDates.length} day${addDates.length > 1 ? "s" : ""} selected.`}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-start">Start time</Label>
                <Input id="add-start" type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)} data-testid="input-add-start" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-end">End time</Label>
                <Input id="add-end" type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} data-testid="input-add-end" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="add-recurring" checked={addRecurring} onCheckedChange={setAddRecurring} data-testid="switch-add-recurring" />
              <Label htmlFor="add-recurring">Repeat weekly</Label>
            </div>

            {addRecurring && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label>Days of week</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`add-day-${day.value}`}
                          checked={addDays.includes(day.value)}
                          onCheckedChange={() => toggleAddDay(day.value)}
                          data-testid={`checkbox-add-day-${day.value}`}
                        />
                        <label htmlFor={`add-day-${day.value}`} className="text-sm font-medium leading-none cursor-pointer">
                          {day.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-weeks">Number of weeks</Label>
                  <Input
                    id="add-weeks"
                    type="number"
                    min={1}
                    max={12}
                    value={addWeeks}
                    onChange={(e) => setAddWeeks(Number(e.target.value))}
                    data-testid="input-add-weeks"
                  />
                  <p className="text-xs text-muted-foreground">Repeats on the chosen days from the start date for this many weeks.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-add">Cancel</Button>
            <Button
              onClick={() => createManualMutation.mutate()}
              disabled={
                createManualMutation.isPending ||
                !addMachineId ||
                selectedOccupied ||
                minutesFromTimeStr(addEnd) <= minutesFromTimeStr(addStart) ||
                (addRecurring ? addDays.length === 0 : addDates.length === 0)
              }
              data-testid="button-save-add"
            >
              {createManualMutation.isPending
                ? (addAssignee !== "anyone" ? "Assigning..." : "Adding...")
                : (addAssignee !== "anyone" ? "Assign shifts" : "Add shift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editShift} onOpenChange={(o) => !o && setEditShift(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit shift</DialogTitle>
            <DialogDescription>
              {editShift && (
                <>{format(new Date(editShift.date), "EEEE d MMM")} · {editShift.machineName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start</Label>
              <Input id="edit-start" type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} data-testid="input-edit-start" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End</Label>
              <Input id="edit-end" type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} data-testid="input-edit-end" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="edit-flex">Let them shift the start time</Label>
            <Select value={editFlex} onValueChange={setEditFlex}>
              <SelectTrigger id="edit-flex" data-testid="select-edit-flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" data-testid="option-flex-0">Fixed — must start at this time</SelectItem>
                <SelectItem value="60" data-testid="option-flex-60">Up to 1 hour earlier or later</SelectItem>
                <SelectItem value="120" data-testid="option-flex-120">Up to 2 hours earlier or later</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              They keep the same shift length — moving the start moves the finish by the same amount.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditShift(null)} data-testid="button-cancel-edit">Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || minutesFromTimeStr(editEnd) <= minutesFromTimeStr(editStart)}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!offerShift} onOpenChange={(o) => !o && setOfferShift(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Offer this shift</DialogTitle>
            <DialogDescription>
              {offerShift && (
                <>{format(new Date(offerShift.date), "EEEE d MMM")} · {offerShift.startLabel}–{offerShift.endLabel} · {offerShift.machineName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Offer to</Label>
            {activeStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active casual staff. Add and invite people on the Staff page first.</p>
            ) : (
              <Select value={offerPersonId} onValueChange={setOfferPersonId}>
                <SelectTrigger data-testid="select-offer-person">
                  <SelectValue placeholder="Pick a person" />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={!m.hasPin} data-testid={`option-offer-${m.id}`}>
                      {m.firstName} {m.lastName}{!m.hasPin ? " — needs to set up" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">Only this person will see the shift until you release it to everyone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferShift(null)} data-testid="button-cancel-offer">Cancel</Button>
            <Button onClick={() => offerMutation.mutate()} disabled={offerMutation.isPending || !offerPersonId} data-testid="button-confirm-offer">
              {offerMutation.isPending ? "Offering..." : "Offer shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function PayrollTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);

  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1).toISOString();
  const to = new Date(year, mon, 0).toISOString();

  const { data, isLoading } = useQuery<{ rows: PayrollRow[] }>({
    queryKey: ["/api/casual-staff/hours", { from, to }],
    queryFn: async () => (await apiRequest("GET", `/api/casual-staff/hours?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).json(),
  });

  const rows = data?.rows ?? [];
  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const totalShifts = rows.reduce((sum, r) => sum + r.shiftCount, 0);
  const monthLabel = format(new Date(year, mon - 1, 1), "MMMM yyyy");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Worked hours</CardTitle>
          <CardDescription>Total claimed shift hours per casual person, for payroll. Pick a month below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payroll-month">Month</Label>
              <Input id="payroll-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="input-payroll-month" />
            </div>
          </div>

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-payroll">No casual staff to show.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Shifts</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {rows.map((r) => (
                    <tr key={r.casualStaffId} data-testid={`row-payroll-${r.casualStaffId}`}>
                      <td className="px-4 py-2.5 text-sm">
                        {r.name}
                        {!r.active && <Badge variant="destructive" className="ml-2">Disabled</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums" data-testid={`text-shifts-${r.casualStaffId}`}>{r.shiftCount}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums" data-testid={`text-hours-${r.casualStaffId}`}>{r.hours.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td className="px-4 py-2.5 text-sm font-semibold">Total · {monthLabel}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums" data-testid="text-total-shifts">{totalShifts}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums" data-testid="text-total-hours">{totalHours.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

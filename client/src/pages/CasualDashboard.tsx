import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { minutesToTime } from "@shared/scheduling";
import { format } from "date-fns";
import { Sun, LogOut, Clock, Cog, CalendarDays, AlertCircle, CalendarPlus, Gift, Repeat, Check, X } from "lucide-react";

interface RegularShiftRow {
  machineId: number;
  machineName: string;
  date: string;
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
}

interface ShiftRow {
  id: string;
  machineId: number;
  machineName: string;
  date: string;
  startTime: number;
  endTime: number;
  startFlexMinutes?: number;
  startLabel: string;
  endLabel: string;
  status: string;
  canModify?: boolean;
  offeredToId?: string | null;
}

interface Me {
  id: string;
  firstName: string;
  lastName?: string | null;
  weeklyLimit: number;
  shiftsThisWeek: number;
}

function timeOptions(from: number, to: number): number[] {
  const opts: number[] = [];
  for (let t = from; t <= to; t += 30) opts.push(t);
  return opts;
}

export default function CasualDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [claimTarget, setClaimTarget] = useState<ShiftRow | null>(null);
  const [amendTarget, setAmendTarget] = useState<ShiftRow | null>(null);
  const [flexTarget, setFlexTarget] = useState<ShiftRow | null>(null);
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(0);

  const { data: me, isLoading: meLoading, isError: meError } = useQuery<Me>({
    queryKey: ["/api/casual/me"],
    retry: false,
  });

  const { data: available = [], isLoading: availLoading } = useQuery<ShiftRow[]>({
    queryKey: ["/api/casual/shifts/available"],
    enabled: !!me,
    refetchInterval: 30000,
  });

  const { data: mine = [], isLoading: mineLoading } = useQuery<ShiftRow[]>({
    queryKey: ["/api/casual/shifts/mine"],
    enabled: !!me,
  });

  const { data: regular = [], isLoading: regularLoading } = useQuery<RegularShiftRow[]>({
    queryKey: ["/api/casual/shifts/regular"],
    enabled: !!me,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/casual/shifts/available"] });
    queryClient.invalidateQueries({ queryKey: ["/api/casual/shifts/mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/casual/me"] });
  };

  const acceptMutation = useMutation({
    mutationFn: async (s: ShiftRow) => {
      await apiRequest("POST", `/api/casual/shifts/${s.id}/claim`, { startTime: s.startTime, endTime: s.endTime });
    },
    onSuccess: () => { toast({ title: "Shift accepted!", description: "It's now in your shifts." }); refresh(); },
    onError: (err: any) => toast({ title: "Couldn't accept", description: err.message, variant: "destructive" }),
  });

  const declineMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/casual/shifts/${id}/decline`, {}); },
    onSuccess: () => { toast({ title: "Shift declined" }); refresh(); },
    onError: (err: any) => toast({ title: "Couldn't decline", description: err.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: async ({ id, startTime, endTime }: { id: string; startTime: number; endTime: number }) => {
      await apiRequest("POST", `/api/casual/shifts/${id}/claim`, { startTime, endTime });
    },
    onSuccess: () => {
      toast({ title: "Shift booked!", description: "It's now in your shifts." });
      setClaimTarget(null);
      setFlexTarget(null);
      refresh();
    },
    onError: (err: any) => toast({ title: "Couldn't book shift", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/casual/shifts/${id}/cancel`, {}); },
    onSuccess: () => { toast({ title: "Shift cancelled" }); refresh(); },
    onError: (err: any) => toast({ title: "Couldn't cancel", description: err.message, variant: "destructive" }),
  });

  const amendMutation = useMutation({
    mutationFn: async ({ id, startTime, endTime }: { id: string; startTime: number; endTime: number }) => {
      await apiRequest("POST", `/api/casual/shifts/${id}/amend`, { startTime, endTime });
    },
    onSuccess: () => { toast({ title: "Shift updated" }); setAmendTarget(null); refresh(); },
    onError: (err: any) => toast({ title: "Couldn't update", description: err.message, variant: "destructive" }),
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/casual/logout", {});
    navigate("/casual/login");
  };

  const openClaim = (shift: ShiftRow) => {
    // Flexible-start shifts slide as a whole (fixed length), so they use the
    // start-picker dialog rather than the partial-window picker.
    if (shift.startFlexMinutes && shift.startFlexMinutes > 0) {
      setStart(shift.startTime);
      setEnd(shift.endTime);
      setFlexTarget(shift);
      return;
    }
    setStart(shift.startTime);
    setEnd(shift.endTime);
    setClaimTarget(shift);
  };

  // Accepting an offered shift. If the manager allowed a flexible start, let the
  // person pick their start time first; otherwise accept it exactly as offered.
  const onAccept = (shift: ShiftRow) => {
    if (shift.startFlexMinutes && shift.startFlexMinutes > 0) {
      setStart(shift.startTime);
      setEnd(shift.endTime);
      setFlexTarget(shift);
    } else {
      acceptMutation.mutate(shift);
    }
  };

  const openAmend = (shift: ShiftRow) => {
    setStart(shift.startTime);
    setEnd(shift.endTime);
    setAmendTarget(shift);
  };

  if (meLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (meError || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Please sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/casual/login")} data-testid="button-go-login">Go to login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const limitReached = me.shiftsThisWeek >= me.weeklyLimit;

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sun className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" data-testid="text-greeting">Hi {me.firstName}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-week-count">
              {me.shiftsThisWeek}/{me.weeklyLimit} shifts booked this week
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <div className="mx-auto max-w-md p-4">
        <Tabs defaultValue="available">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="available" data-testid="tab-available">Available</TabsTrigger>
            <TabsTrigger value="regular" data-testid="tab-regular">Regular</TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-mine">My shifts</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-4 space-y-3">
            {limitReached && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>You've booked your {me.weeklyLimit} shifts for this week. You can book more next week.</span>
              </div>
            )}
            {availLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading shifts...</p>
            ) : available.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground" data-testid="text-no-available">No shifts available right now. Check back soon!</p>
            ) : (
              available.map((s) => (
                <Card key={s.id} data-testid={`card-available-${s.id}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(s.date), "EEE d MMM")}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />{s.startLabel}–{s.endLabel}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Cog className="h-3.5 w-3.5" />{s.machineName}
                      </p>
                      {s.offeredToId === me.id && (
                        <Badge className="mt-2" data-testid={`badge-offered-you-${s.id}`}>
                          <Gift className="mr-1 h-3 w-3" />Offered to you
                        </Badge>
                      )}
                    </div>
                    {s.offeredToId === me.id ? (
                      <div className="flex shrink-0 flex-col gap-2">
                        <Button size="sm" onClick={() => onAccept(s)} disabled={limitReached || acceptMutation.isPending} data-testid={`button-accept-${s.id}`}>
                          <Check className="mr-1 h-4 w-4" />Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => declineMutation.mutate(s.id)} disabled={declineMutation.isPending} data-testid={`button-decline-${s.id}`}>
                          <X className="mr-1 h-4 w-4" />Decline
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => openClaim(s)} disabled={limitReached} data-testid={`button-claim-${s.id}`}>
                        Book
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="regular" className="mt-4 space-y-3">
            {regularLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : regular.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground" data-testid="text-no-regular">
                You don't have any regular shifts. These come from your machine allocations — ask the office if you expected some here.
              </p>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>These are your regular allocated shifts for the next few weeks. They're already yours — nothing to book.</span>
                </div>
                {regular.map((s, i) => (
                  <Card key={`${s.machineId}-${s.date}-${s.startTime}-${i}`} data-testid={`card-regular-${i}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(s.date), "EEE d MMM")}
                        </p>
                        <Badge variant="secondary"><Repeat className="mr-1 h-3 w-3" />Regular</Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />{s.startLabel}–{s.endLabel}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Cog className="h-3.5 w-3.5" />{s.machineName}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-4 space-y-3">
            {mineLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : mine.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground" data-testid="text-no-mine">You haven't booked any shifts yet.</p>
            ) : (
              mine.map((s) => (
                <Card key={s.id} data-testid={`card-mine-${s.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(s.date), "EEE d MMM")}
                      </p>
                      <Badge variant="secondary">Booked</Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />{s.startLabel}–{s.endLabel}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Cog className="h-3.5 w-3.5" />{s.machineName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild data-testid={`button-calendar-${s.id}`}>
                        <a href={`/api/casual/shifts/${s.id}/calendar.ics`}>
                          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />Add to calendar
                        </a>
                      </Button>
                      {s.canModify ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openAmend(s)} data-testid={`button-amend-${s.id}`}>
                            Change hours
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(s.id)} disabled={cancelMutation.isPending} data-testid={`button-cancel-${s.id}`}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <p className="self-center text-xs text-muted-foreground">Locked — changes only allowed 4+ days ahead.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Claim dialog with partial time selection */}
      <Dialog open={!!claimTarget} onOpenChange={(o) => !o && setClaimTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Book this shift</DialogTitle>
            <DialogDescription>
              {claimTarget && `${claimTarget.machineName} · ${format(new Date(claimTarget.date), "EEE d MMM")}`}
            </DialogDescription>
          </DialogHeader>
          {claimTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                You can take the whole window or just part of it. The rest stays open for others.
              </p>
              <TimeRangePicker
                min={claimTarget.startTime}
                max={claimTarget.endTime}
                start={start}
                end={end}
                onStart={setStart}
                onEnd={setEnd}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimTarget(null)} data-testid="button-cancel-claim">Cancel</Button>
            <Button
              onClick={() => claimTarget && claimMutation.mutate({ id: claimTarget.id, startTime: start, endTime: end })}
              disabled={claimMutation.isPending || end <= start}
              data-testid="button-confirm-claim"
            >
              {claimMutation.isPending ? "Booking..." : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flexible-start accept dialog */}
      <Dialog open={!!flexTarget} onOpenChange={(o) => !o && setFlexTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pick your start time</DialogTitle>
            <DialogDescription>
              {flexTarget && `${flexTarget.machineName} · ${format(new Date(flexTarget.date), "EEE d MMM")}`}
            </DialogDescription>
          </DialogHeader>
          {flexTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                You can start up to {(flexTarget.startFlexMinutes ?? 0) / 60} hour{(flexTarget.startFlexMinutes ?? 0) / 60 === 1 ? "" : "s"} earlier or later.
                Your shift stays {Math.round((flexTarget.endTime - flexTarget.startTime) / 60 * 10) / 10} hours long, so the finish moves with it.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Start</Label>
                <Select
                  value={String(start)}
                  onValueChange={(v) => {
                    const nv = Number(v);
                    setStart(nv);
                    setEnd(nv + (flexTarget.endTime - flexTarget.startTime));
                  }}
                >
                  <SelectTrigger data-testid="select-flex-start"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const flex = flexTarget.startFlexMinutes ?? 0;
                      const dur = flexTarget.endTime - flexTarget.startTime;
                      const lo = Math.max(0, flexTarget.startTime - flex);
                      const hi = Math.min(flexTarget.startTime + flex, 1440 - dur);
                      return timeOptions(lo, hi).map((t) => (
                        <SelectItem key={t} value={String(t)}>{minutesToTime(t)}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm" data-testid="text-flex-finish">
                Finish: <span className="font-medium">{minutesToTime(end)}</span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlexTarget(null)} data-testid="button-cancel-flex">Cancel</Button>
            <Button
              onClick={() => flexTarget && claimMutation.mutate({ id: flexTarget.id, startTime: start, endTime: end })}
              disabled={claimMutation.isPending || limitReached}
              data-testid="button-confirm-flex"
            >
              {claimMutation.isPending ? "Accepting..." : "Accept shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amend dialog */}
      <Dialog open={!!amendTarget} onOpenChange={(o) => !o && setAmendTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change your hours</DialogTitle>
            <DialogDescription>
              {amendTarget && `${amendTarget.machineName} · ${format(new Date(amendTarget.date), "EEE d MMM")}`}
            </DialogDescription>
          </DialogHeader>
          {amendTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Pick new times within your current shift. Freed time goes back to others.</p>
              <TimeRangePicker
                min={amendTarget.startTime}
                max={amendTarget.endTime}
                start={start}
                end={end}
                onStart={setStart}
                onEnd={setEnd}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendTarget(null)} data-testid="button-cancel-amend">Cancel</Button>
            <Button
              onClick={() => amendTarget && amendMutation.mutate({ id: amendTarget.id, startTime: start, endTime: end })}
              disabled={amendMutation.isPending || end <= start}
              data-testid="button-confirm-amend"
            >
              {amendMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimeRangePicker({
  min, max, start, end, onStart, onEnd,
}: {
  min: number; max: number; start: number; end: number;
  onStart: (v: number) => void; onEnd: (v: number) => void;
}) {
  const starts = timeOptions(min, max - 30);
  const ends = timeOptions(start + 30, max);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Start</Label>
        <Select value={String(start)} onValueChange={(v) => {
          const nv = Number(v);
          onStart(nv);
          if (end <= nv) onEnd(Math.min(nv + 30, max));
        }}>
          <SelectTrigger data-testid="select-start"><SelectValue /></SelectTrigger>
          <SelectContent>
            {starts.map((t) => <SelectItem key={t} value={String(t)}>{minutesToTime(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">End</Label>
        <Select value={String(end)} onValueChange={(v) => onEnd(Number(v))}>
          <SelectTrigger data-testid="select-end"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ends.map((t) => <SelectItem key={t} value={String(t)}>{minutesToTime(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

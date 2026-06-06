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
import { Sun, Copy, Send, Trash2, Sparkles, Users, CalendarClock, CheckCircle2 } from "lucide-react";

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
  status: string;
  claimedByName?: string | null;
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
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Summer Shifts</h1>
            <p className="text-sm text-muted-foreground">Invite casual staff and offer machine shifts they can pick up.</p>
          </div>
        </div>

        <Tabs defaultValue="shifts">
          <TabsList>
            <TabsTrigger value="shifts" data-testid="tab-shifts"><CalendarClock className="mr-1.5 h-4 w-4" />Shifts</TabsTrigger>
            <TabsTrigger value="staff" data-testid="tab-staff"><Users className="mr-1.5 h-4 w-4" />Summer Staff</TabsTrigger>
          </TabsList>
          <TabsContent value="shifts" className="mt-4"><ShiftsTab /></TabsContent>
          <TabsContent value="staff" className="mt-4"><StaffTab /></TabsContent>
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
    onSuccess: (res: any) => { toast({ title: `Published ${res.published} shifts`, description: "Summer staff can now book them." }); refreshShifts(); },
    onError: (err: any) => toast({ title: "Couldn't publish", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/shifts/${id}`); },
    onSuccess: refreshShifts,
  });

  const discardAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(suggested.map((s) => apiRequest("DELETE", `/api/shifts/${s.id}`)));
    },
    onSuccess: () => { toast({ title: "Suggestions cleared" }); refreshShifts(); },
  });

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
              <Input id="weeks" type="number" min={1} max={8} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} data-testid="input-weeks" />
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
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-generate">
            {generateMutation.isPending ? "Generating..." : "Generate suggestions"}
          </Button>
        </CardContent>
      </Card>

      {suggested.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{suggested.length} suggested shifts</CardTitle>
              <CardDescription>Remove any you don't want, then publish the rest.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => discardAllMutation.mutate()} disabled={discardAllMutation.isPending} data-testid="button-discard-all">Discard all</Button>
              <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} data-testid="button-publish">
                {publishMutation.isPending ? "Publishing..." : "Publish all"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupByDate(suggested).map(([date, rows]) => (
              <div key={date}>
                <p className="mb-2 text-sm font-medium">{date}</p>
                <div className="space-y-1.5">
                  {rows.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5" data-testid={`row-suggested-${s.id}`}>
                      <span className="text-sm">{s.startLabel}–{s.endLabel} · <span className="text-muted-foreground">{s.machineName}</span></span>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} data-testid={`button-delete-suggested-${s.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                      <span className="text-sm">{s.startLabel}–{s.endLabel} · <span className="text-muted-foreground">{s.machineName}</span></span>
                      <div className="flex items-center gap-2">
                        {s.status === "claimed" ? (
                          <Badge variant="secondary" data-testid={`badge-claimed-${s.id}`}>{s.claimedByName || "Booked"}</Badge>
                        ) : (
                          <Badge>Available</Badge>
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
    </div>
  );
}

function StaffTab() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [inviteLink, setInviteLink] = useState<{ url: string; whatsappSent: boolean } | null>(null);

  const { data: staff = [], isLoading } = useQuery<CasualStaffRow[]>({ queryKey: ["/api/casual-staff"] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/casual-staff"] });

  const addMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/casual-staff", { firstName, lastName, mobileNumber })).json(),
    onSuccess: (res: any) => {
      setFirstName(""); setLastName(""); setMobileNumber("");
      setInviteLink({ url: res.inviteUrl, whatsappSent: res.whatsappSent });
      refresh();
    },
    onError: (err: any) => toast({ title: "Couldn't add", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/casual-staff/${id}/invite`, {})).json(),
    onSuccess: (res: any) => setInviteLink({ url: res.inviteUrl, whatsappSent: res.whatsappSent }),
    onError: (err: any) => toast({ title: "Couldn't create link", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => { await apiRequest("PATCH", `/api/casual-staff/${id}`, { active }); },
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/casual-staff/${id}`); },
    onSuccess: () => { toast({ title: "Removed" }); refresh(); },
  });

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Paste it into WhatsApp or a text message." });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add summer staff</CardTitle>
          <CardDescription>They'll get an invite link to set a PIN and start booking shifts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-4 md:items-end"
            onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="fn">First name</Label>
              <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required data-testid="input-first-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln">Last name</Label>
              <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-last-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mob">Mobile number</Label>
              <Input id="mob" type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} required placeholder="07123 456789" data-testid="input-mobile-number" />
            </div>
            <Button type="submit" disabled={addMutation.isPending} data-testid="button-add-staff">
              {addMutation.isPending ? "Adding..." : "Add & invite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-staff">No summer staff yet. Add someone above.</p>
          ) : (
            staff.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" data-testid={`row-staff-${m.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-muted-foreground">{m.mobileNumber}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.hasPin ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Awaiting PIN</Badge>}
                  {!m.active && <Badge variant="destructive">Disabled</Badge>}
                  <Button variant="outline" size="sm" onClick={() => inviteMutation.mutate(m.id)} disabled={inviteMutation.isPending} data-testid={`button-invite-${m.id}`}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />Invite link
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: m.id, active: !m.active })} data-testid={`button-toggle-${m.id}`}>
                    {m.active ? "Disable" : "Enable"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-staff-${m.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {m.firstName}?</AlertDialogTitle>
                        <AlertDialogDescription>This removes their login. Any shifts they've booked will be freed up.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(m.id)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!inviteLink} onOpenChange={(o) => !o && setInviteLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite link ready</DialogTitle>
            <DialogDescription>
              {inviteLink?.whatsappSent
                ? "We sent this via WhatsApp. You can also copy it to share another way."
                : "Copy this link and send it to them on WhatsApp or by text."}
            </DialogDescription>
          </DialogHeader>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink.url} className="text-xs" data-testid="input-invite-link" />
              <Button size="icon" onClick={() => copy(inviteLink.url)} data-testid="button-copy-link"><Copy className="h-4 w-4" /></Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setInviteLink(null)} data-testid="button-close-invite">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

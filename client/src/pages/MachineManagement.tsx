import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Machine, Staff } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Cog, Zap, Timer, Hash, WifiOff, Wifi, TrendingUp, User } from "lucide-react";
import { useState } from "react";

const NO_OPERATOR = "__none__";

const OPTIMAL_STITCH_COUNT = 7500;

const REFERENCE_STITCH_COUNTS = [
  { stitches: 5000, label: "5,000" },
  { stitches: 7500, label: "7,500", optimal: true },
  { stitches: 10000, label: "10,000" },
  { stitches: 15000, label: "15,000" },
];

function calcThroughput(
  heads: number,
  stitchesPerMinute: number,
  changeoverTimeMinutes: number,
  stitchCount: number
) {
  if (!stitchesPerMinute || !heads) return { logosPerHour: 0, runsPerHour: 0, minutesPerRun: 0 };
  const embroideryMinutes = stitchCount / stitchesPerMinute;
  const minutesPerRun = embroideryMinutes + changeoverTimeMinutes;
  const runsPerHour = 60 / minutesPerRun;
  const logosPerHour = Math.floor(runsPerHour * heads);
  return {
    logosPerHour,
    runsPerHour,
    minutesPerRun,
  };
}

function ThroughputTable({
  heads,
  stitchesPerMinute,
  changeoverTimeMinutes,
}: {
  heads: number;
  stitchesPerMinute: number;
  changeoverTimeMinutes: number;
}) {
  const optimal = calcThroughput(heads, stitchesPerMinute, changeoverTimeMinutes, OPTIMAL_STITCH_COUNT);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Throughput Estimates</span>
      </div>

      {/* Optimal highlight */}
      <div className="rounded-md bg-primary/8 border border-primary/20 px-3 py-2 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-primary">Optimal (7,500 stitches)</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {optimal.minutesPerRun.toFixed(1)} min/run · {optimal.runsPerHour.toFixed(1)} runs/hr
          </p>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold tabular-nums text-foreground">{optimal.logosPerHour}</span>
          <p className="text-xs text-muted-foreground">logos/hr</p>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Stitches</th>
              <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">Min/run</th>
              <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">Runs/hr</th>
              <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">Logos/hr</th>
            </tr>
          </thead>
          <tbody>
            {REFERENCE_STITCH_COUNTS.map(({ stitches, label, optimal: isOptimal }) => {
              const t = calcThroughput(heads, stitchesPerMinute, changeoverTimeMinutes, stitches);
              return (
                <tr
                  key={stitches}
                  className={`border-t ${isOptimal ? "bg-primary/5 font-semibold" : ""}`}
                >
                  <td className="px-2.5 py-1.5 tabular-nums">
                    {label}
                    {isOptimal && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">opt</Badge>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{t.minutesPerRun.toFixed(1)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{t.runsPerHour.toFixed(1)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{t.logosPerHour}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MachineCard({ machine, staff }: { machine: Machine; staff: Staff[] }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: machine.name,
    heads: machine.heads,
    stitchesPerMinute: machine.stitchesPerMinute,
    changeoverTimeMinutes: machine.changeoverTimeMinutes,
    notes: machine.notes ?? "",
    defaultOperatorId: machine.defaultOperatorId ?? NO_OPERATOR,
  });

  const operatorName = machine.defaultOperatorId
    ? staff.find(s => s.id === machine.defaultOperatorId)?.name ?? null
    : null;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Machine>) =>
      apiRequest("PATCH", `/api/machines/${machine.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines"] });
      setEditing(false);
      toast({ title: "Machine updated" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });

  const toggleActive = () => {
    updateMutation.mutate({ isActive: !machine.isActive });
  };

  const handleSave = () => {
    updateMutation.mutate({
      name: form.name,
      heads: Number(form.heads),
      stitchesPerMinute: Number(form.stitchesPerMinute),
      changeoverTimeMinutes: Number(form.changeoverTimeMinutes),
      notes: form.notes || null,
      defaultOperatorId: form.defaultOperatorId === NO_OPERATOR ? null : form.defaultOperatorId,
    });
  };

  const handleCancel = () => {
    setForm({
      name: machine.name,
      heads: machine.heads,
      stitchesPerMinute: machine.stitchesPerMinute,
      changeoverTimeMinutes: machine.changeoverTimeMinutes,
      notes: machine.notes ?? "",
      defaultOperatorId: machine.defaultOperatorId ?? NO_OPERATOR,
    });
    setEditing(false);
  };

  // Use live form values when editing so the table updates in real time
  const previewHeads = editing ? (Number(form.heads) || machine.heads) : machine.heads;
  const previewSpm = editing ? (Number(form.stitchesPerMinute) || machine.stitchesPerMinute) : machine.stitchesPerMinute;
  const previewChangeover = editing ? (Number(form.changeoverTimeMinutes) || 0) : machine.changeoverTimeMinutes;

  return (
    <Card data-testid={`card-machine-${machine.id}`} className={machine.isActive ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <Cog className="h-5 w-5 text-muted-foreground" />
            <span
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${machine.isActive ? "bg-green-500" : "bg-muted-foreground"}`}
            />
          </div>
          <div className="min-w-0">
            {editing ? (
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-base font-semibold h-8"
                data-testid={`input-machine-name-${machine.id}`}
              />
            ) : (
              <CardTitle className="text-base truncate">{machine.name}</CardTitle>
            )}
            <CardDescription className="mt-0.5">Machine #{machine.id}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge
            variant={machine.isActive ? "default" : "secondary"}
            className="text-xs"
            data-testid={`badge-machine-status-${machine.id}`}
          >
            {machine.isActive ? (
              <><Wifi className="h-3 w-3 mr-1" />Online</>
            ) : (
              <><WifiOff className="h-3 w-3 mr-1" />Offline</>
            )}
          </Badge>
          <Switch
            checked={machine.isActive}
            onCheckedChange={toggleActive}
            disabled={updateMutation.isPending}
            data-testid={`switch-machine-active-${machine.id}`}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Specs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" /> Heads
            </Label>
            {editing ? (
              <Input
                type="number"
                min={1}
                max={50}
                value={form.heads}
                onChange={(e) => setForm(f => ({ ...f, heads: parseInt(e.target.value) || 1 }))}
                data-testid={`input-machine-heads-${machine.id}`}
              />
            ) : (
              <p className="text-sm font-medium">{machine.heads}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" /> Stitches/min
            </Label>
            {editing ? (
              <Input
                type="number"
                min={100}
                max={5000}
                value={form.stitchesPerMinute}
                onChange={(e) => setForm(f => ({ ...f, stitchesPerMinute: parseInt(e.target.value) || 750 }))}
                data-testid={`input-machine-spm-${machine.id}`}
              />
            ) : (
              <p className="text-sm font-medium">{machine.stitchesPerMinute.toLocaleString()}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Timer className="h-3 w-3" /> Changeover (min)
            </Label>
            {editing ? (
              <Input
                type="number"
                min={0}
                max={60}
                value={form.changeoverTimeMinutes}
                onChange={(e) => setForm(f => ({ ...f, changeoverTimeMinutes: parseInt(e.target.value) || 0 }))}
                data-testid={`input-machine-changeover-${machine.id}`}
              />
            ) : (
              <p className="text-sm font-medium">{machine.changeoverTimeMinutes} min</p>
            )}
          </div>
        </div>

        {/* Default operator */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> Default operator
          </Label>
          {editing ? (
            <Select
              value={form.defaultOperatorId}
              onValueChange={(v) => setForm(f => ({ ...f, defaultOperatorId: v }))}
            >
              <SelectTrigger data-testid={`select-machine-operator-${machine.id}`}>
                <SelectValue placeholder="No default operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OPERATOR}>No default operator</SelectItem>
                {staff.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : operatorName ? (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-machine-operator-${machine.id}`}>
              <User className="h-3 w-3 mr-1" />{operatorName}
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground italic">No default operator set</p>
          )}
        </div>

        {/* Throughput estimates — update live when editing */}
        <ThroughputTable
          heads={previewHeads}
          stitchesPerMinute={previewSpm}
          changeoverTimeMinutes={previewChangeover}
        />

        {editing && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes about this machine..."
              className="resize-none text-sm"
              rows={2}
              data-testid={`textarea-machine-notes-${machine.id}`}
            />
          </div>
        )}

        {!editing && machine.notes && (
          <p className="text-xs text-muted-foreground italic">{machine.notes}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {editing ? (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                data-testid={`button-machine-save-${machine.id}`}
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
                data-testid={`button-machine-cancel-${machine.id}`}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              data-testid={`button-machine-edit-${machine.id}`}
            >
              Edit
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MachineManagement() {
  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
  });
  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const onlineMachines = machines.filter(m => m.isActive);
  const offlineCount = machines.filter(m => !m.isActive).length;

  // Fleet total at optimal stitch count
  const fleetTotal = onlineMachines.reduce((sum, m) => {
    const t = calcThroughput(m.heads, m.stitchesPerMinute, m.changeoverTimeMinutes, OPTIMAL_STITCH_COUNT);
    return sum + t.logosPerHour;
  }, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Machine Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Production capacity, speed, and availability per machine
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Fleet capacity (7,500 stitches)</p>
            <p className="text-lg font-bold tabular-nums">
              {fleetTotal} <span className="text-sm font-normal text-muted-foreground">logos/hr</span>
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
              <span className="text-muted-foreground">{onlineMachines.length} online</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
              <span className="text-muted-foreground">{offlineCount} offline</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
        <strong className="text-foreground">How estimates work:</strong> Each run = (stitch count ÷ stitches/min) + changeover time. Logos/hr = runs/hr × heads. The <strong className="text-foreground">7,500 stitch optimal</strong> is the standard reference point — at 750 stitches/min with 3 min changeover that gives 4.6 runs/hr.
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-80 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {machines.map(machine => (
            <MachineCard key={machine.id} machine={machine} staff={staff} />
          ))}
        </div>
      )}
    </div>
  );
}

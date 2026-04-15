import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Machine } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Cog, Zap, Timer, Hash, WifiOff, Wifi } from "lucide-react";
import { useState } from "react";

function MachineCard({ machine }: { machine: Machine }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: machine.name,
    heads: machine.heads,
    stitchesPerMinute: machine.stitchesPerMinute,
    changeoverTimeMinutes: machine.changeoverTimeMinutes,
    notes: machine.notes ?? "",
  });

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
    });
  };

  const handleCancel = () => {
    setForm({
      name: machine.name,
      heads: machine.heads,
      stitchesPerMinute: machine.stitchesPerMinute,
      changeoverTimeMinutes: machine.changeoverTimeMinutes,
      notes: machine.notes ?? "",
    });
    setEditing(false);
  };

  return (
    <Card data-testid={`card-machine-${machine.id}`} className={machine.isActive ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cog className="h-5 w-5 text-muted-foreground" />
            <span
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${machine.isActive ? "bg-green-500" : "bg-muted-foreground"}`}
            />
          </div>
          <div>
            {editing ? (
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-base font-semibold h-8"
                data-testid={`input-machine-name-${machine.id}`}
              />
            ) : (
              <CardTitle className="text-base">{machine.name}</CardTitle>
            )}
            <CardDescription className="mt-0.5">
              Machine #{machine.id}
            </CardDescription>
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

  const onlineCount = machines.filter(m => m.isActive).length;
  const offlineCount = machines.filter(m => !m.isActive).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Machine Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage production capacity and machine availability
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-muted-foreground">{onlineCount} online</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground inline-block" />
            <span className="text-muted-foreground">{offlineCount} offline</span>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
        <strong className="text-foreground">How this affects scheduling:</strong> Offline machines are excluded from automatic job scheduling and the machine suggestion system. The number of heads and stitch speed are used to calculate production time estimates.
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-48 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map(machine => (
            <MachineCard key={machine.id} machine={machine} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MachineBadge } from "@/components/MachineBadge";
import { CheckCircle2, Users, X, Plus } from "lucide-react";
import { calculateProductionMetrics } from "@shared/machines";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JobLineItem, Staff } from "@shared/schema";

export interface BulkCompleteItem {
  lineItem: JobLineItem;
  jobName: string;
  customerName: string;
  defaultOperatorId: string | null;
}

interface BulkCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BulkCompleteItem[];
  staff: Staff[];
  onSuccess?: () => void;
}

interface ContributorRow {
  staffId: string;
  quantity: string;
  minutes: string;
}

function estimatedMinutes(li: JobLineItem): number | null {
  const metrics = calculateProductionMetrics(li.quantity, li.stitchCount, li.machineId);
  return metrics ? metrics.totalTimeMinutes : null;
}

export function BulkCompleteDialog({
  open,
  onOpenChange,
  items,
  staff,
  onSuccess,
}: BulkCompleteDialogProps) {
  const { toast } = useToast();
  const [operatorId, setOperatorId] = useState<string>("");
  const [times, setTimes] = useState<Record<string, string>>({});
  // Per-line-item team split: when present, that item is completed by several
  // members, each credited their own quantity + time.
  const [splits, setSplits] = useState<Record<string, ContributorRow[]>>({});
  const [submitting, setSubmitting] = useState(false);

  // When the dialog opens, seed the operator (if every item shares one) and
  // pre-fill each time field with the system's estimate so common cases are a
  // single click.
  useEffect(() => {
    if (!open) return;
    const operatorIds = Array.from(
      new Set(items.map((i) => i.defaultOperatorId).filter((id): id is string => !!id))
    );
    setOperatorId(operatorIds.length === 1 ? operatorIds[0] : "");
    const seeded: Record<string, string> = {};
    for (const i of items) {
      const est = estimatedMinutes(i.lineItem);
      seeded[i.lineItem.id] = est != null ? String(est) : "";
    }
    setTimes(seeded);
    setSplits({});
  }, [open, items]);

  const sortedStaff = staff.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));

  const toggleSplit = (item: BulkCompleteItem) => {
    setSplits((prev) => {
      const next = { ...prev };
      if (next[item.lineItem.id]) {
        delete next[item.lineItem.id];
      } else {
        const est = times[item.lineItem.id] ?? "";
        next[item.lineItem.id] = [
          {
            staffId: operatorId || item.defaultOperatorId || "",
            quantity: String(item.lineItem.quantity),
            minutes: est,
          },
          { staffId: "", quantity: "", minutes: "" },
        ];
      }
      return next;
    });
  };

  const updateSplitRow = (
    lineItemId: string,
    index: number,
    field: keyof ContributorRow,
    value: string
  ) => {
    setSplits((prev) => {
      const rows = prev[lineItemId] ? [...prev[lineItemId]] : [];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [lineItemId]: rows };
    });
  };

  const addSplitRow = (lineItemId: string) => {
    setSplits((prev) => ({
      ...prev,
      [lineItemId]: [...(prev[lineItemId] || []), { staffId: "", quantity: "", minutes: "" }],
    }));
  };

  const removeSplitRow = (lineItemId: string, index: number) => {
    setSplits((prev) => {
      const rows = (prev[lineItemId] || []).filter((_, i) => i !== index);
      if (rows.length === 0) {
        const next = { ...prev };
        delete next[lineItemId];
        return next;
      }
      return { ...prev, [lineItemId]: rows };
    });
  };

  const splitQtyTotal = (lineItemId: string) =>
    (splits[lineItemId] || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  const splitValid = (item: BulkCompleteItem) => {
    const rows = splits[item.lineItem.id];
    if (!rows || rows.length === 0) return false;
    for (const r of rows) {
      const q = Number(r.quantity);
      const m = Number(r.minutes);
      if (!r.staffId || !Number.isFinite(q) || q <= 0 || !Number.isFinite(m) || m <= 0) {
        return false;
      }
    }
    return splitQtyTotal(item.lineItem.id) === item.lineItem.quantity;
  };

  const nonSplitItems = items.filter((i) => !splits[i.lineItem.id]);
  const allNonSplitTimesValid = nonSplitItems.every((i) => {
    const v = times[i.lineItem.id];
    const n = Number(v);
    return v !== "" && Number.isFinite(n) && n > 0;
  });
  const allSplitsValid = items.filter((i) => splits[i.lineItem.id]).every(splitValid);
  const operatorOk = nonSplitItems.length === 0 || !!operatorId;
  const canSubmit =
    operatorOk && items.length > 0 && allNonSplitTimesValid && allSplitsValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const completedAt = new Date().toISOString();
    let completed = 0;
    const failures: string[] = [];

    for (const item of items) {
      const rows = splits[item.lineItem.id];
      try {
        if (rows) {
          await apiRequest("PATCH", `/api/job-line-items/${item.lineItem.id}`, {
            completed: true,
            completedAt,
            contributors: rows.map((r) => ({
              staffId: r.staffId,
              quantity: Math.round(Number(r.quantity)),
              minutes: Math.round(Number(r.minutes)),
            })),
          });
        } else {
          const minutes = Math.round(Number(times[item.lineItem.id]));
          await apiRequest("PATCH", `/api/job-line-items/${item.lineItem.id}`, {
            completed: true,
            completedById: operatorId,
            actualProductionTimeMinutes: minutes,
            completedAt,
          });
        }
        completed++;
      } catch (e) {
        failures.push(`${item.customerName} — ${item.jobName}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    setSubmitting(false);

    const failureList =
      failures.length > 3
        ? `${failures.slice(0, 3).join("; ")} and ${failures.length - 3} more`
        : failures.join("; ");

    toast({
      title: failures.length ? "Partially completed" : "Success",
      description: failures.length
        ? `Completed ${completed} item${completed !== 1 ? "s" : ""}, ${failures.length} failed: ${failureList}`
        : `Marked ${completed} line item${completed !== 1 ? "s" : ""} as complete.`,
      variant: failures.length ? "destructive" : undefined,
    });

    if (!failures.length) {
      onSuccess?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-bulk-complete">
        <DialogHeader>
          <DialogTitle>
            Complete {items.length} line item{items.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Pick the operator who completed these, confirm each production time, then mark
            them all complete in one go. Times are pre-filled with the estimate — adjust any
            that differ. Use "Team" to split an item between several members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-complete-operator">Completed by (operator)</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger id="bulk-complete-operator" data-testid="select-bulk-operator">
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                {sortedStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id} data-testid={`option-operator-${s.id}`}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
            {items.map((item) => {
              const rows = splits[item.lineItem.id];
              const qtyTotal = splitQtyTotal(item.lineItem.id);
              const qtyRemaining = item.lineItem.quantity - qtyTotal;
              return (
                <div
                  key={item.lineItem.id}
                  className="p-3 space-y-2"
                  data-testid={`row-bulk-complete-${item.lineItem.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.jobName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.customerName} • Qty {item.lineItem.quantity}
                        {item.lineItem.description ? ` • ${item.lineItem.description}` : ""}
                      </div>
                    </div>
                    <MachineBadge machineId={item.lineItem.machineId} />
                    {!rows && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={times[item.lineItem.id] ?? ""}
                          onChange={(e) =>
                            setTimes((prev) => ({ ...prev, [item.lineItem.id]: e.target.value }))
                          }
                          className="w-20 text-right font-mono"
                          data-testid={`input-time-${item.lineItem.id}`}
                        />
                        <span className="text-xs text-muted-foreground">mins</span>
                      </div>
                    )}
                    <Button
                      variant={rows ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => toggleSplit(item)}
                      data-testid={`button-split-${item.lineItem.id}`}
                    >
                      <Users className="h-4 w-4 mr-1" />
                      Team
                    </Button>
                  </div>

                  {rows && (
                    <div className="rounded-md bg-muted/50 p-2 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        Split between team members — each gets their own quantity and time.
                        {qtyRemaining !== 0 && (
                          <span className={qtyRemaining > 0 ? " text-amber-600 dark:text-amber-400" : " text-destructive"}>
                            {" "}
                            {qtyRemaining > 0
                              ? `${qtyRemaining} of ${item.lineItem.quantity} still to allocate.`
                              : `${-qtyRemaining} over the quantity of ${item.lineItem.quantity}.`}
                          </span>
                        )}
                      </div>
                      {rows.map((row, index) => (
                        <div
                          key={index}
                          className="flex flex-wrap items-center gap-1.5"
                          data-testid={`row-contributor-${item.lineItem.id}-${index}`}
                        >
                          <div className="min-w-[140px] flex-1">
                            <Select
                              value={row.staffId}
                              onValueChange={(v) => updateSplitRow(item.lineItem.id, index, "staffId", v)}
                            >
                              <SelectTrigger data-testid={`select-contributor-staff-${item.lineItem.id}-${index}`}>
                                <SelectValue placeholder="Team member" />
                              </SelectTrigger>
                              <SelectContent>
                                {sortedStaff.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Qty"
                            value={row.quantity}
                            onChange={(e) => updateSplitRow(item.lineItem.id, index, "quantity", e.target.value)}
                            className="w-20 text-right font-mono"
                            data-testid={`input-contributor-qty-${item.lineItem.id}-${index}`}
                          />
                          <Input
                            type="number"
                            min={1}
                            placeholder="Mins"
                            value={row.minutes}
                            onChange={(e) => updateSplitRow(item.lineItem.id, index, "minutes", e.target.value)}
                            className="w-20 text-right font-mono"
                            data-testid={`input-contributor-mins-${item.lineItem.id}-${index}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSplitRow(item.lineItem.id, index)}
                            data-testid={`button-remove-contributor-${item.lineItem.id}-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addSplitRow(item.lineItem.id)}
                        data-testid={`button-add-contributor-${item.lineItem.id}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add member
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            data-testid="button-bulk-complete-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="button-bulk-complete-confirm"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {submitting
              ? "Completing…"
              : `Mark ${items.length} complete`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

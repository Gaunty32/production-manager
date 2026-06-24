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
import { CheckCircle2 } from "lucide-react";
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
  }, [open, items]);

  const sortedStaff = [...staff].sort((a, b) => a.name.localeCompare(b.name));

  const allTimesValid = items.every((i) => {
    const v = times[i.lineItem.id];
    const n = Number(v);
    return v !== "" && Number.isFinite(n) && n > 0;
  });
  const canSubmit = !!operatorId && items.length > 0 && allTimesValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const completedAt = new Date().toISOString();
    let completed = 0;
    const failures: string[] = [];

    for (const item of items) {
      const minutes = Math.round(Number(times[item.lineItem.id]));
      try {
        await apiRequest("PATCH", `/api/job-line-items/${item.lineItem.id}`, {
          completed: true,
          completedById: operatorId,
          actualProductionTimeMinutes: minutes,
          completedAt,
        });
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
            that differ.
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
            {items.map((item) => (
              <div
                key={item.lineItem.id}
                className="flex items-center gap-3 p-3"
                data-testid={`row-bulk-complete-${item.lineItem.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.jobName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.customerName} • Qty {item.lineItem.quantity}
                    {item.lineItem.description ? ` • ${item.lineItem.description}` : ""}
                  </div>
                </div>
                <MachineBadge machineId={item.lineItem.machineId} />
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
              </div>
            ))}
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

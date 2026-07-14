import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MachineBadge } from "@/components/MachineBadge";
import { CheckCircle2, Users, X, Plus, AlertTriangle } from "lucide-react";
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

interface TimeRange {
  start: string;
  finish: string;
}

interface ContributorRow {
  staffId: string;
  quantity: string;
  start: string;
  finish: string;
}

interface LineItemProgress {
  totalQuantityCompleted: number;
  totalMinutes: number;
}

function estimatedMinutes(li: JobLineItem): number | null {
  const metrics = calculateProductionMetrics(li.quantity, li.stitchCount, li.machineId);
  return metrics ? metrics.totalTimeMinutes : null;
}

// Minutes between two HH:MM clock times on the same day. Returns null when
// either value is missing or the finish isn't after the start.
export function minutesBetween(start: string, finish: string): number | null {
  if (!start || !finish) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [fh, fm] = finish.split(":").map(Number);
  if (![sh, sm, fh, fm].every(Number.isFinite)) return null;
  const s = sh * 60 + sm;
  const f = fh * 60 + fm;
  if (f === s) return null;
  // Overnight span: finishing "earlier" than the start means the shift crossed midnight.
  return f > s ? f - s : f - s + 24 * 60;
}

// Flags production times that look wrong against the system estimate:
// exactly the estimate (probably copied), or wildly above/below it.
export function suspiciousReason(minutes: number, est: number | null): string | null {
  if (est == null || est <= 0) return null;
  if (minutes === est) return "exactly matches the estimate";
  if (minutes > est * 2) return `more than double the estimate (${est} min)`;
  if (minutes < est * 0.5) return `less than half the estimate (${est} min)`;
  return null;
}

export function fmtMins(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  // Per-line-item start/finish clock times. Deliberately NOT pre-filled with
  // the estimate — real times must come from the worksheet.
  const [ranges, setRanges] = useState<Record<string, TimeRange>>({});
  // Per-line-item team split: when present, that item is completed by several
  // members, each credited their own quantity + time.
  const [splits, setSplits] = useState<Record<string, ContributorRow[]>>({});
  // Per-line-item "part complete" flag: record the team's progress as partial
  // production entries but leave the line item open.
  const [partials, setPartials] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  // Suspicious-time acknowledgement: first submit click shows the warnings,
  // second click ("Save anyway") goes through.
  const [warned, setWarned] = useState(false);

  // Partial production already recorded against each line item (possibly by
  // several people). Team splits must validate against what's REMAINING, not
  // the full quantity, or part-completed items can never be finished.
  const progressQueries = useQueries({
    queries: items.map((i) => ({
      queryKey: ["/api/line-items", i.lineItem.id, "progress"] as const,
      enabled: open,
      // Always fetch fresh remaining quantities when the dialog opens — the
      // app-wide default of staleTime: Infinity would otherwise show stale
      // progress after someone else records work.
      staleTime: 0,
      refetchOnMount: "always" as const,
    })),
  });
  const recordedByItem: Record<string, number> = {};
  items.forEach((i, idx) => {
    const data = progressQueries[idx]?.data as LineItemProgress | undefined;
    recordedByItem[i.lineItem.id] = data?.totalQuantityCompleted ?? 0;
  });
  const remainingFor = (item: BulkCompleteItem) =>
    Math.max(0, item.lineItem.quantity - (recordedByItem[item.lineItem.id] ?? 0));

  // When the dialog opens, seed the operator (if every item shares one) and
  // clear all time fields — times must be typed in from the worksheet.
  useEffect(() => {
    if (!open) return;
    const operatorIds = Array.from(
      new Set(items.map((i) => i.defaultOperatorId).filter((id): id is string => !!id))
    );
    setOperatorId(operatorIds.length === 1 ? operatorIds[0] : "");
    setRanges({});
    setSplits({});
    setPartials({});
    setWarned(false);
  }, [open, items]);

  const sortedStaff = staff.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));

  const setRange = (lineItemId: string, field: keyof TimeRange, value: string) => {
    setWarned(false);
    setRanges((prev) => {
      const existing = prev[lineItemId] ?? { start: "", finish: "" };
      return { ...prev, [lineItemId]: { ...existing, [field]: value } };
    });
  };

  const toggleSplit = (item: BulkCompleteItem) => {
    setWarned(false);
    setSplits((prev) => {
      const next = { ...prev };
      if (next[item.lineItem.id]) {
        delete next[item.lineItem.id];
        setPartials((p) => {
          const np = { ...p };
          delete np[item.lineItem.id];
          return np;
        });
      } else {
        const range = ranges[item.lineItem.id];
        next[item.lineItem.id] = [
          {
            staffId: operatorId || item.defaultOperatorId || "",
            quantity: String(remainingFor(item)),
            start: range?.start ?? "",
            finish: range?.finish ?? "",
          },
          { staffId: "", quantity: "", start: "", finish: "" },
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
    setWarned(false);
    setSplits((prev) => {
      const rows = prev[lineItemId] ? [...prev[lineItemId]] : [];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [lineItemId]: rows };
    });
  };

  const addSplitRow = (lineItemId: string) => {
    setSplits((prev) => ({
      ...prev,
      [lineItemId]: [...(prev[lineItemId] || []), { staffId: "", quantity: "", start: "", finish: "" }],
    }));
  };

  const removeSplitRow = (lineItemId: string, index: number) => {
    setWarned(false);
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
      const m = minutesBetween(r.start, r.finish);
      if (!r.staffId || !Number.isFinite(q) || q <= 0 || m == null || m <= 0) {
        return false;
      }
    }
    const total = splitQtyTotal(item.lineItem.id);
    const remaining = remainingFor(item);
    if (partials[item.lineItem.id]) {
      // Part complete: any amount up to what's remaining is fine.
      return total > 0 && total <= remaining;
    }
    // Full completion: the split must cover exactly what's left to produce.
    return total === remaining;
  };

  const nonSplitItems = items.filter((i) => !splits[i.lineItem.id]);
  const nonSplitMinutes = (item: BulkCompleteItem): number | null => {
    const r = ranges[item.lineItem.id];
    return r ? minutesBetween(r.start, r.finish) : null;
  };
  const allNonSplitTimesValid = nonSplitItems.every((i) => {
    const m = nonSplitMinutes(i);
    return m != null && m > 0;
  });
  const allSplitsValid = items.filter((i) => splits[i.lineItem.id]).every(splitValid);
  const operatorOk = nonSplitItems.length === 0 || !!operatorId;
  const canSubmit =
    operatorOk && items.length > 0 && allNonSplitTimesValid && allSplitsValid && !submitting;

  // Suspicious-time check across all items (only when everything is valid).
  const suspiciousItems: { label: string; reason: string }[] = [];
  if (allNonSplitTimesValid && allSplitsValid) {
    for (const item of items) {
      const est = estimatedMinutes(item.lineItem);
      const rows = splits[item.lineItem.id];
      if (rows) {
        const totalMins = rows.reduce((s, r) => s + (minutesBetween(r.start, r.finish) ?? 0), 0);
        const reason = suspiciousReason(totalMins, est);
        if (reason) suspiciousItems.push({ label: `${item.customerName} — ${item.jobName}`, reason: `${fmtMins(totalMins)} ${reason}` });
      } else {
        const mins = nonSplitMinutes(item);
        if (mins != null) {
          const reason = suspiciousReason(mins, est);
          if (reason) suspiciousItems.push({ label: `${item.customerName} — ${item.jobName}`, reason: `${fmtMins(mins)} ${reason}` });
        }
      }
    }
  }

  const partialCount = items.filter((i) => splits[i.lineItem.id] && partials[i.lineItem.id]).length;
  const completeCount = items.length - partialCount;

  const submitLabel = submitting
    ? "Saving…"
    : warned && suspiciousItems.length > 0
      ? "Save anyway"
      : partialCount > 0 && completeCount > 0
        ? `Complete ${completeCount}, record progress on ${partialCount}`
        : partialCount > 0
          ? `Record progress on ${partialCount} item${partialCount !== 1 ? "s" : ""}`
          : `Mark ${items.length} complete`;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    // Suspicious times need an explicit second click to go through.
    if (suspiciousItems.length > 0 && !warned) {
      setWarned(true);
      return;
    }
    setSubmitting(true);
    const completedAt = new Date().toISOString();
    const workDate = format(new Date(), "yyyy-MM-dd");
    let completed = 0;
    let progressed = 0;
    const failures: string[] = [];

    for (const item of items) {
      const rows = splits[item.lineItem.id];
      try {
        if (rows && partials[item.lineItem.id]) {
          // Part complete: record each member's work as a partial production
          // entry. The line item stays open.
          for (const r of rows) {
            await apiRequest("POST", "/api/production-entries", {
              lineItemId: item.lineItem.id,
              staffId: r.staffId,
              machineId: item.lineItem.machineId ?? null,
              workDate,
              quantityCompleted: Math.round(Number(r.quantity)),
              productionTimeMinutes: minutesBetween(r.start, r.finish) ?? 0,
              notes: null,
            });
          }
          progressed++;
          queryClient.invalidateQueries({ queryKey: ["/api/line-items", item.lineItem.id, "progress"] });
          queryClient.invalidateQueries({ queryKey: ["/api/line-items", item.lineItem.id, "production-entries"] });
        } else if (rows) {
          await apiRequest("PATCH", `/api/job-line-items/${item.lineItem.id}`, {
            completed: true,
            completedAt,
            contributors: rows.map((r) => ({
              staffId: r.staffId,
              quantity: Math.round(Number(r.quantity)),
              minutes: minutesBetween(r.start, r.finish) ?? 0,
            })),
          });
          completed++;
        } else {
          const minutes = nonSplitMinutes(item) ?? 0;
          await apiRequest("PATCH", `/api/job-line-items/${item.lineItem.id}`, {
            completed: true,
            completedById: operatorId,
            actualProductionTimeMinutes: minutes,
            completedAt,
          });
          completed++;
        }
      } catch (e) {
        failures.push(`${item.customerName} — ${item.jobName}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production-entries"] });
    setSubmitting(false);

    const failureList =
      failures.length > 3
        ? `${failures.slice(0, 3).join("; ")} and ${failures.length - 3} more`
        : failures.join("; ");

    const successParts: string[] = [];
    if (completed > 0) successParts.push(`Marked ${completed} line item${completed !== 1 ? "s" : ""} as complete`);
    if (progressed > 0) successParts.push(`recorded partial progress on ${progressed} item${progressed !== 1 ? "s" : ""}`);

    toast({
      title: failures.length ? "Some items failed" : "Success",
      description: failures.length
        ? `${successParts.join(", ") || "Nothing saved"}. ${failures.length} failed: ${failureList}`
        : `${successParts.join(", ")}.`,
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
            Pick the operator, then enter the start and finish times from the worksheet for
            each item — the system works out the production time. Use "Team" to split an
            item between several members, and tick "Part complete" if the team only
            finished some of it.
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
              const isPartial = !!partials[item.lineItem.id];
              const recorded = recordedByItem[item.lineItem.id] ?? 0;
              const remaining = remainingFor(item);
              const qtyTotal = splitQtyTotal(item.lineItem.id);
              const qtyRemaining = remaining - qtyTotal;
              const est = estimatedMinutes(item.lineItem);
              const range = ranges[item.lineItem.id];
              const mins = nonSplitMinutes(item);
              const invalidRange = !!range?.start && !!range?.finish && mins == null;
              return (
                <div
                  key={item.lineItem.id}
                  className="p-3 space-y-2"
                  data-testid={`row-bulk-complete-${item.lineItem.id}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.jobName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.customerName} • Qty {item.lineItem.quantity}
                        {recorded > 0 ? ` • ${recorded} already recorded, ${remaining} remaining` : ""}
                        {item.lineItem.description ? ` • ${item.lineItem.description}` : ""}
                      </div>
                    </div>
                    <MachineBadge machineId={item.lineItem.machineId} />
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

                  {!rows && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14">Started</span>
                      <Input
                        type="time"
                        value={range?.start ?? ""}
                        onChange={(e) => setRange(item.lineItem.id, "start", e.target.value)}
                        className="w-28 font-mono"
                        data-testid={`input-start-${item.lineItem.id}`}
                      />
                      <span className="text-xs text-muted-foreground">Finished</span>
                      <Input
                        type="time"
                        value={range?.finish ?? ""}
                        onChange={(e) => setRange(item.lineItem.id, "finish", e.target.value)}
                        className="w-28 font-mono"
                        data-testid={`input-finish-${item.lineItem.id}`}
                      />
                      <span
                        className={`text-xs ${invalidRange ? "text-destructive" : mins != null ? "font-medium" : "text-muted-foreground"}`}
                        data-testid={`text-duration-${item.lineItem.id}`}
                      >
                        {invalidRange
                          ? "Start and finish can't be the same"
                          : mins != null
                            ? `= ${fmtMins(mins)}`
                            : est != null
                              ? `est. ${fmtMins(est)}`
                              : ""}
                        {mins != null && est != null ? (
                          <span className="text-muted-foreground font-normal"> (est. {fmtMins(est)})</span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {rows && (
                    <div className="rounded-md bg-muted/50 p-2 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        Split between team members — each gets their own quantity and start/finish times.
                        {est != null && <span> Estimate for the whole item: {fmtMins(est)}.</span>}
                        {!isPartial && qtyRemaining !== 0 && (
                          <span className={qtyRemaining > 0 ? " text-amber-600 dark:text-amber-400" : " text-destructive"}>
                            {" "}
                            {qtyRemaining > 0
                              ? `${qtyRemaining} of ${remaining} still to allocate.`
                              : `${-qtyRemaining} over the remaining quantity of ${remaining}.`}
                          </span>
                        )}
                        {isPartial && qtyRemaining < 0 && (
                          <span className="text-destructive">
                            {" "}
                            {`${-qtyRemaining} over the remaining quantity of ${remaining}.`}
                          </span>
                        )}
                      </div>
                      {rows.map((row, index) => {
                        const rowMins = minutesBetween(row.start, row.finish);
                        const rowInvalid = !!row.start && !!row.finish && rowMins == null;
                        return (
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
                              type="time"
                              value={row.start}
                              onChange={(e) => updateSplitRow(item.lineItem.id, index, "start", e.target.value)}
                              className="w-28 font-mono"
                              title="Start time"
                              data-testid={`input-contributor-start-${item.lineItem.id}-${index}`}
                            />
                            <Input
                              type="time"
                              value={row.finish}
                              onChange={(e) => updateSplitRow(item.lineItem.id, index, "finish", e.target.value)}
                              className="w-28 font-mono"
                              title="Finish time"
                              data-testid={`input-contributor-finish-${item.lineItem.id}-${index}`}
                            />
                            <span className="text-xs w-16 text-right">
                              {rowInvalid ? (
                                <span className="text-destructive">Invalid</span>
                              ) : rowMins != null ? (
                                fmtMins(rowMins)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSplitRow(item.lineItem.id, index)}
                              data-testid={`button-remove-contributor-${item.lineItem.id}-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addSplitRow(item.lineItem.id)}
                          data-testid={`button-add-contributor-${item.lineItem.id}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add member
                        </Button>
                        <label
                          className="flex items-center gap-2 text-xs cursor-pointer select-none"
                          data-testid={`label-partial-${item.lineItem.id}`}
                        >
                          <Checkbox
                            checked={isPartial}
                            onCheckedChange={(v) =>
                              setPartials((prev) => ({ ...prev, [item.lineItem.id]: v === true }))
                            }
                            data-testid={`checkbox-partial-${item.lineItem.id}`}
                          />
                          Part complete — save progress but leave the item open
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {warned && suspiciousItems.length > 0 && (
            <div
              className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-1"
              data-testid="warning-suspicious-times"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Please double-check these times
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                {suspiciousItems.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.label}</span>: {s.reason}
                  </li>
                ))}
              </ul>
              <div className="text-xs text-muted-foreground">
                If the times are right, press "Save anyway".
              </div>
            </div>
          )}
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
            variant={warned && suspiciousItems.length > 0 ? "destructive" : "default"}
            data-testid="button-bulk-complete-confirm"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

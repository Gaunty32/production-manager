import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DemoText } from "@/components/DemoText";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { Gauge, Clock, Package, ClipboardList } from "lucide-react";
import type { Staff } from "@shared/schema";

interface ProductivityRow {
  workDate: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  description: string | null;
  jobType: string;
  stitchCount: number;
  machineId: number | null;
  machineName: string | null;
  quantity: number;
  actualMinutes: number;
  expectedMinutes: number | null;
  efficiencyPercent: number | null;
  source: "entry" | "completion";
}

interface ProductivityData {
  staff: { id: string; name: string } | null;
  summary: {
    sessions: number;
    itemsWorked: number;
    totalQuantity: number;
    totalActualMinutes: number;
    comparableActualMinutes: number;
    comparableExpectedMinutes: number;
    efficiencyPercent: number | null;
  };
  rows: ProductivityRow[];
}

function safeFormatDate(dateStr: string, fmt: string): string {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, fmt);
  } catch {
    return dateStr;
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function efficiencyBadge(pct: number | null) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const cls = pct >= 100
    ? "text-green-600 dark:text-green-400"
    : pct >= 80
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return <Badge variant="outline" className={cls}>{pct}%</Badge>;
}

type Preset = "this-week" | "last-week" | "last-4-weeks" | "this-month" | "last-month" | "custom";

function presetRange(preset: Preset): { start: string; end: string } | null {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "this-week":
      return { start: fmt(startOfWeek(now, { weekStartsOn: 1 })), end: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case "last-week": {
      const lw = subWeeks(now, 1);
      return { start: fmt(startOfWeek(lw, { weekStartsOn: 1 })), end: fmt(endOfWeek(lw, { weekStartsOn: 1 })) };
    }
    case "last-4-weeks":
      return { start: fmt(startOfWeek(subWeeks(now, 3), { weekStartsOn: 1 })), end: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case "this-month":
      return { start: fmt(startOfMonth(now)), end: fmt(endOfMonth(now)) };
    case "last-month": {
      const lm = subMonths(now, 1);
      return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)) };
    }
    default:
      return null;
  }
}

export function StaffProductivityTab() {
  const [staffId, setStaffId] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("last-week");
  const defaultRange = presetRange("last-week")!;
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Historical report: leavers (disabled staff) are still selectable, labelled clearly
  const sortedStaff = [...staffList].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const enabled = !!staffId && !!startDate && !!endDate && startDate <= endDate;

  const { data, isLoading, isError } = useQuery<ProductivityData>({
    queryKey: ["/api/reports/staff-productivity", { staffId, startDate, endDate }],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/staff-productivity?staffId=${encodeURIComponent(staffId)}&startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load productivity report");
      return res.json();
    },
    enabled,
    placeholderData: (prev) => prev,
  });

  const handlePreset = (value: Preset) => {
    setPreset(value);
    const range = presetRange(value);
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Staff Productivity Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="w-52" data-testid="select-productivity-staff">
                  <SelectValue placeholder="Choose staff member" />
                </SelectTrigger>
                <SelectContent>
                  {sortedStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id} data-testid={`option-staff-${s.id}`}>
                      {s.name}{s.active === false ? " (disabled)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={preset} onValueChange={(v) => handlePreset(v as Preset)}>
                <SelectTrigger className="w-40" data-testid="select-productivity-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-week">This week</SelectItem>
                  <SelectItem value="last-week">Last week</SelectItem>
                  <SelectItem value="last-4-weeks">Last 4 weeks</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                  <SelectItem value="custom">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPreset("custom"); }}
                className="w-40"
                data-testid="input-productivity-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPreset("custom"); }}
                className="w-40"
                data-testid="input-productivity-end"
              />
            </div>
          </div>
          {startDate > endDate && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">Start date must be before end date.</p>
          )}
        </CardContent>
      </Card>

      {!staffId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground" data-testid="text-productivity-empty">
            Choose a staff member to see their productivity report.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : isError || !data ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Could not load the productivity report. Please try again.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-productivity-efficiency">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    summary?.efficiencyPercent == null
                      ? "text-muted-foreground"
                      : summary.efficiencyPercent >= 100
                        ? "text-green-600 dark:text-green-400"
                        : summary.efficiencyPercent >= 80
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                  }`}
                  data-testid="text-productivity-efficiency"
                >
                  {summary?.efficiencyPercent != null ? `${summary.efficiencyPercent}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">Expected vs actual time (100%+ = on or ahead of target)</p>
              </CardContent>
            </Card>
            <Card data-testid="card-productivity-output">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Output</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-productivity-output">
                  {(summary?.totalQuantity ?? 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Items produced across {summary?.itemsWorked ?? 0} worksheet{(summary?.itemsWorked ?? 0) === 1 ? "" : "s"}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-productivity-actual">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Time Worked</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-productivity-actual">
                  {formatMinutes(summary?.totalActualMinutes ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">Recorded production time</p>
              </CardContent>
            </Card>
            <Card data-testid="card-productivity-expected">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Expected Time</CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-productivity-expected">
                  {formatMinutes(summary?.comparableExpectedMinutes ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Target for that output{(summary?.comparableActualMinutes ?? 0) !== (summary?.totalActualMinutes ?? 0)
                    ? ` (vs ${formatMinutes(summary?.comparableActualMinutes ?? 0)} comparable time)`
                    : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Worksheets — {data.staff?.name}, {safeFormatDate(startDate, "d MMM")} to {safeFormatDate(endDate, "d MMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4" data-testid="text-no-productivity-rows">
                  No recorded work for this staff member in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead className="text-right">Stitches</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row, i) => (
                        <TableRow key={i} data-testid={`row-productivity-${i}`}>
                          <TableCell className="whitespace-nowrap">{safeFormatDate(row.workDate, "d MMM")}</TableCell>
                          <TableCell className="font-medium">
                            {row.jobNumber != null ? `#${row.jobNumber} · ` : ""}{row.jobName}
                            {row.description ? <span className="text-muted-foreground"> — {row.description}</span> : null}
                          </TableCell>
                          <TableCell><DemoText>{row.customerName}</DemoText></TableCell>
                          <TableCell>{row.machineName ?? "—"}</TableCell>
                          <TableCell className="text-right">{row.stitchCount > 0 ? row.stitchCount.toLocaleString() : "—"}</TableCell>
                          <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.actualMinutes > 0 ? formatMinutes(row.actualMinutes) : "—"}</TableCell>
                          <TableCell className="text-right">{row.expectedMinutes != null ? formatMinutes(row.expectedMinutes) : "—"}</TableCell>
                          <TableCell className="text-right">{efficiencyBadge(row.efficiencyPercent)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Expected time uses the same formula as the Accuracy tab (stitch count, machine speed, heads and changeover time), scaled to the quantity produced in each session. Rows without a stitch count or machine can't be measured and are excluded from the efficiency figure.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

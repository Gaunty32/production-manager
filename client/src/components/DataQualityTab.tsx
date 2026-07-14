import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DemoText } from "@/components/DemoText";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { ShieldAlert, ClipboardX, Copy, CheckCircle2 } from "lucide-react";

interface DataQualityRow {
  lineItemId: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  description: string | null;
  quantity: number;
  machineName: string | null;
  completedDate: string;
  completedBy: string | null;
  actualMinutes: number | null;
  estimatedMinutes: number | null;
  issue: "missing" | "matches_estimate";
}

interface DataQualityData {
  summary: {
    totalCompleted: number;
    flagged: number;
    missing: number;
    matchesEstimate: number;
    cleanPercent: number | null;
  };
  byStaff: { staffId: string; name: string; flagged: number; total: number }[];
  rows: DataQualityRow[];
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

function safeDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, "EEE d MMM");
  } catch {
    return dateStr;
  }
}

export function DataQualityTab() {
  const [preset, setPreset] = useState<Preset>("this-week");
  const defaultRange = presetRange("this-week")!;
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const range = presetRange(p);
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const enabled = !!startDate && !!endDate && startDate <= endDate;
  const { data, isLoading, isError } = useQuery<DataQualityData>({
    queryKey: ["/api/reports/data-quality", { startDate, endDate }],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/data-quality?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load data quality report");
      return res.json();
    },
    enabled,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Time Recording Quality
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
                <SelectTrigger className="w-44" data-testid="select-dq-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-week">This week</SelectItem>
                  <SelectItem value="last-week">Last week</SelectItem>
                  <SelectItem value="last-4-weeks">Last 4 weeks</SelectItem>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset("custom");
                }}
                className="w-40"
                data-testid="input-dq-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset("custom");
                }}
                className="w-40"
                data-testid="input-dq-end"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Flags completed line items where the recorded production time is missing, zero, or
            exactly matches the system estimate (which usually means the estimate was copied
            instead of the real time from the worksheet).
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Couldn't load the data quality report. Please try again.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card data-testid="card-dq-completed">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Items Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.totalCompleted}</div>
                <p className="text-xs text-muted-foreground">in this period</p>
              </CardContent>
            </Card>
            <Card data-testid="card-dq-clean">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Good Data</CardTitle>
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.summary.cleanPercent != null ? `${data.summary.cleanPercent}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">of completions have believable times</p>
              </CardContent>
            </Card>
            <Card data-testid="card-dq-missing">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Missing Time</CardTitle>
                <ClipboardX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.missing}</div>
                <p className="text-xs text-muted-foreground">no time recorded at all</p>
              </CardContent>
            </Card>
            <Card data-testid="card-dq-copied">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Same as Estimate</CardTitle>
                <Copy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.matchesEstimate}</div>
                <p className="text-xs text-muted-foreground">time exactly matches the estimate</p>
              </CardContent>
            </Card>
          </div>

          {data.byStaff.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By Team Member</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.byStaff.map((s) => (
                    <Badge
                      key={s.staffId}
                      variant={s.flagged > 0 ? "outline" : "secondary"}
                      className={s.flagged > 0 ? "text-amber-600 dark:text-amber-400" : ""}
                      data-testid={`badge-dq-staff-${s.staffId}`}
                    >
                      {s.name}: {s.flagged}/{s.total} flagged
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Flagged Items ({data.rows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-dq-empty">
                  No problems found — every completed item in this period has a believable production time.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Completed by</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Estimate</TableHead>
                        <TableHead>Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <TableRow key={row.lineItemId} data-testid={`row-dq-${row.lineItemId}`}>
                          <TableCell className="whitespace-nowrap text-xs">{safeDate(row.completedDate)}</TableCell>
                          <TableCell className="max-w-[200px]">
                            <div className="truncate text-sm">
                              {row.jobNumber != null ? `#${row.jobNumber} ` : ""}
                              {row.jobName}
                            </div>
                            {row.description && (
                              <div className="truncate text-xs text-muted-foreground">{row.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-sm">
                            <DemoText>{row.customerName}</DemoText>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{row.quantity}</TableCell>
                          <TableCell className="text-sm">{row.machineName ?? "—"}</TableCell>
                          <TableCell className="text-sm">{row.completedBy ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {row.actualMinutes != null && row.actualMinutes > 0 ? `${row.actualMinutes}m` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {row.estimatedMinutes != null ? `${row.estimatedMinutes}m` : "—"}
                          </TableCell>
                          <TableCell>
                            {row.issue === "missing" ? (
                              <Badge variant="outline" className="text-red-600 dark:text-red-400">
                                Missing time
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                                Same as estimate
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

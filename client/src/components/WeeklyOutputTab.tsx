import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Printer, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { DemoText } from "@/components/DemoText";

interface WeeklyOutputData {
  weeks: Array<{ weekStart: string; submitted: number; completed: number; submittedQty: number; completedQty: number; avgLogoPrice: number | null; invValue: number; invQty: number; customersSubmitted: number; customersCompleted: number }>;
  machineWeekly: Array<{ weekStart: string; machineId: number; machineName: string; quantity: number }>;
  staffWeekly: Array<{ weekStart: string; staffId: string; staffName: string; quantity: number }>;
}

const SERIES_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#84cc16", "#ec4899", "#0ea5e9", "#f97316", "#14b8a6", "#8b5cf6"];

function SeriesChart({ title, data, cols }: { title: string; data: Array<Record<string, string | number>>; cols: Array<{ key: string; label: string }> }) {
  return (
    <Card className="print-block">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {cols.map((c, i) => (
                <Line key={c.key} type="monotone" dataKey={c.label} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtWeek(weekStart: string) {
  try {
    return format(new Date(weekStart + "T00:00:00"), "d MMM yyyy");
  } catch {
    return weekStart;
  }
}

/** Pivot rows of {weekStart, key, label, quantity} into weeks × columns. */
function pivot<T extends { weekStart: string; quantity: number }>(
  rows: T[],
  keyOf: (r: T) => string,
  labelOf: (r: T) => string,
) {
  const columns = new Map<string, string>(); // key -> label
  const cells = new Map<string, Map<string, number>>(); // weekStart -> key -> qty
  for (const r of rows) {
    const k = keyOf(r);
    if (!columns.has(k)) columns.set(k, labelOf(r));
    if (!cells.has(r.weekStart)) cells.set(r.weekStart, new Map());
    const wk = cells.get(r.weekStart)!;
    wk.set(k, (wk.get(k) || 0) + r.quantity);
  }
  const weekStarts = Array.from(cells.keys()).sort();
  const cols = Array.from(columns.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { weekStarts, cols, cells };
}

function PivotTable({
  title,
  data,
  testId,
}: {
  title: string;
  data: ReturnType<typeof pivot>;
  testId: string;
}) {
  const colTotals = new Map<string, number>();
  return (
    <Card className="print-block">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.weekStarts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No production recorded in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid={testId}>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Week beginning</TableHead>
                  {data.cols.map(c => (
                    <TableHead key={c.key} className="text-right whitespace-nowrap"><DemoText>{c.label}</DemoText></TableHead>
                  ))}
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weekStarts.map(wk => {
                  const rowCells = data.cells.get(wk)!;
                  let rowTotal = 0;
                  const tds = data.cols.map(c => {
                    const v = rowCells.get(c.key) || 0;
                    rowTotal += v;
                    colTotals.set(c.key, (colTotals.get(c.key) || 0) + v);
                    return (
                      <TableCell key={c.key} className="text-right">
                        {v > 0 ? v.toLocaleString() : <span className="text-muted-foreground">–</span>}
                      </TableCell>
                    );
                  });
                  return (
                    <TableRow key={wk}>
                      <TableCell className="whitespace-nowrap font-medium">{fmtWeek(wk)}</TableCell>
                      {tds}
                      <TableCell className="text-right font-semibold">{rowTotal.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Total</TableCell>
                  {data.cols.map(c => (
                    <TableCell key={c.key} className="text-right font-semibold">
                      {(colTotals.get(c.key) || 0).toLocaleString()}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold">
                    {Array.from(colTotals.values()).reduce((a, b) => a + b, 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Monday of the current week in the UK (Europe/London). Weeks run Monday–Sunday;
 * only weeks BEFORE this Monday are complete. */
function currentUkMonday(): Date {
  const ukToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const monday = new Date(ukToday + "T00:00:00");
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** Monday 16 completed weeks back — a rolling 16-week window of finished weeks. */
function rolling16WeekStart(): string {
  const monday = currentUkMonday();
  monday.setDate(monday.getDate() - 16 * 7);
  return format(monday, "yyyy-MM-dd");
}

/** Last Sunday (end of the most recent completed week). */
function lastCompletedSunday(): string {
  const monday = currentUkMonday();
  monday.setDate(monday.getDate() - 1);
  return format(monday, "yyyy-MM-dd");
}

export function WeeklyOutputTab() {
  const [startDate, setStartDate] = useState(rolling16WeekStart());
  const [endDate, setEndDate] = useState(lastCompletedSunday());

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate;

  const { data, isLoading } = useQuery<WeeklyOutputData>({
    queryKey: ["/api/reports/weekly-output", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/weekly-output?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
    enabled: validRange,
  });

  // Only completed weeks (Mon–Sun): drop the current, in-progress week.
  const completedWeekCutoff = format(currentUkMonday(), "yyyy-MM-dd");
  const weeks = useMemo(() => (data?.weeks || []).filter(w => w.weekStart < completedWeekCutoff), [data?.weeks, completedWeekCutoff]);

  const machinePivot = useMemo(
    () => pivot((data?.machineWeekly || []).filter(r => r.weekStart < completedWeekCutoff), r => String(r.machineId), r => r.machineName),
    [data?.machineWeekly, completedWeekCutoff],
  );
  const staffPivot = useMemo(
    () => pivot((data?.staffWeekly || []).filter(r => r.weekStart < completedWeekCutoff), r => r.staffId, r => r.staffName),
    [data?.staffWeekly, completedWeekCutoff],
  );

  // Chart data: one point per week (weekly values, no running totals).
  const wormData = useMemo(() => {
    return weeks.map(w => ({
      week: fmtWeek(w.weekStart),
      wSubmitted: w.submitted, wCompleted: w.completed,
      wSubmittedQty: w.submittedQty, wCompletedQty: w.completedQty,
      wCustomersSubmitted: w.customersSubmitted, wCustomersCompleted: w.customersCompleted,
      avgLogoPrice: w.avgLogoPrice,
    }));
  }, [weeks]);

  // Per-machine / per-staff chart data: one point per week, one field per column.
  const seriesChartData = (p: ReturnType<typeof pivot>) => {
    return p.weekStarts.map(wk => {
      const row: Record<string, string | number> = { week: fmtWeek(wk) };
      const cells = p.cells.get(wk)!;
      for (const c of p.cols) {
        row[c.label] = cells.get(c.key) || 0;
      }
      return row;
    });
  };
  const machineWeeklyChart = useMemo(() => seriesChartData(machinePivot), [machinePivot]);
  const staffWeeklyChart = useMemo(() => seriesChartData(staffPivot), [staffPivot]);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`Weekly Output Report,${startDate} to ${endDate}`);
    lines.push("");
    lines.push("Week beginning,Jobs submitted,Line items submitted,Jobs completed,Line items completed,Customers submitting,Customers with completions,Average price per logo (ex VAT)");
    for (const w of weeks) lines.push(`${w.weekStart},${w.submitted},${w.submittedQty},${w.completed},${w.completedQty},${w.customersSubmitted},${w.customersCompleted},${w.avgLogoPrice ?? ""}`);
    lines.push("");
    lines.push("Line items completed per machine");
    lines.push(["Week beginning", ...machinePivot.cols.map(c => `"${c.label}"`)].join(","));
    for (const wk of machinePivot.weekStarts) {
      const row = machinePivot.cells.get(wk)!;
      lines.push([wk, ...machinePivot.cols.map(c => row.get(c.key) || 0)].join(","));
    }
    lines.push("");
    lines.push("Line items completed per staff member");
    lines.push(["Week beginning", ...staffPivot.cols.map(c => `"${c.label}"`)].join(","));
    for (const wk of staffPivot.weekStarts) {
      const row = staffPivot.cells.get(wk)!;
      lines.push([wk, ...staffPivot.cols.map(c => row.get(c.key) || 0)].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-output-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: weekly summary
    const summaryRows = weeks.map(w => ({
      "Week beginning": w.weekStart,
      "Jobs submitted": w.submitted,
      "Line items submitted": w.submittedQty,
      "Jobs completed": w.completed,
      "Line items completed": w.completedQty,
      "Customers submitting": w.customersSubmitted,
      "Customers with completions": w.customersCompleted,
      "Invoiced value (ex VAT)": w.invValue,
      "Invoiced line items": w.invQty,
      "Avg price per logo (ex VAT)": w.avgLogoPrice ?? "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Weekly summary");

    // Sheets 2 & 3: machine and staff pivots (weeks as rows)
    const pivotRows = (p: ReturnType<typeof pivot>) =>
      p.weekStarts.map(wk => {
        const row: Record<string, string | number> = { "Week beginning": wk };
        const cells = p.cells.get(wk)!;
        for (const c of p.cols) row[c.label] = cells.get(c.key) || 0;
        return row;
      });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivotRows(machinePivot)), "Per machine");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pivotRows(staffPivot)), "Per staff member");

    XLSX.writeFile(wb, `weekly-output-${startDate}-to-${endDate}.xlsx`);
  };

  const handlePrint = () => {
    // Force A4 landscape just for this report (the app default is portrait)
    const style = document.createElement("style");
    style.textContent = "@page { size: A4 landscape; margin: 1cm; }";
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <div id="weekly-output-root" className="space-y-4">
      <div className="hidden print:block">
        <h1 className="text-lg font-bold">Weekly Output Report</h1>
        <p className="text-sm text-muted-foreground">{fmtWeek(startDate)} to {fmtWeek(endDate)} — completed weeks (Monday to Sunday)</p>
      </div>
      <Card className="print-hide">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">From</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" data-testid="input-weekly-output-start" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">To</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" data-testid="input-weekly-output-end" />
          </div>
          <Button variant="outline" onClick={exportExcel} disabled={!data} data-testid="button-weekly-output-excel">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Download spreadsheet
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!data} data-testid="button-weekly-output-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!data} data-testid="button-weekly-output-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {!validRange && <p className="text-xs text-destructive">Enter a valid date range (From must be on or before To).</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {(weeks.length) > 0 && (
            <div className="grid gap-4 lg:grid-cols-2 print-stack">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Jobs week by week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wormData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="wSubmitted" name="Jobs submitted" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="wCompleted" name="Jobs completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Line items week by week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wormData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="wSubmittedQty" name="Line items submitted" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="wCompletedQty" name="Line items completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Customers week by week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wormData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="wCustomersSubmitted" name="Customers submitting" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="wCustomersCompleted" name="Customers with completions" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Average price per logo (£ ex VAT, weekly)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wormData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `£${v}`} domain={[0, "auto"]} />
                        <Tooltip formatter={(v: any) => [`£${Number(v).toFixed(2)}`, "Average price per logo"]} />
                        <Legend />
                        <Line type="monotone" dataKey="avgLogoPrice" name="Average price per logo" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="print-block">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jobs submitted and completed per week</CardTitle>
            </CardHeader>
            <CardContent>
              {(weeks.length) === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="table-weekly-jobs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week beginning</TableHead>
                        <TableHead className="text-right">Jobs submitted</TableHead>
                        <TableHead className="text-right">Line items submitted</TableHead>
                        <TableHead className="text-right">Jobs completed</TableHead>
                        <TableHead className="text-right">Line items completed</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead className="text-right">Avg price per logo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weeks.map(w => (
                        <TableRow key={w.weekStart}>
                          <TableCell className="whitespace-nowrap font-medium">{fmtWeek(w.weekStart)}</TableCell>
                          <TableCell className="text-right">{w.submitted.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{w.submittedQty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{w.completed.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{w.completedQty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{Math.max(w.customersSubmitted, w.customersCompleted).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{w.avgLogoPrice != null ? `£${w.avgLogoPrice.toFixed(2)}` : <span className="text-muted-foreground">–</span>}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40">
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-semibold">
                          {weeks.reduce((s, w) => s + w.submitted, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {weeks.reduce((s, w) => s + w.submittedQty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {weeks.reduce((s, w) => s + w.completed, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {weeks.reduce((s, w) => s + w.completedQty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">–</TableCell>
                        <TableCell className="text-right font-semibold">
                          {(() => {
                            const totalValue = weeks.reduce((s, w) => s + (w.invValue || 0), 0);
                            const totalQty = weeks.reduce((s, w) => s + (w.invQty || 0), 0);
                            return totalQty > 0 ? `£${(totalValue / totalQty).toFixed(2)}` : "–";
                          })()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {machinePivot.weekStarts.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-1 print-stack">
              <SeriesChart title="Line items completed per machine — week by week" data={machineWeeklyChart} cols={machinePivot.cols} />
            </div>
          )}
          {staffPivot.weekStarts.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-1 print-stack">
              <SeriesChart title="Line items completed per staff member — week by week" data={staffWeeklyChart} cols={staffPivot.cols} />
            </div>
          )}

          <PivotTable title="Line items completed per machine (weekly)" data={machinePivot} testId="table-weekly-machines" />
          <PivotTable title="Line items completed per staff member (weekly)" data={staffPivot} testId="table-weekly-staff" />
        </>
      )}
    </div>
  );
}

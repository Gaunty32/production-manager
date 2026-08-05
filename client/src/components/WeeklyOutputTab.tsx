import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { DemoText } from "@/components/DemoText";

interface WeeklyOutputData {
  weeks: Array<{ weekStart: string; submitted: number; completed: number; submittedQty: number; completedQty: number; avgLogoPrice: number | null; invValue: number; invQty: number; customersSubmitted: number; customersCompleted: number }>;
  machineWeekly: Array<{ weekStart: string; machineId: number; machineName: string; quantity: number }>;
  staffWeekly: Array<{ weekStart: string; staffId: string; staffName: string; quantity: number }>;
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
    <Card>
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

/** Monday of the week 15 weeks before this week's Monday — a rolling 16-week window.
 * Uses the current date in the UK (Europe/London) so the window matches server bucketing. */
function rolling16WeekStart(): string {
  const ukToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const monday = new Date(ukToday + "T00:00:00");
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 15 * 7);
  return format(monday, "yyyy-MM-dd");
}

export function WeeklyOutputTab() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(rolling16WeekStart());
  const [endDate, setEndDate] = useState(today);

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && startDate <= endDate;

  const { data, isLoading } = useQuery<WeeklyOutputData>({
    queryKey: ["/api/reports/weekly-output", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/weekly-output?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
    enabled: validRange,
  });

  const machinePivot = useMemo(
    () => pivot(data?.machineWeekly || [], r => String(r.machineId), r => r.machineName),
    [data?.machineWeekly],
  );
  const staffPivot = useMemo(
    () => pivot(data?.staffWeekly || [], r => r.staffId, r => r.staffName),
    [data?.staffWeekly],
  );

  // Worm data: running (cumulative) totals week by week.
  const wormData = useMemo(() => {
    let submitted = 0, completed = 0, submittedQty = 0, completedQty = 0, custSub = 0, custComp = 0;
    return (data?.weeks || []).map(w => {
      submitted += w.submitted;
      completed += w.completed;
      submittedQty += w.submittedQty;
      completedQty += w.completedQty;
      custSub += w.customersSubmitted;
      custComp += w.customersCompleted;
      return {
        week: fmtWeek(w.weekStart),
        submitted, completed, submittedQty, completedQty,
        customersSubmitted: custSub, customersCompleted: custComp,
        avgLogoPrice: w.avgLogoPrice,
      };
    });
  }, [data?.weeks]);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`Weekly Output Report,${startDate} to ${endDate}`);
    lines.push("");
    lines.push("Week beginning,Jobs submitted,Items submitted,Jobs completed,Items completed,Customers submitting,Customers with completions,Average price per logo (ex VAT)");
    for (const w of data.weeks) lines.push(`${w.weekStart},${w.submitted},${w.submittedQty},${w.completed},${w.completedQty},${w.customersSubmitted},${w.customersCompleted},${w.avgLogoPrice ?? ""}`);
    lines.push("");
    lines.push("Items completed per machine");
    lines.push(["Week beginning", ...machinePivot.cols.map(c => `"${c.label}"`)].join(","));
    for (const wk of machinePivot.weekStarts) {
      const row = machinePivot.cells.get(wk)!;
      lines.push([wk, ...machinePivot.cols.map(c => row.get(c.key) || 0)].join(","));
    }
    lines.push("");
    lines.push("Items completed per staff member");
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">From</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" data-testid="input-weekly-output-start" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">To</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" data-testid="input-weekly-output-end" />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!data} data-testid="button-weekly-output-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          {!validRange && <p className="text-xs text-destructive">Enter a valid date range (From must be on or before To).</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {(data?.weeks.length ?? 0) > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Jobs worm (running total)</CardTitle>
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
                        <Line type="monotone" dataKey="submitted" name="Jobs submitted" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="completed" name="Jobs completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Items worm (running total)</CardTitle>
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
                        <Line type="monotone" dataKey="submittedQty" name="Items submitted" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="completedQty" name="Items completed" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Customers worm (running total)</CardTitle>
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
                        <Line type="monotone" dataKey="customersSubmitted" name="Customers submitting" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="customersCompleted" name="Customers with completions" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
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
                        <Line type="monotone" dataKey="avgLogoPrice" name="Average price per logo" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jobs submitted and completed per week</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.weeks.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="table-weekly-jobs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week beginning</TableHead>
                        <TableHead className="text-right">Jobs submitted</TableHead>
                        <TableHead className="text-right">Items submitted</TableHead>
                        <TableHead className="text-right">Jobs completed</TableHead>
                        <TableHead className="text-right">Items completed</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead className="text-right">Avg price per logo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.weeks.map(w => (
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
                          {data!.weeks.reduce((s, w) => s + w.submitted, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {data!.weeks.reduce((s, w) => s + w.submittedQty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {data!.weeks.reduce((s, w) => s + w.completed, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {data!.weeks.reduce((s, w) => s + w.completedQty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">–</TableCell>
                        <TableCell className="text-right font-semibold">
                          {(() => {
                            const totalValue = data!.weeks.reduce((s, w) => s + (w.invValue || 0), 0);
                            const totalQty = data!.weeks.reduce((s, w) => s + (w.invQty || 0), 0);
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

          <PivotTable title="Items completed per machine (weekly)" data={machinePivot} testId="table-weekly-machines" />
          <PivotTable title="Items completed per staff member (weekly)" data={staffPivot} testId="table-weekly-staff" />
        </>
      )}
    </div>
  );
}

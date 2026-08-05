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
  weeks: Array<{ weekStart: string; submitted: number; completed: number; submittedQty: number; completedQty: number; avgJobValue: number | null }>;
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

export function WeeklyOutputTab() {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(yearStart);
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

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`Weekly Output Report,${startDate} to ${endDate}`);
    lines.push("");
    lines.push("Week beginning,Jobs submitted,Items submitted,Jobs completed,Items completed,Average job value (ex VAT)");
    for (const w of data.weeks) lines.push(`${w.weekStart},${w.submitted},${w.submittedQty},${w.completed},${w.completedQty},${w.avgJobValue ?? ""}`);
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
                  <CardTitle className="text-base">Jobs per week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data!.weeks.map(w => ({ ...w, week: fmtWeek(w.weekStart) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="submitted" name="Jobs submitted" fill="#6366f1" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="completed" name="Jobs completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Items per week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data!.weeks.map(w => ({ ...w, week: fmtWeek(w.weekStart) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="submittedQty" name="Items submitted" fill="#6366f1" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="completedQty" name="Items completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Average job value per week (£ ex VAT)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data!.weeks.map(w => ({ ...w, week: fmtWeek(w.weekStart) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `£${v}`} />
                        <Tooltip formatter={(v: any) => [`£${Number(v).toFixed(2)}`, "Average job value"]} />
                        <Line type="monotone" dataKey="avgJobValue" name="Average job value" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
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
                        <TableHead className="text-right">Avg job value</TableHead>
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
                          <TableCell className="text-right">{w.avgJobValue != null ? `£${w.avgJobValue.toFixed(2)}` : <span className="text-muted-foreground">–</span>}</TableCell>
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
                        <TableCell className="text-right font-semibold">
                          {(() => {
                            const withVal = data!.weeks.filter(w => w.avgJobValue != null);
                            if (withVal.length === 0) return "–";
                            const weighted = withVal.reduce((s, w) => s + (w.avgJobValue as number) * w.completed, 0);
                            const jobs = withVal.reduce((s, w) => s + w.completed, 0);
                            return jobs > 0 ? `£${(weighted / jobs).toFixed(2)}` : "–";
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

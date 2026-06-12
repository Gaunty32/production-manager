import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Printer, Cog, CalendarDays } from "lucide-react";
import { format } from "date-fns";

interface MachineSheetJob {
  scheduleId: string;
  date: string;
  dateKey: string;
  startTime: number;
  endTime: number;
  operatorId: string;
  operatorName: string;
  jobId: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  description: string | null;
  position: string | null;
  quantity: number | null;
  stitchCount: number | null;
}

interface MachineSheet {
  machineId: number;
  machineName: string;
  defaultOperatorId: string | null;
  defaultOperatorName: string | null;
  operatorsByDate: Record<string, string[]>;
  jobs: MachineSheetJob[];
}

function operatorsForDay(machine: MachineSheet, date: string): string {
  const ops = machine.operatorsByDate?.[date];
  if (ops && ops.length > 0) return ops.join(", ");
  return machine.defaultOperatorName ?? "No operator";
}

interface MachineSheetResponse {
  days: number;
  startDate: string;
  endDate: string;
  machines: MachineSheet[];
}

const DAYS = 5;

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function groupByDate(jobs: MachineSheetJob[]): { date: string; jobs: MachineSheetJob[] }[] {
  const map = new Map<string, MachineSheetJob[]>();
  for (const job of jobs) {
    const key = job.dateKey;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(job);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, jobs]) => ({ date, jobs }));
}

// Parse a yyyy-MM-dd key as a local date (avoids UTC-shift from new Date("yyyy-MM-dd")).
function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(data: MachineSheetResponse): string {
  const sections = data.machines
    .map((machine) => {
      const operator = machine.defaultOperatorName
        ? escapeHtml(machine.defaultOperatorName)
        : "No default operator (fallback)";

      const groups = groupByDate(machine.jobs);

      const body = groups.length
        ? groups
            .map((group) => {
              const dayLabel = format(parseDateKey(group.date), "EEEE d MMM yyyy");
              const dayOperator = escapeHtml(operatorsForDay(machine, group.date));
              const rows = group.jobs
                .map((job) => {
                  const desc = [job.position, job.description]
                    .filter(Boolean)
                    .map((v) => escapeHtml(String(v)))
                    .join(" — ");
                  return `<tr>
                    <td>${minutesToLabel(job.startTime)}–${minutesToLabel(job.endTime)}</td>
                    <td>${job.jobNumber ?? "—"}</td>
                    <td>${escapeHtml(job.customerName)}</td>
                    <td>${escapeHtml(job.jobName)}</td>
                    <td>${desc || "—"}</td>
                    <td class="num">${job.quantity ?? "—"}</td>
                    <td class="num">${job.stitchCount != null ? job.stitchCount.toLocaleString() : "—"}</td>
                    <td>${escapeHtml(job.operatorName)}</td>
                  </tr>`;
                })
                .join("");
              return `<div class="day">
                <h3>${dayLabel} <span class="day-operator">· Operator: ${dayOperator}</span></h3>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th><th>Job #</th><th>Customer</th><th>Job</th>
                      <th>Item</th><th>Qty</th><th>Stitches</th><th>Operator</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`;
            })
            .join("")
        : `<p class="empty">No scheduled jobs in the next ${data.days} days.</p>`;

      return `<section class="machine">
        <div class="machine-header">
          <h2>${escapeHtml(machine.machineName)}</h2>
          <span class="operator">Default operator: ${operator}</span>
        </div>
        ${body}
      </section>`;
    })
    .join("");

  const printedOn = format(new Date(), "EEEE d MMM yyyy, HH:mm");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Machine Schedule — Next ${data.days} Days</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #555; font-size: 12px; margin: 0 0 16px; }
  section.machine { page-break-after: always; break-after: page; }
  section.machine:last-child { page-break-after: auto; break-after: auto; }
  .machine-header { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 12px; gap: 12px; }
  .machine-header h2 { font-size: 18px; margin: 0; }
  .operator { font-size: 14px; font-weight: bold; }
  .day { margin-bottom: 14px; }
  .day h3 { font-size: 13px; margin: 0 0 4px; background: #f0f0f0; padding: 4px 8px; }
  .day-operator { font-weight: normal; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #fafafa; }
  td.num, th.num { text-align: right; }
  .empty { color: #777; font-style: italic; font-size: 12px; }
  @page { margin: 1cm; size: A4 portrait; }
</style>
</head>
<body>
  <h1>Machine Schedule — Next ${data.days} Days</h1>
  <p class="subtitle">Printed ${printedOn}</p>
  ${sections || '<p class="empty">No active machines.</p>'}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

export function MachineScheduleBoard() {
  const { data, isLoading } = useQuery<MachineSheetResponse>({
    queryKey: ["/api/scheduling/machine-sheet", DAYS],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/machine-sheet?days=${DAYS}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load machine schedule");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const handlePrint = () => {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildPrintHtml(data));
    win.document.close();
  };

  return (
    <Card data-testid="card-machine-schedule-board">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cog className="h-5 w-5" />
          Machine Schedule — Next {DAYS} Days
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePrint}
          disabled={isLoading || !data}
          data-testid="button-print-machine-sheet"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print handouts
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : !data || data.machines.length === 0 ? (
          <p className="text-sm text-muted-foreground italic" data-testid="text-no-machines">
            No active machines configured.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.machines.map((machine) => {
              const groups = groupByDate(machine.jobs);
              return (
                <Card
                  key={machine.machineId}
                  className="flex flex-col"
                  data-testid={`pill-machine-${machine.machineId}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span data-testid={`text-machine-name-${machine.machineId}`}>
                        {machine.machineName}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        data-testid={`badge-operator-${machine.machineId}`}
                      >
                        <User className="h-3 w-3 mr-1" />
                        Default: {machine.defaultOperatorName ?? "None"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 pt-0">
                    {groups.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> Nothing scheduled
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {groups.map((group) => (
                          <div key={group.date} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-xs font-semibold text-muted-foreground">
                                {format(parseDateKey(group.date), "EEE d MMM")}
                              </p>
                              <span
                                className="text-xs text-muted-foreground flex items-center gap-1"
                                data-testid={`text-day-operator-${machine.machineId}-${group.date}`}
                              >
                                <User className="h-3 w-3" />
                                {operatorsForDay(machine, group.date)}
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {group.jobs.map((job) => (
                                <li
                                  key={job.scheduleId}
                                  className="rounded-md border p-2 text-xs"
                                  data-testid={`job-${job.scheduleId}`}
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="font-medium">
                                      {job.jobNumber ? `#${job.jobNumber} ` : ""}
                                      {job.customerName}
                                    </span>
                                    <span className="text-muted-foreground tabular-nums">
                                      {minutesToLabel(job.startTime)}–{minutesToLabel(job.endTime)}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground">{job.jobName}</div>
                                  <div className="text-muted-foreground">
                                    {[job.position, job.description].filter(Boolean).join(" — ")}
                                    {job.quantity != null ? ` · ${job.quantity} pcs` : ""}
                                    {job.stitchCount != null
                                      ? ` · ${job.stitchCount.toLocaleString()} st`
                                      : ""}
                                  </div>
                                  {job.operatorName && job.operatorName !== machine.defaultOperatorName && (
                                    <div className="text-muted-foreground italic">
                                      Op: {job.operatorName}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

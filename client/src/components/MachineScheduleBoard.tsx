import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  dateKeys: string[];
  machines: MachineSheet[];
}

// Build one entry per day in the window, attaching that day's jobs. Days are
// shown even with no jobs so the allocated operator is always visible.
function buildDays(
  machine: MachineSheet,
  dateKeys: string[],
): { date: string; jobs: MachineSheetJob[]; hasOperator: boolean }[] {
  return dateKeys.map((key) => {
    const jobs = machine.jobs
      .filter((j) => j.dateKey === key)
      .sort((a, b) => {
        const da = a.requiredDispatchDate
          ? parseDateKey(a.requiredDispatchDate.slice(0, 10)).getTime()
          : Infinity;
        const db = b.requiredDispatchDate
          ? parseDateKey(b.requiredDispatchDate.slice(0, 10)).getTime()
          : Infinity;
        if (da !== db) return da - db;
        return a.startTime - b.startTime;
      });
    const hasOperator =
      (machine.operatorsByDate?.[key]?.length ?? 0) > 0 || !!machine.defaultOperatorName;
    return { date: key, jobs, hasOperator };
  });
}

const DAYS = 5;

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Parse a yyyy-MM-dd key as a local date (avoids UTC-shift from new Date("yyyy-MM-dd")).
function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

// Format a job's required dispatch (due) date for display, avoiding UTC day-shift.
function formatDue(value: string | null): string {
  if (!value) return "—";
  const datePart = value.length >= 10 ? value.slice(0, 10) : value;
  return format(parseDateKey(datePart), "d MMM");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Build the printable section for a single machine (its own page).
function buildMachineSection(machine: MachineSheet, data: MachineSheetResponse): string {
  const todayOperator = escapeHtml(
    data.dateKeys.length
      ? operatorsForDay(machine, data.dateKeys[0])
      : machine.defaultOperatorName ?? "No operator",
  );

  const groups = buildDays(machine, data.dateKeys).filter(
    (d) => d.jobs.length > 0 || d.hasOperator,
  );

  const body = groups.length
    ? groups
        .map((group) => {
          const dayLabel = format(parseDateKey(group.date), "EEEE d MMM yyyy");
          const dayOperator = escapeHtml(operatorsForDay(machine, group.date));
          if (group.jobs.length === 0) {
            return `<div class="day">
              <h3>${dayLabel} <span class="day-operator">· Operator: ${dayOperator}</span></h3>
              <p class="empty">No jobs scheduled</p>
            </div>`;
          }
          const rows = group.jobs
            .map((job) => {
              return `<tr>
                <td>${minutesToLabel(job.startTime)}–${minutesToLabel(job.endTime)}</td>
                <td>${job.jobNumber ?? "—"}</td>
                <td>${escapeHtml(job.customerName)}</td>
                <td>${escapeHtml(job.jobName)}</td>
                <td>${escapeHtml(formatDue(job.requiredDispatchDate))}</td>
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
                  <th>Due</th><th class="num">Qty</th><th class="num">Stitches</th><th>Operator</th>
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
      <span class="operator">Today: ${todayOperator}</span>
    </div>
    ${body}
  </section>`;
}

// Build a full printable document for the given machines (one page each).
function buildPrintDocument(
  machines: MachineSheet[],
  data: MachineSheetResponse,
  heading: string,
): string {
  const sections = machines.map((machine) => buildMachineSection(machine, data)).join("");
  const printedOn = format(new Date(), "EEEE d MMM yyyy, HH:mm");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(heading)}</title>
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
  <h1>${escapeHtml(heading)}</h1>
  <p class="subtitle">Printed ${printedOn}</p>
  ${sections || '<p class="empty">No active machines.</p>'}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

function openPrintWindow(html: string): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
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

  // Autofill production days: when the board opens, automatically book the most
  // efficient slot for any job assigned to a machine that has no production day
  // yet (awaiting-payment / invoiced jobs are skipped server-side). Runs once.
  const autoFillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scheduling/auto-schedule", {});
      return res.json();
    },
    onSuccess: (result: any) => {
      if (result?.scheduledCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/scheduling/machine-sheet"] });
        queryClient.invalidateQueries({ queryKey: ["/api/job-schedules"] });
        queryClient.invalidateQueries({ queryKey: ["/api/scheduling/health"] });
      }
    },
  });

  const hasAutoFilled = useRef(false);
  useEffect(() => {
    if (hasAutoFilled.current) return;
    hasAutoFilled.current = true;
    autoFillMutation.mutate();
  }, []);

  const handlePrintAll = () => {
    if (!data) return;
    openPrintWindow(
      buildPrintDocument(data.machines, data, `Machine Schedule — Next ${data.days} Days`),
    );
  };

  const handlePrintMachine = (machine: MachineSheet) => {
    if (!data) return;
    openPrintWindow(
      buildPrintDocument([machine], data, `${machine.machineName} — Next ${data.days} Days`),
    );
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
          onClick={handlePrintAll}
          disabled={isLoading || !data}
          data-testid="button-print-machine-sheet"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print all
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
              const groups = buildDays(machine, data.dateKeys).filter(
                (d) => d.jobs.length > 0 || d.hasOperator,
              );
              const todayOperator = data.dateKeys.length
                ? operatorsForDay(machine, data.dateKeys[0])
                : machine.defaultOperatorName ?? "No operator";
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
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          data-testid={`badge-operator-${machine.machineId}`}
                        >
                          <User className="h-3 w-3 mr-1" />
                          Today: {todayOperator}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePrintMachine(machine)}
                          title={`Print ${machine.machineName} handout`}
                          data-testid={`button-print-machine-${machine.machineId}`}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
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
                            {group.jobs.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic pl-1">
                                No jobs scheduled
                              </p>
                            ) : (
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
                                  <div
                                    className="font-medium"
                                    data-testid={`text-due-${job.scheduleId}`}
                                  >
                                    Due {formatDue(job.requiredDispatchDate)}
                                  </div>
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
                            )}
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

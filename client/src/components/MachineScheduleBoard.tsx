import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Printer, Cog, CalendarDays, Users } from "lucide-react";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Raw API shapes
// ---------------------------------------------------------------------------

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

interface MachineSheetResponse {
  days: number;
  startDate: string;
  endDate: string;
  dateKeys: string[];
  machines: MachineSheet[];
}

interface StaffSheetJob {
  scheduleId: string;
  date: string;
  dateKey: string;
  startTime: number;
  endTime: number;
  machineId: number;
  machineName: string;
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

interface StaffSheet {
  staffId: string;
  staffName: string;
  machinesByDate: Record<string, string[]>;
  jobs: StaffSheetJob[];
}

interface StaffSheetResponse {
  days: number;
  startDate: string;
  endDate: string;
  dateKeys: string[];
  staff: StaffSheet[];
}

type ViewMode = "machine" | "staff";

// ---------------------------------------------------------------------------
// Normalized board model — both views map onto these so the rendering and
// printing code is written once. A "column" is a machine (machine view) or a
// staff member (staff view). Each job carries a contextLabel which is the
// *other* dimension: the operator (machine view) or the machine (staff view).
// ---------------------------------------------------------------------------

interface BoardJob {
  scheduleId: string;
  date: string;
  dateKey: string;
  startTime: number;
  endTime: number;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  description: string | null;
  position: string | null;
  quantity: number | null;
  stitchCount: number | null;
  contextLabel: string;
}

interface BoardColumn {
  id: string;
  name: string;
  // Per-day secondary label (operator(s) for machine view, machine(s) for staff
  // view); falls back to defaultSubLabel when a day has no specific entry.
  subLabelByDate: Record<string, string[]>;
  defaultSubLabel: string | null;
  jobs: BoardJob[];
}

interface BoardData {
  dateKeys: string[];
  columns: BoardColumn[];
}

// Labels that adapt to the active view.
const VIEW_LABELS: Record<
  ViewMode,
  { heading: string; subLabel: string; jobContext: string }
> = {
  machine: { heading: "Machine Schedule", subLabel: "Operator", jobContext: "Operator" },
  staff: { heading: "Staff Schedule", subLabel: "Machine", jobContext: "Machine" },
};

function toBoardData(
  mode: ViewMode,
  machineData?: MachineSheetResponse,
  staffData?: StaffSheetResponse,
): BoardData | undefined {
  if (mode === "machine") {
    if (!machineData) return undefined;
    return {
      dateKeys: machineData.dateKeys,
      columns: machineData.machines.map((m) => ({
        id: `machine-${m.machineId}`,
        name: m.machineName,
        subLabelByDate: m.operatorsByDate ?? {},
        defaultSubLabel: m.defaultOperatorName,
        jobs: m.jobs.map((j) => ({
          scheduleId: j.scheduleId,
          date: j.date,
          dateKey: j.dateKey,
          startTime: j.startTime,
          endTime: j.endTime,
          jobNumber: j.jobNumber,
          jobName: j.jobName,
          customerName: j.customerName,
          requiredDispatchDate: j.requiredDispatchDate,
          description: j.description,
          position: j.position,
          quantity: j.quantity,
          stitchCount: j.stitchCount,
          contextLabel: j.operatorName,
        })),
      })),
    };
  }
  if (!staffData) return undefined;
  return {
    dateKeys: staffData.dateKeys,
    columns: staffData.staff.map((s) => ({
      id: `staff-${s.staffId}`,
      name: s.staffName,
      subLabelByDate: s.machinesByDate ?? {},
      defaultSubLabel: null,
      jobs: s.jobs.map((j) => ({
        scheduleId: j.scheduleId,
        date: j.date,
        dateKey: j.dateKey,
        startTime: j.startTime,
        endTime: j.endTime,
        jobNumber: j.jobNumber,
        jobName: j.jobName,
        customerName: j.customerName,
        requiredDispatchDate: j.requiredDispatchDate,
        description: j.description,
        position: j.position,
        quantity: j.quantity,
        stitchCount: j.stitchCount,
        contextLabel: j.machineName,
      })),
    })),
  };
}

function subLabelForDay(column: BoardColumn, date: string): string {
  const entries = column.subLabelByDate?.[date];
  if (entries && entries.length > 0) return entries.join(", ");
  return column.defaultSubLabel ?? "—";
}

// Build one entry per day in the window, attaching that day's jobs. Days with no
// jobs are kept when there is a sub-label (e.g. an operator/machine) to show.
function buildDays(
  column: BoardColumn,
  dateKeys: string[],
): { date: string; jobs: BoardJob[]; hasSubLabel: boolean }[] {
  return dateKeys.map((key) => {
    const jobs = column.jobs
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
    const hasSubLabel =
      (column.subLabelByDate?.[key]?.length ?? 0) > 0 || !!column.defaultSubLabel;
    return { date: key, jobs, hasSubLabel };
  });
}

// Show every scheduled job for each column (no upper day limit).
const DAYS_PARAM = "all";

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

// Build the printable section for a single column (its own page).
function buildColumnSection(
  column: BoardColumn,
  dateKeys: string[],
  labels: { subLabel: string; jobContext: string },
): string {
  const todaySubLabel = escapeHtml(
    dateKeys.length ? subLabelForDay(column, dateKeys[0]) : column.defaultSubLabel ?? "—",
  );

  const groups = buildDays(column, dateKeys).filter(
    (d) => d.jobs.length > 0 || d.hasSubLabel,
  );

  const body = groups.length
    ? groups
        .map((group) => {
          const dayLabel = format(parseDateKey(group.date), "EEEE d MMM yyyy");
          const daySub = escapeHtml(subLabelForDay(column, group.date));
          if (group.jobs.length === 0) {
            return `<div class="day">
              <h3>${dayLabel} <span class="day-operator">· ${labels.subLabel}: ${daySub}</span></h3>
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
                <td>${escapeHtml(job.contextLabel)}</td>
                <td>${escapeHtml(formatDue(job.requiredDispatchDate))}</td>
                <td class="num">${job.quantity ?? "—"}</td>
                <td class="num">${job.stitchCount != null ? job.stitchCount.toLocaleString() : "—"}</td>
              </tr>`;
            })
            .join("");
          return `<div class="day">
            <h3>${dayLabel} <span class="day-operator">· ${labels.subLabel}: ${daySub}</span></h3>
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>Job #</th><th>Customer</th><th>Job</th>
                  <th>${escapeHtml(labels.jobContext)}</th>
                  <th>Due</th><th class="num">Qty</th><th class="num">Stitches</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
        })
        .join("")
    : `<p class="empty">No scheduled jobs.</p>`;

  return `<section class="machine">
    <div class="machine-header">
      <h2>${escapeHtml(column.name)}</h2>
      <span class="operator">Today: ${todaySubLabel}</span>
    </div>
    ${body}
  </section>`;
}

// Build a full printable document for the given columns (one page each).
function buildPrintDocument(
  columns: BoardColumn[],
  dateKeys: string[],
  heading: string,
  labels: { subLabel: string; jobContext: string },
): string {
  const sections = columns.map((c) => buildColumnSection(c, dateKeys, labels)).join("");
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
  ${sections || '<p class="empty">No data.</p>'}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

// Estimated production time from the scheduled slot, e.g. "1h 30m".
function minutesToDuration(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Build the "staff job lists" hand-out: one page per staff member with every
// job allocated to them, sorted by due date, plus a blank Actual time column
// for them to fill in by hand.
function buildStaffJobListDocument(staffData: StaffSheetResponse): string {
  const printedOn = format(new Date(), "EEEE d MMM yyyy, HH:mm");

  const sections = staffData.staff
    .map((member) => {
      const jobs = [...member.jobs].sort((a, b) => {
        const da = a.requiredDispatchDate
          ? parseDateKey(a.requiredDispatchDate.slice(0, 10)).getTime()
          : Infinity;
        const db = b.requiredDispatchDate
          ? parseDateKey(b.requiredDispatchDate.slice(0, 10)).getTime()
          : Infinity;
        if (da !== db) return da - db;
        if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
        return a.startTime - b.startTime;
      });

      const rows = jobs.length
        ? jobs
            .map(
              (job) => `<tr>
                <td>${escapeHtml(formatDue(job.requiredDispatchDate))}</td>
                <td>${escapeHtml(job.jobName)}</td>
                <td>${escapeHtml(job.customerName)}</td>
                <td class="num">${job.quantity ?? "—"}</td>
                <td class="num">${minutesToDuration(job.endTime - job.startTime)}</td>
                <td class="actual"></td>
              </tr>`,
            )
            .join("")
        : "";

      const body = jobs.length
        ? `<table>
            <thead>
              <tr>
                <th style="width:12%">Due date</th>
                <th style="width:30%">Job</th>
                <th style="width:24%">Customer</th>
                <th class="num" style="width:8%">Qty</th>
                <th class="num" style="width:11%">Est. time</th>
                <th style="width:15%">Actual time</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`
        : `<p class="empty">No jobs allocated.</p>`;

      return `<section class="machine">
        <div class="machine-header">
          <h2>${escapeHtml(member.staffName)}</h2>
          <span class="operator">${jobs.length} job${jobs.length === 1 ? "" : "s"}</span>
        </div>
        ${body}
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Staff Job Lists</title>
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
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #fafafa; }
  td.num, th.num { text-align: right; }
  td.actual { height: 26px; }
  .empty { color: #777; font-style: italic; font-size: 12px; }
  @page { margin: 1cm; size: A4 portrait; }
</style>
</head>
<body>
  <h1>Staff Job Lists</h1>
  <p class="subtitle">Printed ${printedOn}</p>
  ${sections || '<p class="empty">No staff with scheduled jobs.</p>'}
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
  const [mode, setMode] = useState<ViewMode>("machine");

  const { data: machineData, isLoading: machineLoading } = useQuery<MachineSheetResponse>({
    queryKey: ["/api/scheduling/machine-sheet", DAYS_PARAM],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/machine-sheet?days=${DAYS_PARAM}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load machine schedule");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: staffData, isLoading: staffLoading } = useQuery<StaffSheetResponse>({
    queryKey: ["/api/scheduling/staff-sheet", DAYS_PARAM],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/staff-sheet?days=${DAYS_PARAM}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load staff schedule");
      return res.json();
    },
    enabled: mode === "staff",
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
        queryClient.invalidateQueries({ queryKey: ["/api/scheduling/staff-sheet"] });
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

  const labels = VIEW_LABELS[mode];
  const board = toBoardData(mode, machineData, staffData);
  const isLoading = mode === "machine" ? machineLoading : staffLoading || machineLoading;

  const handlePrintAll = () => {
    if (!board) return;
    openPrintWindow(
      buildPrintDocument(board.columns, board.dateKeys, `${labels.heading} — All Jobs`, labels),
    );
  };

  // Print one page per staff member listing their allocated jobs. Opens the
  // window synchronously (before any await) so popup blockers don't eat it,
  // then fetches the staff sheet if the staff view hasn't loaded it yet.
  const [staffListPrinting, setStaffListPrinting] = useState(false);
  const handlePrintStaffLists = async () => {
    const win = window.open("", "_blank");
    if (!win) return;
    setStaffListPrinting(true);
    try {
      let data = staffData;
      if (!data) {
        const res = await fetch(`/api/scheduling/staff-sheet?days=${DAYS_PARAM}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load staff schedule");
        data = (await res.json()) as StaffSheetResponse;
      }
      win.document.write(buildStaffJobListDocument(data));
      win.document.close();
    } catch {
      win.close();
    } finally {
      setStaffListPrinting(false);
    }
  };

  const handlePrintColumn = (column: BoardColumn) => {
    if (!board) return;
    openPrintWindow(
      buildPrintDocument([column], board.dateKeys, `${column.name} — All Jobs`, labels),
    );
  };

  const emptyText =
    mode === "machine" ? "No active machines configured." : "No staff scheduled.";

  return (
    <Card data-testid="card-machine-schedule-board">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-lg">
          {mode === "machine" ? <Cog className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          {labels.heading} — All Jobs
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Machine / Staff view toggle */}
          <div className="inline-flex rounded-md border p-0.5" role="group">
            <Button
              size="sm"
              variant={mode === "machine" ? "default" : "ghost"}
              onClick={() => setMode("machine")}
              data-testid="button-view-machine"
            >
              <Cog className="h-4 w-4 mr-2" />
              Machine
            </Button>
            <Button
              size="sm"
              variant={mode === "staff" ? "default" : "ghost"}
              onClick={() => setMode("staff")}
              data-testid="button-view-staff"
            >
              <Users className="h-4 w-4 mr-2" />
              Staff
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintAll}
            disabled={isLoading || !board}
            data-testid="button-print-machine-sheet"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrintStaffLists}
            disabled={staffListPrinting}
            data-testid="button-print-staff-lists"
          >
            <Printer className="h-4 w-4 mr-2" />
            Staff job lists
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : !board || board.columns.length === 0 ? (
          <p className="text-sm text-muted-foreground italic" data-testid="text-no-columns">
            {emptyText}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {board.columns.map((column) => {
              const groups = buildDays(column, board.dateKeys).filter(
                (d) => d.jobs.length > 0 || d.hasSubLabel,
              );
              const todaySubLabel = board.dateKeys.length
                ? subLabelForDay(column, board.dateKeys[0])
                : column.defaultSubLabel ?? "—";
              return (
                <Card
                  key={column.id}
                  className="flex flex-col"
                  data-testid={`pill-column-${column.id}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span data-testid={`text-column-name-${column.id}`}>{column.name}</span>
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="text-xs"
                          data-testid={`badge-sublabel-${column.id}`}
                        >
                          {mode === "machine" ? (
                            <User className="h-3 w-3 mr-1" />
                          ) : (
                            <Cog className="h-3 w-3 mr-1" />
                          )}
                          Today: {todaySubLabel}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePrintColumn(column)}
                          title={`Print ${column.name} handout`}
                          data-testid={`button-print-column-${column.id}`}
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
                                data-testid={`text-day-sublabel-${column.id}-${group.date}`}
                              >
                                {mode === "machine" ? (
                                  <User className="h-3 w-3" />
                                ) : (
                                  <Cog className="h-3 w-3" />
                                )}
                                {subLabelForDay(column, group.date)}
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
                                    {job.contextLabel ? (
                                      <div
                                        className="flex items-center gap-1 text-muted-foreground"
                                        data-testid={`text-context-${job.scheduleId}`}
                                      >
                                        {mode === "machine" ? (
                                          <User className="h-3 w-3" />
                                        ) : (
                                          <Cog className="h-3 w-3" />
                                        )}
                                        {job.contextLabel}
                                      </div>
                                    ) : null}
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

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

interface TvData {
  lastUpdated: string;
  todaysProduction: {
    ordersDueToday: number;
    ordersCompletedToday: number;
    ordersRemainingToday: number;
    ordersOverdue: number;
    garmentsCompletedToday: number;
    garmentsRemainingToday: number;
  };
  dailyTarget: { target: number; completed: number; remaining: number; percent: number };
  capacity: {
    embroidery: DisciplineCapacity | null;
    print: DisciplineCapacity | null;
    packing: DisciplineCapacity | null;
  };
  machines: {
    id: number;
    name: string;
    currentJob: string | null;
    operator: string | null;
    itemsCompletedToday: number;
    itemsRemainingToday: number;
    utilisation: number;
    hasCapacity: boolean;
  }[];
  serviceLevel: {
    shippedOnTimeToday: number;
    onTimeDispatchPercent: number | null;
    ordersAtRisk: number;
    avgTurnaroundDays: number | null;
  };
  quality: {
    daysSinceLastError: number | null;
    errorsThisMonth: number;
    errorFreeOrderPercent: number | null;
  };
  value: { completedToday: number; monthToDate: number; dueToday: number; overdue: number };
  team: {
    onShiftCount: number;
    onShift: string[];
    assignments: { machine: string; operator: string }[];
    unassignedMachines: string[];
  };
  alerts: { severity: "red" | "amber" | "blue"; label: string; count: number }[];
  teamGoal: {
    queueGarments: number;
    queueJobs: number;
    completedThisWeek: number;
    completedLastWeek: number;
    contributors: { id: string; name: string; garmentsThisWeek: number }[];
  };
  operatives: {
    id: string;
    name: string;
    garmentsLastWeek: number;
    garmentsThisWeek: number;
    efficiencyPercent: number | null;
    jobsToDo: { jobLabel: string; date: string }[];
    jobsToDoCount: number;
  }[];
  dueOut: {
    overdueCount: number;
    todayCount: number;
    soonCount: number;
    garmentsRemaining: number;
    totalJobs: number;
    jobs: {
      id: string;
      customer: string;
      jobName: string;
      dueDate: string;
      garmentsRemaining: number;
      status: "overdue" | "today" | "soon";
    }[];
  };
}

interface DisciplineCapacity {
  capacityHours: number;
  usedHours: number;
  remainingHours: number;
  utilisation: number;
  status: "green" | "amber" | "red" | "none";
}

const STATUS_COLOR: Record<string, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  none: "#475569",
};

const PAGE_SECONDS = 60;

function gbp(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function num(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 p-6 ${className}`}
    >
      <div className="text-slate-400 uppercase tracking-widest text-xl font-semibold mb-4">
        {title}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function utilColor(pct: number): string {
  if (pct >= 100) return STATUS_COLOR.red;
  if (pct >= 85) return STATUS_COLOR.amber;
  return STATUS_COLOR.green;
}

function effColor(pct: number | null): string {
  if (pct === null) return "#94a3b8";
  if (pct >= 100) return STATUS_COLOR.green;
  if (pct >= 80) return STATUS_COLOR.amber;
  return STATUS_COLOR.red;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function DashboardTv() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);

  const { data, isLoading, isError, error } = useQuery<TvData>({
    queryKey: ["/api/dashboard-tv/data", token],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard-tv/data?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(text);
      }
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
    staleTime: 0,
    retry: false,
  });

  const operativePages = useMemo(() => chunk(data?.operatives ?? [], 4), [data?.operatives]);
  const pageCount = data ? 3 + operativePages.length : 1;
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [navNonce, setNavNonce] = useState(0);

  const goToPage = (target: number) => {
    setPage(((target % pageCount) + pageCount) % pageCount);
    setNavNonce((n) => n + 1);
  };

  useEffect(() => {
    if (pageCount <= 1 || paused) return;
    const t = setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, PAGE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [pageCount, paused, navNonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPage((p) => ((p - 1) % pageCount + pageCount) % pageCount);
        setNavNonce((n) => n + 1);
      } else if (e.key === "ArrowRight") {
        setPage((p) => (p + 1) % pageCount);
        setNavNonce((n) => n + 1);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  useEffect(() => {
    if (data && page >= pageCount) setPage(0);
  }, [data, page, pageCount]);

  if (!token) {
    return (
      <FullScreen>
        <div className="text-center">
          <div className="text-5xl font-bold text-white mb-4">Display link required</div>
          <div className="text-2xl text-slate-400">
            Ask an administrator for the secure dashboard link.
          </div>
        </div>
      </FullScreen>
    );
  }

  if (isLoading) {
    return (
      <FullScreen>
        <div className="text-4xl text-slate-400 animate-pulse">Loading production data…</div>
      </FullScreen>
    );
  }

  if (isError || !data) {
    return (
      <FullScreen>
        <div className="text-center">
          <div className="text-5xl font-bold text-red-400 mb-4">Unable to load dashboard</div>
          <div className="text-2xl text-slate-400">{(error as Error)?.message || "Please check the display link."}</div>
        </div>
      </FullScreen>
    );
  }

  return (
    <Scaler>
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          {page === 0 && <OpsPage data={data} />}
          {page === 1 && <DueOutPage data={data} />}
          {page === 2 && <TeamGoalPage data={data} />}
          {page >= 3 && operativePages[page - 3] && (
            <OperativesPage
              data={data}
              operatives={operativePages[page - 3]}
              pageNo={page - 2}
              pageTotal={operativePages.length}
            />
          )}
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4" data-testid="page-dots">
            <button
              onClick={() => goToPage(page - 1)}
              className="flex items-center justify-center rounded-full w-10 h-10 bg-slate-800/80 ring-1 ring-slate-700 text-slate-300 hover:bg-slate-700"
              data-testid="button-page-prev"
              aria-label="Previous screen"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 28 : 12,
                  height: 12,
                  backgroundColor: i === page ? "#3b82f6" : "#334155",
                }}
                data-testid={`button-page-dot-${i}`}
                aria-label={`Go to screen ${i + 1}`}
              />
            ))}
            <button
              onClick={() => goToPage(page + 1)}
              className="flex items-center justify-center rounded-full w-10 h-10 bg-slate-800/80 ring-1 ring-slate-700 text-slate-300 hover:bg-slate-700"
              data-testid="button-page-next"
              aria-label="Next screen"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className={`flex items-center justify-center rounded-full w-10 h-10 ring-1 ${
                paused
                  ? "bg-amber-500/20 ring-amber-500 text-amber-400"
                  : "bg-slate-800/80 ring-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
              data-testid="button-page-pause"
              aria-label={paused ? "Resume rotation" : "Pause rotation"}
            >
              {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
            {paused && (
              <span className="text-lg font-semibold text-amber-400" data-testid="text-paused">
                Paused
              </span>
            )}
          </div>
        )}
      </div>
    </Scaler>
  );
}

function PageHeader({ title, lastUpdated }: { title: string; lastUpdated: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-5xl font-black tracking-tight">{title}</div>
      <div className="text-2xl text-slate-400" data-testid="text-last-updated">
        Last updated {lastUpdated}
      </div>
    </div>
  );
}

// ── Page 2: Due out (next 48 hours + overdue) ───────────────────────────────
function fmtDueDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

const DUE_STATUS = {
  overdue: { color: "#ef4444", label: "OVERDUE" },
  today: { color: "#f59e0b", label: "DUE TODAY" },
  soon: { color: "#3b82f6", label: "NEXT 48 HRS" },
} as const;

function DueOutPage({ data }: { data: TvData }) {
  const d = data.dueOut;
  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Due Out — Next 48 Hours" lastUpdated={data.lastUpdated} />

      <div className="grid grid-cols-4 gap-5">
        <SummaryTile label="Overdue" value={d.overdueCount} color={DUE_STATUS.overdue.color} testId="tile-overdue" />
        <SummaryTile label="Due today" value={d.todayCount} color={DUE_STATUS.today.color} testId="tile-due-today" />
        <SummaryTile label="Next 48 hrs" value={d.soonCount} color={DUE_STATUS.soon.color} testId="tile-soon" />
        <SummaryTile label="Garments to make" value={d.garmentsRemaining} color="#e2e8f0" testId="tile-garments" />
      </div>

      <div className="flex-1 min-h-0 rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 p-6 overflow-hidden">
        {d.jobs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-4xl text-emerald-400 font-bold">
            Nothing due in the next 48 hours — all clear!
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 content-start">
            {d.jobs.map((j) => {
              const s = DUE_STATUS[j.status];
              return (
                <div
                  key={j.id}
                  className="flex items-center gap-4 rounded-xl px-4 py-3"
                  style={{ backgroundColor: `${s.color}1a`, border: `2px solid ${s.color}55` }}
                  data-testid={`row-dueout-${j.id}`}
                >
                  <div
                    className="text-lg font-black px-3 py-1 rounded-md whitespace-nowrap"
                    style={{ backgroundColor: s.color, color: "#0f172a" }}
                  >
                    {j.status === "overdue" ? `WAS DUE ${fmtDueDay(j.dueDate).toUpperCase()}` : j.status === "today" ? "DUE TODAY" : fmtDueDay(j.dueDate).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold truncate">{j.jobName}</div>
                    <div className="text-xl text-slate-400 truncate">{j.customer}</div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-3xl font-black" style={{ color: s.color }}>
                      {num(j.garmentsRemaining)}
                    </div>
                    <div className="text-base text-slate-400">left to make</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {d.totalJobs > d.jobs.length && (
          <div className="text-center text-2xl text-slate-400 mt-4">
            + {d.totalJobs - d.jobs.length} more jobs due out
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
  testId,
}: {
  label: string;
  value: number;
  color: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 p-5 flex items-center gap-5"
      data-testid={testId}
    >
      <div className="font-black leading-none" style={{ fontSize: 64, color }}>
        {num(value)}
      </div>
      <div className="text-2xl text-slate-300 font-semibold leading-tight">{label}</div>
    </div>
  );
}

// ── Page 3: Team goal ────────────────────────────────────────────────────────
function TeamGoalPage({ data }: { data: TvData }) {
  const g = data.teamGoal;
  const top = g.contributors.slice(0, 8);
  const maxGarments = Math.max(1, ...top.map((c) => c.garmentsThisWeek));
  const delta = g.completedThisWeek - g.completedLastWeek;

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Team Goal — We Win Together" lastUpdated={data.lastUpdated} />

      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Big shared goal */}
        <div className="col-span-7 flex flex-col gap-5 min-h-0">
          <Panel title="The Mountain to Climb" className="flex-1">
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div
                className="font-black leading-none text-white"
                style={{ fontSize: 200 }}
                data-testid="text-queue-garments"
              >
                {num(g.queueGarments)}
              </div>
              <div className="text-4xl text-slate-300 mt-4 font-semibold">
                garments in the queue
              </div>
              <div className="text-2xl text-slate-500 mt-2">
                across {num(g.queueJobs)} jobs — every one we finish brings the number down
              </div>
            </div>
          </Panel>
        </div>

        {/* This week's team effort */}
        <div className="col-span-5 flex flex-col gap-5 min-h-0">
          <Panel title="Completed This Week — Whole Team">
            <div className="flex items-end gap-8">
              <div
                className="font-black leading-none text-emerald-400"
                style={{ fontSize: 110 }}
                data-testid="text-completed-this-week"
              >
                {num(g.completedThisWeek)}
              </div>
              <div className="pb-2">
                <div
                  className="text-3xl font-bold"
                  style={{ color: delta >= 0 ? STATUS_COLOR.green : STATUS_COLOR.amber }}
                >
                  {delta >= 0 ? "▲" : "▼"} {num(Math.abs(delta))}
                </div>
                <div className="text-xl text-slate-400">vs last week ({num(g.completedLastWeek)})</div>
              </div>
            </div>
          </Panel>

          <Panel title="Everyone's Contribution This Week" className="flex-1">
            {top.length === 0 ? (
              <div className="flex items-center h-full text-2xl text-slate-500">
                No garments recorded yet this week — let's get on the board!
              </div>
            ) : (
              <div className="flex flex-col gap-3 justify-center h-full">
                {top.map((c) => (
                  <div key={c.id} className="flex items-center gap-4" data-testid={`row-contributor-${c.id}`}>
                    <div className="w-44 text-2xl font-semibold truncate">{c.name}</div>
                    <div className="flex-1 h-8 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(4, Math.round((c.garmentsThisWeek / maxGarments) * 100))}%`,
                          backgroundColor: "#3b82f6",
                        }}
                      />
                    </div>
                    <div className="w-24 text-right text-2xl font-black text-emerald-400">
                      {num(c.garmentsThisWeek)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Page 3+: Operative cards ─────────────────────────────────────────────────
function OperativesPage({
  data,
  operatives,
  pageNo,
  pageTotal,
}: {
  data: TvData;
  operatives: TvData["operatives"];
  pageNo: number;
  pageTotal: number;
}) {
  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader
        title={`Our Team${pageTotal > 1 ? ` (${pageNo} of ${pageTotal})` : ""}`}
        lastUpdated={data.lastUpdated}
      />
      <div className="grid grid-cols-2 grid-rows-2 gap-5 flex-1 min-h-0">
        {operatives.map((o) => (
          <div
            key={o.id}
            className="flex flex-col rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 p-6 min-h-0"
            data-testid={`card-operative-${o.id}`}
          >
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="text-4xl font-black truncate">{o.name}</div>
              <div
                className="text-4xl font-black"
                style={{ color: effColor(o.efficiencyPercent) }}
                title="Efficiency vs estimate (last week)"
              >
                {o.efficiencyPercent !== null ? `${o.efficiencyPercent}%` : "—"}
              </div>
            </div>
            <div className="flex items-end gap-10 mb-3">
              <div>
                <div className="text-6xl font-black text-emerald-400 leading-none">
                  {num(o.garmentsThisWeek)}
                </div>
                <div className="text-lg text-slate-400 mt-1">garments this week</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-slate-300 leading-none">
                  {num(o.garmentsLastWeek)}
                </div>
                <div className="text-lg text-slate-500 mt-1">last week</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-amber-400 leading-none">
                  {num(o.jobsToDoCount)}
                </div>
                <div className="text-lg text-slate-500 mt-1">jobs lined up</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {o.jobsToDo.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {o.jobsToDo.map((j, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-xl">
                      <span className="truncate text-slate-300">{j.jobLabel}</span>
                      <span className="text-slate-500 whitespace-nowrap">
                        {new Date(`${j.date}T12:00:00Z`).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xl text-slate-500">Nothing scheduled yet</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page 1: Operations board ─────────────────────────────────────────────────
const ALERT_ORDER: Record<string, number> = { red: 0, amber: 1, blue: 2 };

function OpsPage({ data }: { data: TvData }) {
  const tp = data.todaysProduction;
  const dt = data.dailyTarget;
  const alerts = [...data.alerts].sort(
    (a, b) => ALERT_ORDER[a.severity] - ALERT_ORDER[b.severity] || b.count - a.count,
  );
  const shownAlerts = alerts.slice(0, 4);

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Production — Today" lastUpdated={data.lastUpdated} />

      {/* Headline numbers */}
      <div className="grid grid-cols-4 gap-5">
        <SummaryTile label="Due today" value={tp.ordersDueToday} color="#e2e8f0" testId="tile-ops-due-today" />
        <SummaryTile
          label="Completed today"
          value={tp.ordersCompletedToday}
          color={STATUS_COLOR.green}
          testId="tile-ops-completed"
        />
        <SummaryTile
          label="Overdue"
          value={tp.ordersOverdue}
          color={tp.ordersOverdue > 0 ? STATUS_COLOR.red : "#e2e8f0"}
          testId="tile-ops-overdue"
        />
        <SummaryTile
          label="Garments left today"
          value={tp.garmentsRemainingToday}
          color={STATUS_COLOR.amber}
          testId="tile-ops-garments-left"
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Machines — compact rows, scales with any number of machines */}
        <Panel title="Machines" className="col-span-8 min-h-0">
          <div className="flex flex-col justify-evenly h-full">
            {data.machines.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-5 py-1"
                data-testid={`card-machine-${m.id}`}
              >
                <div className="w-56 text-3xl font-bold truncate">{m.name}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl text-slate-300 truncate">
                    {m.currentJob ?? <span className="text-slate-500">Idle</span>}
                    {m.operator ? (
                      <span className="text-slate-500"> · {m.operator}</span>
                    ) : (
                      <span className="text-red-400"> · No operator</span>
                    )}
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden mt-1.5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, m.hasCapacity ? m.utilisation : 0)}%`,
                        backgroundColor: m.hasCapacity ? utilColor(m.utilisation) : STATUS_COLOR.none,
                      }}
                    />
                  </div>
                </div>
                <div className="w-40 text-right text-xl text-slate-400 whitespace-nowrap">
                  <span className="text-emerald-400 font-bold">{m.itemsCompletedToday}</span> done ·{" "}
                  <span className="text-amber-400 font-bold">{m.itemsRemainingToday}</span> left
                </div>
                <div
                  className="w-24 text-right text-3xl font-black"
                  style={{ color: m.hasCapacity ? utilColor(m.utilisation) : STATUS_COLOR.none }}
                >
                  {m.hasCapacity ? `${m.utilisation}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Right column: target + capacity */}
        <div className="col-span-4 flex flex-col gap-5 min-h-0">
          <Panel title="Daily Target">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <div
                  className="font-black leading-none"
                  style={{ fontSize: 88, color: dt.percent >= 100 ? STATUS_COLOR.green : "#ffffff" }}
                  data-testid="text-target-percent"
                >
                  {dt.percent}%
                </div>
              </div>
              <div className="text-right pb-1">
                <div className="text-3xl font-bold text-emerald-400">{num(dt.completed)}</div>
                <div className="text-xl text-slate-400">of {num(dt.target)} garments</div>
              </div>
            </div>
            <div className="h-8 w-full rounded-full bg-slate-800 overflow-hidden ring-1 ring-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, dt.percent)}%`,
                  backgroundColor: dt.percent >= 100 ? STATUS_COLOR.green : "#3b82f6",
                }}
              />
            </div>
          </Panel>

          <Panel title="Capacity Remaining" className="flex-1">
            <div className="flex flex-col gap-4 h-full justify-center">
              <CapacityRow label="Embroidery" cap={data.capacity.embroidery} />
              <CapacityRow label="Print" cap={data.capacity.print} />
              <CapacityRow label="Packing" cap={data.capacity.packing} />
            </div>
          </Panel>

          <Panel title="Quality">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <div
                  className="font-black leading-none text-6xl"
                  style={{
                    color:
                      data.quality.daysSinceLastError === null || data.quality.daysSinceLastError >= 7
                        ? STATUS_COLOR.green
                        : data.quality.daysSinceLastError >= 1
                        ? STATUS_COLOR.amber
                        : STATUS_COLOR.red,
                  }}
                  data-testid="text-days-since-error"
                >
                  {data.quality.daysSinceLastError ?? "—"}
                </div>
                <div className="text-xl text-slate-400">days since last error</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-white">
                  {data.serviceLevel.onTimeDispatchPercent === null
                    ? "—"
                    : `${data.serviceLevel.onTimeDispatchPercent}%`}
                </div>
                <div className="text-lg text-slate-400">on-time this month</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Bottom strip: alerts + team, one calm row */}
      <div className="flex items-center gap-4 rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 px-6 py-4">
        {shownAlerts.length === 0 ? (
          <div className="text-2xl font-bold text-emerald-400">All clear — no production issues</div>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
            {shownAlerts.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl px-4 py-2 ring-1 whitespace-nowrap"
                style={{
                  backgroundColor: `${STATUS_COLOR[a.severity === "blue" ? "none" : a.severity]}22`,
                  borderColor: STATUS_COLOR[a.severity === "blue" ? "none" : a.severity],
                }}
                data-testid={`alert-${i}`}
              >
                <span className="text-xl font-semibold">{a.label}</span>
                <span
                  className="text-2xl font-black"
                  style={{ color: STATUS_COLOR[a.severity === "blue" ? "none" : a.severity] }}
                >
                  {a.count}
                </span>
              </div>
            ))}
            {alerts.length > shownAlerts.length && (
              <span className="text-xl text-slate-400 whitespace-nowrap">
                +{alerts.length - shownAlerts.length} more
              </span>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
          <span className="text-4xl font-black text-emerald-400">{data.team.onShiftCount}</span>
          <span className="text-xl text-slate-400">on shift</span>
        </div>
      </div>
    </div>
  );
}

function Scaler({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const compute = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden flex items-center justify-center">
      <div
        className="bg-slate-950 text-white p-8"
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CapacityRow({ label, cap }: { label: string; cap: DisciplineCapacity | null }) {
  if (!cap || cap.status === "none") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl font-semibold">{label}</span>
        <span className="text-xl text-slate-500">No data</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl font-semibold">{label}</span>
        <span className="text-2xl font-bold" style={{ color: STATUS_COLOR[cap.status] }}>
          {cap.remainingHours}h left
        </span>
      </div>
      <div className="h-4 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, cap.utilisation)}%`, backgroundColor: STATUS_COLOR[cap.status] }}
        />
      </div>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">{children}</div>
  );
}

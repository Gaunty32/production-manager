import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

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

function Stat({
  label,
  value,
  color = "text-white",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <div className={`font-extrabold leading-none text-6xl ${color}`}>{value}</div>
      <div className="text-slate-400 text-xl mt-2">{label}</div>
      {sub && <div className="text-slate-500 text-base mt-1">{sub}</div>}
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
  const pageCount = data ? 2 + operativePages.length : 1;
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, PAGE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [pageCount]);

  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

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
          {page === 1 && <TeamGoalPage data={data} />}
          {page >= 2 && operativePages[page - 2] && (
            <OperativesPage
              data={data}
              operatives={operativePages[page - 2]}
              pageNo={page - 1}
              pageTotal={operativePages.length}
            />
          )}
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4" data-testid="page-dots">
            {Array.from({ length: pageCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 28 : 12,
                  height: 12,
                  backgroundColor: i === page ? "#3b82f6" : "#334155",
                }}
              />
            ))}
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

// ── Page 2: Team goal ────────────────────────────────────────────────────────
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

// ── Page 1: Operations board (unchanged content) ─────────────────────────────
function OpsPage({ data }: { data: TvData }) {
  const tp = data.todaysProduction;
  const dt = data.dailyTarget;

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Production — Today" lastUpdated={data.lastUpdated} />

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Left column */}
        <div className="col-span-3 flex flex-col gap-5 min-h-0">
          <Panel title="Today's Production" className="flex-1">
            <div className="grid grid-cols-2 gap-y-6 gap-x-4 h-full content-between">
              <Stat label="Due today" value={tp.ordersDueToday} />
              <Stat label="Completed" value={tp.ordersCompletedToday} color="text-emerald-400" />
              <Stat label="Remaining" value={tp.ordersRemainingToday} color="text-amber-400" />
              <Stat
                label="Overdue"
                value={tp.ordersOverdue}
                color={tp.ordersOverdue > 0 ? "text-red-400" : "text-white"}
              />
            </div>
          </Panel>

          <Panel title="Garments" className="flex-1">
            <div className="flex flex-col justify-between h-full">
              <Stat
                label="Completed today"
                value={tp.garmentsCompletedToday}
                color="text-emerald-400"
              />
              <Stat label="Remaining today" value={tp.garmentsRemainingToday} color="text-amber-400" />
            </div>
          </Panel>
        </div>

        {/* Center column */}
        <div className="col-span-6 flex flex-col gap-5 min-h-0">
          {/* Daily target */}
          <Panel title="Daily Target">
            <div className="flex items-end justify-between gap-6 mb-4">
              <Stat label="Target" value={dt.target} />
              <Stat label="Completed" value={dt.completed} color="text-emerald-400" />
              <Stat label="Remaining" value={dt.remaining} color="text-amber-400" />
              <div className="text-right">
                <div
                  className="font-black leading-none text-7xl"
                  style={{ color: dt.percent >= 100 ? STATUS_COLOR.green : "#ffffff" }}
                  data-testid="text-target-percent"
                >
                  {dt.percent}%
                </div>
              </div>
            </div>
            <div className="h-10 w-full rounded-full bg-slate-800 overflow-hidden ring-1 ring-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${dt.percent}%`,
                  backgroundColor: dt.percent >= 100 ? STATUS_COLOR.green : "#3b82f6",
                }}
              />
            </div>
          </Panel>

          {/* Machine utilisation */}
          <Panel title="Machine Utilisation" className="flex-1">
            <div className="grid grid-cols-2 gap-4 h-full content-start">
              {data.machines.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700/60 p-4 flex flex-col gap-1"
                  data-testid={`card-machine-${m.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-2xl font-bold truncate">{m.name}</div>
                    <div
                      className="text-2xl font-black"
                      style={{ color: m.hasCapacity ? utilColor(m.utilisation) : STATUS_COLOR.none }}
                    >
                      {m.hasCapacity ? `${m.utilisation}%` : "—"}
                    </div>
                  </div>
                  <div className="text-lg text-slate-300 truncate">
                    {m.currentJob ?? <span className="text-slate-500">Idle</span>}
                  </div>
                  <div className="text-base text-slate-400 truncate">
                    {m.operator ? `Operator: ${m.operator}` : <span className="text-red-400">No operator</span>}
                  </div>
                  <div className="text-base text-slate-400 mt-1">
                    <span className="text-emerald-400 font-semibold">{m.itemsCompletedToday}</span> done ·{" "}
                    <span className="text-amber-400 font-semibold">{m.itemsRemainingToday}</span> left
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right column */}
        <div className="col-span-3 flex flex-col gap-5 min-h-0">
          {/* Quality */}
          <Panel title="Days Since Last Error">
            <div className="flex flex-col items-center justify-center">
              <div
                className="font-black leading-none text-8xl"
                style={{
                  color:
                    data.quality.daysSinceLastError === null
                      ? STATUS_COLOR.green
                      : data.quality.daysSinceLastError >= 7
                      ? STATUS_COLOR.green
                      : data.quality.daysSinceLastError >= 1
                      ? STATUS_COLOR.amber
                      : STATUS_COLOR.red,
                }}
                data-testid="text-days-since-error"
              >
                {data.quality.daysSinceLastError ?? "—"}
              </div>
              <div className="text-slate-400 text-lg mt-3 text-center">
                {data.quality.errorsThisMonth} errors this month
                {data.quality.errorFreeOrderPercent !== null &&
                  ` · ${data.quality.errorFreeOrderPercent}% error-free`}
              </div>
            </div>
          </Panel>

          {/* Capacity */}
          <Panel title="Capacity Remaining" className="flex-1">
            <div className="flex flex-col gap-3 h-full justify-center">
              <CapacityRow label="Embroidery" cap={data.capacity.embroidery} />
              <CapacityRow label="Print" cap={data.capacity.print} />
              <CapacityRow label="Packing" cap={data.capacity.packing} />
            </div>
          </Panel>

          {/* Service + value */}
          <Panel title="Service & Value" className="flex-1">
            <div className="grid grid-cols-2 gap-y-4 gap-x-3 h-full content-between">
              <SmallStat
                label="On-time (month)"
                value={
                  data.serviceLevel.onTimeDispatchPercent === null
                    ? "—"
                    : `${data.serviceLevel.onTimeDispatchPercent}%`
                }
              />
              <SmallStat label="At risk" value={data.serviceLevel.ordersAtRisk} color={data.serviceLevel.ordersAtRisk > 0 ? "text-amber-400" : "text-white"} />
              <SmallStat
                label="Avg turnaround"
                value={
                  data.serviceLevel.avgTurnaroundDays === null
                    ? "—"
                    : `${data.serviceLevel.avgTurnaroundDays}d`
                }
              />
              <SmallStat label="Shipped today" value={data.serviceLevel.shippedOnTimeToday} color="text-emerald-400" />
              <SmallStat label="Value today" value={gbp(data.value.completedToday)} color="text-emerald-400" />
              <SmallStat label="Value MTD" value={gbp(data.value.monthToDate)} />
            </div>
          </Panel>
        </div>
      </div>

      {/* Bottom row: team + alerts */}
      <div className="grid grid-cols-12 gap-5" style={{ height: "18%" }}>
        <Panel title="Active Team" className="col-span-5">
          <div className="flex items-start justify-between gap-6 h-full">
            <div>
              <div className="text-6xl font-black text-emerald-400 leading-none">
                {data.team.onShiftCount}
              </div>
              <div className="text-slate-400 text-lg mt-1">on shift now</div>
            </div>
            <div className="flex-1 min-w-0 text-lg text-slate-300 leading-snug overflow-hidden">
              {data.team.onShift.length > 0 ? (
                data.team.onShift.join(" · ")
              ) : (
                <span className="text-slate-500">No one currently on shift</span>
              )}
              {data.team.unassignedMachines.length > 0 && (
                <div className="text-amber-400 mt-2">
                  Unassigned: {data.team.unassignedMachines.join(", ")}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Alerts" className="col-span-7">
          {data.alerts.length === 0 ? (
            <div className="flex items-center h-full text-3xl font-bold text-emerald-400">
              All clear — no production issues
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 h-full content-start">
              {data.alerts.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl px-4 py-2 ring-1"
                  style={{
                    backgroundColor: `${STATUS_COLOR[a.severity === "blue" ? "none" : a.severity]}22`,
                    borderColor: STATUS_COLOR[a.severity === "blue" ? "none" : a.severity],
                  }}
                  data-testid={`alert-${i}`}
                >
                  <span className="text-2xl font-semibold truncate">{a.label}</span>
                  <span
                    className="text-3xl font-black"
                    style={{ color: STATUS_COLOR[a.severity === "blue" ? "none" : a.severity] }}
                  >
                    {a.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
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

function SmallStat({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <div className={`font-extrabold leading-none text-4xl ${color}`}>{value}</div>
      <div className="text-slate-400 text-base mt-1">{label}</div>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">{children}</div>
  );
}

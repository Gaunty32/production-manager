import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

interface TvData {
  lastUpdated: string;
  orderSystemUrl: string | null;
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
      allocatedTo: string[];
    }[];
  };
  todaysPlan: {
    people: {
      name: string;
      doneCount: number;
      totalCount: number;
      garmentsRemaining: number;
      items: PlanItem[];
    }[];
    machines: { name: string; items: PlanItem[]; totalCount: number }[];
  };
  upNext: {
    totalCount: number;
    rows: {
      id: string;
      jobLabel: string;
      quantity: number;
      person: string | null;
      machine: string | null;
      dueDate: string | null;
      status: "overdue" | "today" | "tomorrow" | "later";
    }[];
  };
}

interface PlanItem {
  jobLabel: string;
  machine: string | null;
  operator: string | null;
  start: string;
  end: string;
  startMin: number;
  remaining: number;
  quantity: number;
  done: boolean;
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
const UP_NEXT_SECONDS = 180;

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

function effTarget(pct: number | null): { label: string; color: string; arrow: string } | null {
  if (pct === null) return null;
  if (pct >= 110) return { label: "Above target", color: STATUS_COLOR.green, arrow: "▲" };
  if (pct >= 90) return { label: "On target", color: STATUS_COLOR.green, arrow: "●" };
  return { label: "Below target", color: STATUS_COLOR.red, arrow: "▼" };
}

// Keep the TV awake. Firestick/Silk starts the screensaver after a few
// minutes without input, hiding the dashboard. Two defences:
// 1. Screen Wake Lock API (asks the browser to keep the screen on),
//    re-acquired whenever the page becomes visible again AND retried on a
//    timer, because Fire OS can silently release it.
// 2. A muted, always-playing video fed from a canvas stream. TV browsers
//    only honour "video is playing, keep the screen on" when the video is
//    genuinely visible at a reasonable size — a 1px hidden video gets
//    ignored. So the video is 320x180 in the bottom-left corner, painting
//    the exact same colour as the page background (slate-950), making it
//    invisible to the eye but "real" to the browser.
function useKeepAwake(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    // --- 1. Screen Wake Lock (with periodic re-acquire) ---
    let wakeLock: { released?: boolean; release: () => Promise<void> } | null = null;
    let disposed = false;
    const requestLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (
              type: "screen",
            ) => Promise<{ released?: boolean; release: () => Promise<void> }>;
          };
        };
        if (nav.wakeLock && document.visibilityState === "visible") {
          const lock = await nav.wakeLock.request("screen");
          if (disposed) {
            void lock.release().catch(() => {});
          } else {
            wakeLock = lock;
          }
        }
      } catch {
        // Wake lock unsupported or denied — the video fallback still applies
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void requestLock();
    };
    void requestLock();
    document.addEventListener("visibilitychange", onVisibility);
    // Fire OS can drop the lock without telling us — re-request every 30s.
    const lockTimer = setInterval(() => {
      if (!wakeLock || wakeLock.released) void requestLock();
    }, 30000);

    // --- 2. Visible-but-invisible playing video (canvas stream) ---
    let video: HTMLVideoElement | null = null;
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    const retryPlay = () => {
      if (video && video.paused) void video.play().catch(() => {});
    };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (ctx && typeof canvas.captureStream === "function") {
        let tick = 0;
        // Redraw a few times a second so the stream keeps producing frames.
        // Alternate between two imperceptibly different near-identical
        // shades of the page background so frames are never "static".
        const paint = () => {
          tick = (tick + 1) % 2;
          ctx.fillStyle = tick ? "#020617" : "#030618";
          ctx.fillRect(0, 0, 320, 180);
        };
        paint();
        drawTimer = setInterval(paint, 500);
        video = document.createElement("video");
        video.muted = true;
        video.setAttribute("playsinline", "");
        video.srcObject = canvas.captureStream(5);
        video.style.position = "fixed";
        video.style.left = "0";
        video.style.bottom = "0";
        video.style.width = "320px";
        video.style.height = "180px";
        video.style.pointerEvents = "none";
        video.style.zIndex = "0";
        document.body.appendChild(video);
        void video.play().catch(() => {});
        // Autoplay can be blocked until the first remote/mouse input —
        // retry on any interaction.
        window.addEventListener("pointerdown", retryPlay);
        window.addEventListener("keydown", retryPlay);
        document.addEventListener("visibilitychange", retryPlay);
      }
    } catch {
      // Best effort only
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(lockTimer);
      if (wakeLock) void wakeLock.release().catch(() => {});
      if (drawTimer) clearInterval(drawTimer);
      window.removeEventListener("pointerdown", retryPlay);
      window.removeEventListener("keydown", retryPlay);
      document.removeEventListener("visibilitychange", retryPlay);
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
      }
    };
  }, [enabled]);
}

export default function DashboardTv() {
  // Read the token from the URL; remember it so a TV that has loaded the
  // dashboard once can come back to plain /dashboard-tv and still work
  // (Firestick/TV browsers often drop the query string from history).
  const token = useMemo(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token") ?? "";
    try {
      if (fromUrl) {
        localStorage.setItem("tv-dashboard-token", fromUrl);
        return fromUrl;
      }
      return localStorage.getItem("tv-dashboard-token") ?? "";
    } catch {
      return fromUrl;
    }
  }, []);

  // Stop Firestick/Silk from starting the screensaver while the dashboard is up.
  useKeepAwake(!!token);

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

  const hasTeamPage = (data?.operatives?.length ?? 0) > 0;
  const hasOrderPage = !!data?.orderSystemUrl;
  const orderOffset = hasOrderPage ? 1 : 0;
  const pageCount = data ? 4 + orderOffset + (hasTeamPage ? 1 : 0) : 1;
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [navNonce, setNavNonce] = useState(0);

  // No on-screen buttons — the TV stays clean. Navigation still works from
  // the remote/keyboard: left/right arrows change page, space pauses,
  // "f" toggles full screen.
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen not supported on this browser — nothing else to do
    }
  };

  useEffect(() => {
    if (pageCount <= 1 || paused) return;
    const upNextIndex = pageCount - 1;
    const seconds = page === upNextIndex ? UP_NEXT_SECONDS : PAGE_SECONDS;
    const t = setTimeout(() => {
      setPage((p) => (p + 1) % pageCount);
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [page, pageCount, paused, navNonce]);

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
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
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
      <div className="relative flex flex-col h-full">
        <div className="flex-1 min-h-0">
          {page === 0 && <TodaysPlanPage data={data} />}
          {hasOrderPage && page === 1 && <OrderSystemPage url={data.orderSystemUrl!} />}
          {page === 1 + orderOffset && <DueOutPage data={data} />}
          {page === 2 + orderOffset && <TeamGoalPage data={data} />}
          {hasTeamPage && page === 3 + orderOffset && <OperativesPage data={data} />}
          {page === 3 + orderOffset + (hasTeamPage ? 1 : 0) && <UpNextPage data={data} />}
        </div>
        {paused && (
          <div
            className="absolute bottom-4 right-6 rounded-full bg-amber-500/20 ring-1 ring-amber-500 px-5 py-2 text-lg font-semibold text-amber-400"
            data-testid="text-paused"
          >
            Paused
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

// ── Page: Today's plan — per-person to-do list + machine line-up ─────────────
function PlanItemRow({ item, showMachine }: { item: PlanItem; showMachine: boolean }) {
  return (
    <div className="flex items-start gap-3" data-testid="row-plan-item">
      {item.done ? (
        <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" style={{ color: STATUS_COLOR.green }} />
      ) : (
        <Circle className="w-6 h-6 shrink-0 mt-0.5 text-slate-600" />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={`text-xl truncate ${item.done ? "text-slate-500 line-through" : "text-slate-200"}`}
        >
          {item.jobLabel}
        </div>
        <div className="flex items-center gap-2 text-base">
          <span className="text-slate-500 whitespace-nowrap">{item.start}</span>
          {showMachine && item.machine && (
            <span className="text-slate-400 whitespace-nowrap rounded-md bg-slate-800 ring-1 ring-slate-700 px-2 py-0.5">
              {item.machine}
            </span>
          )}
        </div>
      </div>
      <span
        className={`whitespace-nowrap text-right font-semibold text-xl mt-0.5 ${
          item.done ? "text-slate-500" : "text-amber-400"
        }`}
      >
        {item.done ? "Done" : `${num(item.remaining)} pcs`}
      </span>
    </div>
  );
}

function TodaysPlanPage({ data }: { data: TvData }) {
  const plan = data.todaysPlan;
  const nothing = plan.people.length === 0;

  const peopleShown = plan.people.slice(0, 6);
  const morePeople = plan.people.length - peopleShown.length;
  // Full-width layout: up to 4 people fit in 2 columns, more in 3 columns.
  const cols = peopleShown.length <= 4 ? 2 : 3;
  const itemsPerPerson = peopleShown.length <= 2 ? 5 : 3;

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Today's Plan" lastUpdated={data.lastUpdated} />

      {nothing ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl font-bold text-slate-300 mb-4">Nothing scheduled for today yet</div>
            <div className="text-2xl text-slate-500">
              Jobs booked on the Machine Schedule will appear here.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          <Panel title="By Person" className="flex-1 min-h-0">
            <div className="flex flex-col gap-3 h-full overflow-hidden">
              <div
                className="grid gap-4 content-start flex-1 min-h-0 overflow-hidden"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {peopleShown.map((p) => (
                    <div
                      key={p.name}
                      className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700/60 p-4 flex flex-col gap-2 min-w-0"
                      data-testid={`card-plan-person-${p.name}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-2xl font-bold truncate">{p.name}</div>
                        <div className="text-xl whitespace-nowrap">
                          <span className="text-emerald-400 font-bold">{p.doneCount}</span>
                          <span className="text-slate-500"> / {p.totalCount} done</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {p.items.slice(0, itemsPerPerson).map((item, i) => (
                          <PlanItemRow key={i} item={item} showMachine />
                        ))}
                        {p.totalCount > Math.min(p.items.length, itemsPerPerson) && (
                          <div className="text-lg text-slate-500 pl-9">
                            +{p.totalCount - Math.min(p.items.length, itemsPerPerson)} more
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              {morePeople > 0 && (
                <div className="text-lg text-slate-500 shrink-0">
                  +{morePeople} more {morePeople === 1 ? "person" : "people"} with scheduled work
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

// ── Order System (wardrobe) production screen — embedded ───────────────────
function OrderSystemPage({ url }: { url: string }) {
  return (
    <div className="h-full rounded-2xl overflow-hidden ring-1 ring-slate-700/60 bg-slate-900/70">
      <iframe
        src={url}
        title="Order System — Production Today's Plan"
        className="w-full h-full border-0"
        data-testid="iframe-order-system"
      />
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
        <SummaryTile label="Garments outstanding" value={d.garmentsRemaining} color="#e2e8f0" testId="tile-garments" />
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
                    <div className="text-xl text-slate-400 truncate">
                      {j.customer}
                      {j.allocatedTo.length > 0 && (
                        <span className="text-slate-300"> · {j.allocatedTo.join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-3xl font-black" style={{ color: s.color }}>
                      {num(j.garmentsRemaining)}
                    </div>
                    <div className="text-base text-slate-400">outstanding</div>
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

// ── Final page: Up Next — the jobs to be done next ──────────────────────────
const UP_NEXT_STATUS = {
  overdue: { color: "#ef4444", label: "OVERDUE", flash: true },
  today: { color: "#ef4444", label: "DUE TODAY", flash: true },
  tomorrow: { color: "#22c55e", label: "TOMORROW", flash: false },
  later: { color: "#94a3b8", label: "", flash: false },
} as const;

function UpNextPage({ data }: { data: TvData }) {
  const u = data.upNext;
  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Up Next" lastUpdated={data.lastUpdated} />

      <div className="flex-1 min-h-0 rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 p-6 overflow-hidden flex flex-col">
        {u.rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-4xl text-emerald-400 font-bold">
            Nothing outstanding — all caught up!
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_150px_220px_220px_280px] gap-4 px-4 pb-3 text-xl font-bold text-slate-400 uppercase tracking-wider">
              <div>Job</div>
              <div className="text-right">Quantity</div>
              <div>Person</div>
              <div>Machine</div>
              <div className="text-right">Due out</div>
            </div>
            <div className="flex flex-col gap-2 min-h-0">
              {u.rows.map((r) => {
                const s = UP_NEXT_STATUS[r.status];
                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-[1fr_150px_220px_220px_280px] gap-4 items-center rounded-xl px-4 py-3${s.flash ? " animate-pulse" : ""}`}
                    style={{
                      backgroundColor: `${s.color}${r.status === "later" ? "14" : "26"}`,
                      border: `2px solid ${s.color}${r.status === "later" ? "33" : "77"}`,
                    }}
                    data-testid={`row-upnext-${r.id}`}
                  >
                    <div className="text-2xl font-bold truncate">{r.jobLabel}</div>
                    <div className="text-2xl font-black text-right" style={{ color: r.status === "later" ? "#e2e8f0" : s.color }}>
                      {num(r.quantity)}
                    </div>
                    <div className="text-2xl text-slate-200 truncate">{r.person ?? "—"}</div>
                    <div className="text-2xl text-slate-200 truncate">{r.machine ?? "—"}</div>
                    <div className="text-2xl font-black text-right whitespace-nowrap" style={{ color: s.color }}>
                      {r.dueDate
                        ? r.status === "overdue"
                          ? `WAS DUE ${fmtDueDay(r.dueDate).toUpperCase()}`
                          : r.status === "today"
                            ? "DUE TODAY"
                            : fmtDueDay(r.dueDate).toUpperCase()
                        : "NO DATE"}
                    </div>
                  </div>
                );
              })}
            </div>
            {u.totalCount > u.rows.length && (
              <div className="text-center text-2xl text-slate-400 mt-3">
                + {u.totalCount - u.rows.length} more in the queue
              </div>
            )}
          </>
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
  const top = g.contributors.slice(0, 6);
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
                style={{ fontSize: 180 }}
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

// ── Page 5: Our Team — all operatives on one screen ──────────────────────────
function OperativesPage({ data }: { data: TvData }) {
  const operatives = data.operatives;
  const n = operatives.length;
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const compact = rows >= 2 && cols >= 3;
  const jobsShown = compact ? 2 : rows >= 2 ? 3 : 4;

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader title="Our Team" lastUpdated={data.lastUpdated} />
      <div
        className="grid gap-5 flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {operatives.map((o) => (
          <div
            key={o.id}
            className={`flex flex-col rounded-2xl bg-slate-900/70 ring-1 ring-slate-700/60 min-h-0 ${
              compact ? "p-4" : "p-6"
            }`}
            data-testid={`card-operative-${o.id}`}
          >
            <div className={`flex items-center justify-between gap-3 ${compact ? "mb-2" : "mb-3"}`}>
              <div className={`${compact ? "text-2xl" : "text-4xl"} font-black truncate`}>
                {o.name}
              </div>
              {(() => {
                const t = effTarget(o.efficiencyPercent);
                return t ? (
                  <div
                    className={`${compact ? "text-lg" : "text-3xl"} font-black whitespace-nowrap`}
                    style={{ color: t.color }}
                    title="Output vs target (last week)"
                  >
                    {t.arrow} {t.label}
                  </div>
                ) : null;
              })()}
            </div>
            <div className={`flex items-end ${compact ? "gap-5 mb-2" : "gap-10 mb-3"}`}>
              <div>
                <div
                  className={`${compact ? "text-4xl" : "text-6xl"} font-black text-emerald-400 leading-none`}
                >
                  {num(o.garmentsThisWeek)}
                </div>
                <div className={`${compact ? "text-sm" : "text-lg"} text-slate-400 mt-1`}>
                  garments this week
                </div>
              </div>
              <div>
                <div
                  className={`${compact ? "text-2xl" : "text-4xl"} font-bold text-slate-300 leading-none`}
                >
                  {num(o.garmentsLastWeek)}
                </div>
                <div className={`${compact ? "text-sm" : "text-lg"} text-slate-500 mt-1`}>
                  last week
                </div>
              </div>
              <div>
                <div
                  className={`${compact ? "text-2xl" : "text-4xl"} font-bold text-amber-400 leading-none`}
                >
                  {num(o.jobsToDoCount)}
                </div>
                <div className={`${compact ? "text-sm" : "text-lg"} text-slate-500 mt-1`}>
                  jobs lined up
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {o.jobsToDo.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {o.jobsToDo.slice(0, jobsShown).map((j, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 ${
                        compact ? "text-base" : "text-xl"
                      }`}
                    >
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
                  {o.jobsToDo.length > jobsShown && (
                    <div className={`${compact ? "text-sm" : "text-lg"} text-slate-500`}>
                      +{o.jobsToDo.length - jobsShown} more
                    </div>
                  )}
                </div>
              ) : (
                <div className={`${compact ? "text-base" : "text-xl"} text-slate-500`}>
                  Nothing scheduled yet
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Many TVs "overscan": they zoom the picture slightly and crop the outer
// edges, cutting off text near the borders. Shrink the whole dashboard to
// this fraction of the screen so everything stays inside the TV-safe zone.
const TV_SAFE_AREA = 0.94;

// The dashboard is designed on a fixed canvas and scaled to fill the TV.
// A smaller canvas means everything (text, numbers, icons) renders LARGER
// on screen — 1366x768 makes it all ~40% bigger than the old 1920x1080,
// for comfortable reading from across the room.
const DESIGN_WIDTH = 1366;
const DESIGN_HEIGHT = 768;

function Scaler({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const compute = () =>
      setScale(
        Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT) *
          TV_SAFE_AREA,
      );
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden flex items-center justify-center">
      <div
        className="bg-slate-950 text-white p-8"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
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

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">{children}</div>
  );
}

import { useEffect, useRef } from "react";

const LAST_RELOAD_KEY = "app_last_reload";
const DAILY_RELOAD_HOUR = 22; // 10pm local time
const POLL_INTERVAL_MS = 60 * 1000; // check for a new build every minute
// During a rollout, traffic can briefly hit a mix of old/new server instances.
// Requiring the new version on consecutive checks (hysteresis) plus a cooldown
// between auto-reloads prevents a client from bouncing back and forth.
const REQUIRED_CONSECUTIVE = 2;
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;

// Compute the timestamp of today's 10pm; if it's already past, return tomorrow's.
function nextReloadAt(now: Date): Date {
  const target = new Date(now);
  target.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  return target;
}

// Keeps every open client up to date with the latest published build.
//
// Two mechanisms:
//  1. Active deploy detection — polls /api/version (a deterministic hash of the
//     current build, identical across server instances). When the value changes,
//     a new version has been published, so we reload to pick it up. This is what
//     lets a freshly published fix reach phones/tablets that already have the app
//     open, usually within a minute, without anyone manually refreshing.
//  2. Daily off-hours reload at 10pm local time as a safety net for tabs that
//     have been left open for a long time.
export function useVersionCheck() {
  const knownVersionRef = useRef<string | null>(null);
  const pendingRef = useRef<{ version: string; count: number } | null>(null);
  const reloadingRef = useRef(false);

  // --- Mechanism 1: detect new deployments and reload ---
  useEffect(() => {
    let cancelled = false;

    const doReload = () => {
      if (reloadingRef.current) return;
      // Cooldown guard: never auto-reload twice in quick succession. This is the
      // key protection against reload loops while a deployment is still rolling
      // out across instances.
      const lastReload = parseInt(localStorage.getItem(LAST_RELOAD_KEY) ?? "0", 10);
      if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;
      reloadingRef.current = true;
      localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
      window.location.reload();
    };

    const checkVersion = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const version: string | undefined = data?.version;
        if (!version || cancelled) return;

        if (knownVersionRef.current === null) {
          // First successful check — remember the build we're currently running.
          knownVersionRef.current = version;
          return;
        }

        if (version === knownVersionRef.current) {
          // Back to the build we're running — cancel any pending change.
          pendingRef.current = null;
          return;
        }

        // A different version is being served. Require it on consecutive checks
        // before reloading, so a brief mixed-instance blip doesn't bounce us.
        if (pendingRef.current?.version === version) {
          pendingRef.current.count += 1;
        } else {
          pendingRef.current = { version, count: 1 };
        }
        if (pendingRef.current.count >= REQUIRED_CONSECUTIVE) {
          doReload();
        }
      } catch {
        // Network hiccup — ignore and try again on the next tick.
      }
    };

    // Check immediately, then on an interval, and whenever the tab regains focus
    // (so returning to a backgrounded phone tab gets the latest build at once).
    checkVersion();
    const interval = window.setInterval(checkVersion, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkVersion);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkVersion);
    };
  }, []);

  // --- Mechanism 2: daily 10pm safety-net reload ---
  useEffect(() => {
    const now = new Date();
    const todayReloadCutoff = new Date(now);
    todayReloadCutoff.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);

    const lastReload = parseInt(localStorage.getItem(LAST_RELOAD_KEY) ?? "0", 10);

    if (now >= todayReloadCutoff && lastReload < todayReloadCutoff.getTime()) {
      localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
      window.location.reload();
      return;
    }

    const next = nextReloadAt(now);
    const delay = next.getTime() - now.getTime();
    const timer = window.setTimeout(() => {
      localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
      window.location.reload();
    }, delay);

    return () => window.clearTimeout(timer);
  }, []);

  // Kept for backwards compatibility — manual reload trigger.
  const applyUpdate = () => {
    localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
    window.location.reload();
  };

  return { updateAvailable: false, applyUpdate };
}

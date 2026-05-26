import { useEffect } from "react";

const LAST_RELOAD_KEY = "app_last_reload";
const DAILY_RELOAD_HOUR = 22; // 10pm local time

// Compute the timestamp of today's 10pm; if it's already past, return tomorrow's.
function nextReloadAt(now: Date): Date {
  const target = new Date(now);
  target.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  return target;
}

// Silently push the latest build to every client at 10pm local time each day.
// No banners, no "update available" prompts — the page just refreshes once a
// day during off-hours. Users can always force-refresh themselves at any time.
export function useVersionCheck() {
  useEffect(() => {
    const now = new Date();
    const todayReloadCutoff = new Date(now);
    todayReloadCutoff.setHours(DAILY_RELOAD_HOUR, 0, 0, 0);

    const lastReload = parseInt(localStorage.getItem(LAST_RELOAD_KEY) ?? "0", 10);

    // If we're past today's 10pm and haven't reloaded since 10pm, do it now.
    if (now >= todayReloadCutoff && lastReload < todayReloadCutoff.getTime()) {
      localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
      window.location.reload();
      return;
    }

    // Otherwise schedule the next 10pm reload.
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

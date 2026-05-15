import { useEffect, useState } from "react";

const VERSION_KEY = "app_server_version";
const LAST_RELOAD_KEY = "app_last_reload";
const CHECK_INTERVAL_MS = 30_000;
const FORCE_RELOAD_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Force a reload if the app has been open for more than 24 hours
    const lastReload = parseInt(localStorage.getItem(LAST_RELOAD_KEY) ?? "0", 10);
    if (Date.now() - lastReload > FORCE_RELOAD_AFTER_MS) {
      localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
      window.location.reload();
      return;
    }

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json() as { version: string };
        const stored = localStorage.getItem(VERSION_KEY);
        if (!stored) {
          localStorage.setItem(VERSION_KEY, version);
        } else if (stored !== version) {
          localStorage.setItem(VERSION_KEY, version);
          setUpdateAvailable(true);
        }
      } catch {
        // Network error — silently ignore
      }
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const applyUpdate = () => {
    localStorage.setItem(LAST_RELOAD_KEY, Date.now().toString());
    window.location.reload();
  };

  return { updateAvailable, applyUpdate };
}

import { useEffect, useState } from "react";

const VERSION_KEY = "app_server_version";
const CHECK_INTERVAL_MS = 30_000;

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
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

  const applyUpdate = () => window.location.reload();

  return { updateAvailable, applyUpdate };
}

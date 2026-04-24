import { useState, useEffect } from "react";

export type InstallState =
  | "unsupported"    // Browser doesn't support PWA
  | "installed"      // Already running as PWA
  | "android-ready"  // Chrome/Android has install prompt ready
  | "ios"            // iOS Safari — needs manual instructions
  | "idle";          // Supported but no prompt yet (desktop Chrome, etc.)

interface UsePwaInstall {
  state: InstallState;
  install: () => Promise<void>;
  dismiss: () => void;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function usePwaInstall(): UsePwaInstall {
  const [state, setState] = useState<InstallState>("idle");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Already running as installed PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setState("installed");
      return;
    }

    // Previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) {
      setState("idle");
      return;
    }

    // iOS Safari detection
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      setState("ios");
      return;
    }

    // Android / Chrome — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setState("android-ready");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setState("installed");
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setState("idle");
  };

  return { state, install, dismiss };
}

import { useState, useEffect } from "react";
import { X, Smartphone, Share, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "pwa-install-dismissed";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function isMobile(): boolean {
  return window.innerWidth < 1024 || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
}

interface MobileInstallBannerProps {
  variant?: "banner" | "card";
}

export function MobileInstallBanner({ variant = "banner" }: MobileInstallBannerProps) {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (!isMobile()) return;

    const p = detectPlatform();
    setPlatform(p);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setShow(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (p === "ios") {
      setShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  }

  if (!show || installed) return null;

  if (variant === "card") {
    return (
      <div
        className="rounded-xl border bg-card p-4 space-y-3"
        data-testid="card-install-banner"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Add to your home screen</p>
              <p className="text-xs text-muted-foreground">Quick access like a real app</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Dismiss"
            data-testid="button-dismiss-install"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {platform === "ios" && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <Share className="h-3 w-3" />
              </div>
              <span>Tap the <strong className="text-foreground">Share</strong> button in Safari</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold">+</span>
              </div>
              <span>Choose <strong className="text-foreground">Add to Home Screen</strong></span>
            </div>
          </div>
        )}

        {platform === "android" && deferredPrompt && (
          <Button size="sm" className="w-full" onClick={handleInstall} data-testid="button-install-app">
            Install app
          </Button>
        )}

        {platform === "android" && !deferredPrompt && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <MoreVertical className="h-3 w-3" />
              </div>
              <span>Tap the <strong className="text-foreground">menu</strong> in Chrome</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold">+</span>
              </div>
              <span>Choose <strong className="text-foreground">Add to Home Screen</strong></span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      data-testid="banner-install"
    >
      <div className="max-w-sm mx-auto bg-card border rounded-xl shadow-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Add to your home screen</p>
              <p className="text-xs text-muted-foreground">Use it like an app — no app store needed</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 flex-shrink-0"
            aria-label="Dismiss"
            data-testid="button-dismiss-install-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {platform === "ios" && (
          <ol className="space-y-1.5 text-xs text-muted-foreground list-none">
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
              <span>Tap <Share className="inline h-3 w-3 mx-0.5" /> <strong className="text-foreground">Share</strong> at the bottom of Safari</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
              <span>Select <strong className="text-foreground">Add to Home Screen</strong></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
              <span>Tap <strong className="text-foreground">Add</strong> — it opens like an app from then on</span>
            </li>
          </ol>
        )}

        {platform === "android" && deferredPrompt && (
          <Button className="w-full" onClick={handleInstall} data-testid="button-install-app-banner">
            Install app
          </Button>
        )}

        {platform === "android" && !deferredPrompt && (
          <ol className="space-y-1.5 text-xs text-muted-foreground list-none">
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
              <span>Tap <MoreVertical className="inline h-3 w-3" /> in the top-right of Chrome</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
              <span>Select <strong className="text-foreground">Add to Home Screen</strong></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
              <span>Tap <strong className="text-foreground">Add</strong> to confirm</span>
            </li>
          </ol>
        )}

        <button
          onClick={dismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          data-testid="button-no-thanks"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

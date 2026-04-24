import { useState, useEffect } from "react";
import { X, Smartphone } from "lucide-react";

const DISMISSED_KEY = "mobile-nudge-dismissed";

function isDesktop(): boolean {
  return window.innerWidth >= 1024 && !/Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

interface MobileInstallBannerProps {
  variant?: "banner" | "card";
}

export function MobileInstallBanner({ variant = "banner" }: MobileInstallBannerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (!isDesktop()) return;
    setShow(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  if (variant === "card") {
    return (
      <div
        className="rounded-xl border bg-card p-4 space-y-2"
        data-testid="card-mobile-nudge"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Works great on mobile</p>
              <p className="text-xs text-muted-foreground">Open this page on your phone for on-the-go access</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Dismiss"
            data-testid="button-dismiss-mobile-nudge"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
      data-testid="banner-mobile-nudge"
    >
      <div className="bg-card border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Better on mobile</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open this page on your phone for quick, on-the-go access to your orders — no app download needed.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Dismiss"
            data-testid="button-dismiss-mobile-nudge-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

import { X, Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";

interface MobileInstallBannerProps {
  variant?: "banner" | "card";
}

export function MobileInstallBanner({ variant = "banner" }: MobileInstallBannerProps) {
  const { state, install, dismiss } = usePwaInstall();

  // Don't show if already installed, unsupported, or dismissed
  if (state === "installed" || state === "idle" || state === "unsupported") return null;

  const isIos = state === "ios";

  const content = isIos ? {
    title: "Add to Home Screen",
    body: (
      <>
        Tap <Share className="inline h-3.5 w-3.5 mx-0.5 text-blue-500" /> then{" "}
        <span className="font-medium">Add to Home Screen</span> for quick access to your orders.
      </>
    ),
    action: null,
  } : {
    title: "Install the app",
    body: "Get quick access to your orders and messages — no App Store needed.",
    action: (
      <Button size="sm" onClick={install} data-testid="button-pwa-install">
        <Download className="h-3.5 w-3.5 mr-1.5" />
        Install
      </Button>
    ),
  };

  if (variant === "card") {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-2" data-testid="card-pwa-install">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{content.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{content.body}</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 flex-shrink-0"
            aria-label="Dismiss"
            data-testid="button-dismiss-pwa-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {content.action && <div className="pl-10">{content.action}</div>}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
      data-testid="banner-pwa-install"
    >
      <div className="bg-card border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Download className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{content.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{content.body}</p>
            {content.action && <div className="mt-2">{content.action}</div>}
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Dismiss"
            data-testid="button-dismiss-pwa-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

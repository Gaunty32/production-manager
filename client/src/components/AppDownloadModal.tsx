import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, Monitor, Smartphone, Apple } from "lucide-react";

interface AppDownloadModalProps {
  userId: string | number;
}

const PROMO_KEY_PREFIX = "app-promo-seen-";

export function AppDownloadModal({ userId }: AppDownloadModalProps) {
  const [open, setOpen] = useState(false);
  const { state, install } = usePwaInstall();

  useEffect(() => {
    if (!userId) return;
    const key = `${PROMO_KEY_PREFIX}${userId}`;
    if (!localStorage.getItem(key)) {
      // Small delay so login transition completes before the modal appears
      const t = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(t);
    }
  }, [userId]);

  const handleDismiss = () => {
    localStorage.setItem(`${PROMO_KEY_PREFIX}${userId}`, "1");
    setOpen(false);
  };

  const handleInstall = async () => {
    await install();
    handleDismiss();
  };

  const isIos = state === "ios";
  const canInstall = state === "android-ready";
  const alreadyInstalled = state === "installed";

  if (alreadyInstalled) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="max-w-md" data-testid="modal-app-download">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
              <Download className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Get the app on all your devices</DialogTitle>
          <DialogDescription className="text-center">
            Access your orders and messages anytime — on your desktop, iPhone, or Android phone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Desktop */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Monitor className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Desktop</p>
              {canInstall ? (
                <p className="text-xs text-muted-foreground">Click below to install directly to your computer — no browser needed.</p>
              ) : (
                <p className="text-xs text-muted-foreground">In your browser's address bar, look for the install icon <span className="font-medium">⊕</span> and click "Install".</p>
              )}
            </div>
          </div>

          {/* Android */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Android</p>
              {canInstall && isIos === false ? (
                <p className="text-xs text-muted-foreground">Tap the install button below to add the app to your home screen.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Open this page in Chrome, tap the menu <span className="font-medium">⋮</span> and choose "Add to Home Screen".</p>
              )}
            </div>
          </div>

          {/* iOS */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Apple className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">iPhone &amp; iPad</p>
              {isIos ? (
                <p className="text-xs text-muted-foreground">
                  Tap <Share className="inline h-3 w-3 mx-0.5 text-blue-500" /> in Safari, then choose <span className="font-medium">Add to Home Screen</span>.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Open this page in Safari on your iPhone, tap the Share button, then "Add to Home Screen".</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {canInstall && (
            <Button onClick={handleInstall} data-testid="button-install-app">
              <Download className="h-4 w-4 mr-2" />
              Install now
            </Button>
          )}
          <Button variant={canInstall ? "outline" : "default"} onClick={handleDismiss} data-testid="button-dismiss-app-promo">
            Got it, thanks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";

interface LoginBanner {
  enabled: boolean;
  message: string;
  variant: string;
}

const VARIANT_STYLES: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200",
  warning:
    "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200",
  success:
    "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-900 dark:text-green-200",
};

export function CustomerPortalBanner({ className }: { className?: string }) {
  const [banner, setBanner] = useState<LoginBanner | null>(null);

  useEffect(() => {
    fetch("/api/customer-portal/login-banner")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setBanner(d);
      })
      .catch(() => {});
  }, []);

  if (!banner?.enabled || !banner.message?.trim()) return null;

  const Icon =
    banner.variant === "warning" ? AlertTriangle : banner.variant === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={cn(
        "rounded-md border p-3 flex items-start gap-2.5 text-sm",
        VARIANT_STYLES[banner.variant] || VARIANT_STYLES.info,
        className
      )}
      data-testid="banner-customer-portal"
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <p className="leading-relaxed whitespace-pre-line">{banner.message}</p>
    </div>
  );
}

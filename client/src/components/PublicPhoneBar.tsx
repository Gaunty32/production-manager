import { Phone } from "lucide-react";

export function PublicPhoneBar() {
  return (
    <div className="border-b border-white/10 bg-slate-950 px-4 py-1.5 text-center text-[11px] text-white sm:text-xs">
      <a
        href="tel:01132552694"
        className="inline-flex items-center justify-center gap-1.5 font-medium transition-colors hover:text-white/80"
        data-testid="link-public-phone"
      >
        <Phone className="h-3 w-3" aria-hidden="true" />
        <span>Call us now to discuss your requirements</span>
        <span aria-hidden="true">—</span>
        <span className="font-bold whitespace-nowrap">0113 2552694</span>
      </a>
    </div>
  );
}
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Phone, X } from "lucide-react";

type Availability = {
  available: boolean;
  message: string;
  timeZone: string;
  staffImageUrl: string | null;
};

type CallbackResult = {
  success: boolean;
  status: "calling" | "saved";
  message: string;
};

export function PublicCallbackWidget() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CallbackResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/callback/availability", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setAvailability)
      .catch(() => setAvailability({
        available: false,
        message: "Want us to call you back?",
        timeZone: "Europe/London",
        staffImageUrl: null,
      }));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          website,
          page: window.location.pathname,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to request a callback");
      setResult(body);
      setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a callback");
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setResult(null);
    setError("");
  };

  return (
    <div className="fixed right-4 top-24 z-[70] flex flex-col items-end sm:right-6 sm:top-28">
      <div className="group relative">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className="relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-orange-500 bg-orange-500 text-white shadow-xl transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          aria-label={open ? "Close callback form" : "Request a callback"}
          aria-expanded={open}
          data-testid="button-open-callback"
        >
          {availability?.staffImageUrl ? (
            <img
              src={availability.staffImageUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <Phone className="h-7 w-7" />
          )}
          {availability?.staffImageUrl && (
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-500 shadow-md">
              <Phone className="h-3.5 w-3.5" />
            </span>
          )}
          <svg
            viewBox="0 0 80 80"
            className="pointer-events-none absolute -inset-2 h-20 w-20 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <path
                id="callback-button-top-arc"
                d="M 8,40 A 32,32 0 0,1 72,40"
              />
            </defs>
            <text
              className="fill-orange-600 text-[8px] font-extrabold tracking-[0.08em]"
              style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 2.5, strokeLinejoin: "round" }}
            >
              <textPath
                href="#callback-button-top-arc"
                startOffset="50%"
                textAnchor="middle"
              >
                CALL ME BACK
              </textPath>
            </text>
          </svg>
        </button>
        <div
          className="pointer-events-none invisible absolute right-full top-1/2 mr-3 hidden w-max max-w-[min(20rem,calc(100vw-6rem))] -translate-y-1/2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold leading-snug text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100 sm:block"
          role="tooltip"
        >
          {availability?.message || "Want us to call you back?"}
          <span className="absolute left-full top-1/2 -translate-y-1/2 border-[7px] border-transparent border-l-slate-950" />
        </div>
      </div>

      {open && (
        <div
          className="mt-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border bg-background shadow-2xl"
          role="dialog"
          aria-label="Request a callback"
        >
          <div className="bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold leading-snug">
                  {availability?.message || "Want us to call you back?"}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Enter your number and our team will get back to you.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close callback form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-5">
            {result ? (
              <div className="py-3 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                <p className="mt-3 font-semibold">{result.message}</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 text-sm font-medium text-primary hover:underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label htmlFor="callback-phone" className="text-sm font-medium">
                  Your phone number
                </label>
                <input
                  id="callback-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="e.g. 0113 255 2694"
                  required
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-base outline-none ring-offset-background focus:ring-2 focus:ring-primary"
                  data-testid="input-callback-phone"
                />
                <div className="absolute -left-[10000px]" aria-hidden="true">
                  <label htmlFor="callback-website">Website</label>
                  <input
                    id="callback-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={event => setWebsite(event.target.value)}
                  />
                </div>
                {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  data-testid="button-request-callback"
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    <><Phone className="mr-2 h-4 w-4" />Call me back</>
                  )}
                </button>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Monday–Friday, 9:30am–4:00pm
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
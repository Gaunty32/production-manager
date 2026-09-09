import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Phone, X } from "lucide-react";

type Availability = {
  available: boolean;
  message: string;
  timeZone: string;
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
    <div className="fixed bottom-5 right-4 z-[70] sm:bottom-6 sm:right-6">
      {open && (
        <div
          className="mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border bg-background shadow-2xl"
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

      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label={open ? "Close callback form" : "Request a callback"}
        aria-expanded={open}
        data-testid="button-open-callback"
      >
        {open ? <X className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
      </button>
    </div>
  );
}
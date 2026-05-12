import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Layers, CalendarDays, BarChart3, MessageSquare, FileText, Zap, ArrowDown, Clock, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { PRICING_2026 } from "@shared/pricing";
import customerDashboardImg from "@assets/screenshots/production_selectbranding_co_uk_demo.png";
import customerPortalImg from "@assets/screenshots/production_selectbranding_co_uk_customer_login.png";
import sbsLogo from "@assets/logo_transparent.png";
import prodImg1 from "@assets/SWM07349_1778335006727.jpg";
import prodImg2 from "@assets/SWM00610_1778335033870.jpg";
import prodImg3 from "@assets/SWM00709_1778335040781.jpg";
import prodImg4 from "@assets/SWM00529_1778335054895.jpg";
import prodImg5 from "@assets/SWM00543_1778335073241.jpg";
import prodImg6 from "@assets/IMG_20250828_110500_1778335115271.jpg";
import prodImg7 from "@assets/SWM04080_1778335119599.jpg";
import prodImg8 from "@assets/SWM04094_1778335134804.jpg";
import prodImg9 from "@assets/SWM04102_1778335146071.jpg";
import prodImg10 from "@assets/SWM04109_1778335174184.jpg";

const productionPhotos = [
  { src: prodImg9,  caption: "Precision in every stitch" },
  { src: prodImg6,  caption: "38 embroidery heads, running every day" },
  { src: prodImg4,  caption: "Expert hands on every machine" },
  { src: prodImg7,  caption: "Hooping and preparing each run" },
  { src: prodImg2,  caption: "Careful setup before every job" },
  { src: prodImg10, caption: "The full production floor" },
  { src: prodImg8,  caption: "Quality checked at every stage" },
  { src: prodImg1,  caption: "Fast, accurate dispatch" },
  { src: prodImg3,  caption: "Ready for the next run" },
  { src: prodImg5,  caption: "Industrial-scale embroidery machinery" },
];

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(7, "Phone number is required"),
  company: z.string().min(1, "Company name is required"),
});

type FormValues = z.infer<typeof schema>;

const features = [
  { icon: Layers, label: "Live production queue", description: "See jobs flowing through from receipt to dispatch in real time" },
  { icon: CalendarDays, label: "Machine scheduling", description: "Automated slot booking with conflict detection and capacity planning" },
  { icon: FileText, label: "Xero invoicing", description: "One-click invoice generation synced directly to Xero" },
  { icon: MessageSquare, label: "Customer messaging", description: "Built-in chat and email notifications keep everyone in the loop" },
  { icon: BarChart3, label: "Weekly reports", description: "Production output, top customers, and performance trends at a glance" },
  { icon: Zap, label: "Real data, anonymised", description: "You're seeing our actual live system — just with names and figures hidden" },
];

function BrowserFrame({ src, label, className = "" }: { src: string; label: string; className?: string }) {
  return (
    <div className={`rounded-lg overflow-hidden shadow-2xl border border-border/50 bg-card ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/80 border-b border-border/50">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        <span className="ml-2 text-xs text-muted-foreground truncate">{label}</span>
      </div>
      <img src={src} alt={label} className="w-full block" loading="lazy" />
    </div>
  );
}

export default function DemoAccess() {
  const [submitted, setSubmitted] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActivePhoto(i => (i + 1) % productionPhotos.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [paused]);

  const prevPhoto = () => {
    setPaused(true);
    setActivePhoto(i => (i - 1 + productionPhotos.length) % productionPhotos.length);
  };
  const nextPhoto = () => {
    setPaused(true);
    setActivePhoto(i => (i + 1) % productionPhotos.length);
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", company: "" },
  });

  const requestMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/demo/request-access", data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  const onSubmit = (data: FormValues) => requestMutation.mutate(data);

  const scrollToForm = () => {
    document.getElementById("book-call")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 relative flex items-center justify-center">
          <img src={sbsLogo} alt="Select Branding Solutions" className="h-16 w-auto" />
          <div className="absolute right-6">
            <Button onClick={scrollToForm} size="sm" data-testid="button-header-cta">
              Book a Discovery Call
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">

        {/* ── HERO: Headline + Video + CTA ─────────────────────────────────────── */}
        <section className="px-4 pt-16 pb-12">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Copy */}
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <p className="text-sm font-semibold text-primary uppercase tracking-widest">
                Contract embroidery partner
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                Stop Running Machines.<br />
                <span className="text-primary">Start Growing Your Business.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Your new production department is already built.
                <br className="hidden sm:block" />
                38 embroidery heads running 16 hours a day, 6 days a week — ready to support your growth.
              </p>
            </div>

            {/* Video */}
            <div className="rounded-lg overflow-hidden shadow-2xl border border-border/50 aspect-video">
              <iframe
                src="https://www.youtube.com/embed/6HE3NCGQMfg"
                title="Select Branding Solutions — Production System Walkthrough"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                loading="lazy"
              />
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" onClick={scrollToForm} className="text-base px-8" data-testid="button-hero-cta">
                Book a Discovery Call
              </Button>
              <button
                type="button"
                onClick={scrollToForm}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-scroll-down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Takes 30 seconds
              </button>
            </div>
          </div>
        </section>

        {/* ── WHAT YOU GET ─────────────────────────────────────────────────────── */}
        <section className="border-t bg-muted/30 px-4 py-14">
          <div className="max-w-5xl mx-auto">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl font-bold tracking-tight">Everything managed for you</h2>
              <p className="text-muted-foreground">From the moment an order comes in to the day it ships — tracked, scheduled, and invoiced automatically.</p>
            </div>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map(({ icon: Icon, label, description }) => (
                <li key={label} className="flex gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── PRODUCTION PHOTO CAROUSEL ────────────────────────────────────────── */}
        <section className="border-t px-4 py-16">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Inside the production floor</h2>
              <p className="text-muted-foreground text-sm">Real people, real machines, real output — every working day.</p>
            </div>

            {/* Carousel */}
            <div className="relative rounded-lg overflow-hidden bg-black select-none" style={{ aspectRatio: "16/9" }}>
              {productionPhotos.map((photo, i) => (
                <img
                  key={i}
                  src={photo.src}
                  alt={photo.caption}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
                  style={{ opacity: i === activePhoto ? 1 : 0 }}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              ))}

              {/* Gradient wash for caption legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

              {/* Caption */}
              <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                <span className="text-white/90 text-sm font-medium drop-shadow">
                  {productionPhotos[activePhoto].caption}
                </span>
              </div>

              {/* Prev / Next */}
              <button
                type="button"
                onClick={prevPhoto}
                aria-label="Previous photo"
                data-testid="button-carousel-prev"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 transition-colors flex items-center justify-center text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={nextPhoto}
                aria-label="Next photo"
                data-testid="button-carousel-next"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 transition-colors flex items-center justify-center text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2">
              {productionPhotos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to photo ${i + 1}`}
                  data-testid={`button-carousel-dot-${i}`}
                  onClick={() => { setPaused(true); setActivePhoto(i); }}
                  className={`rounded-full transition-all duration-300 ${
                    i === activePhoto
                      ? "bg-primary w-5 h-2"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/60 w-2 h-2"
                  }`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── ON TIME, EVERY TIME ──────────────────────────────────────────────── */}
        <section className="border-t px-4 py-20 bg-foreground text-background">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-primary uppercase tracking-widest">Guaranteed turnaround</p>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              Find out how we deliver on time, every time.
            </h2>
            <p className="text-lg leading-relaxed text-background/75 max-w-2xl mx-auto">
              With your own Production Management &amp; Ordering portal, you get full visibility of every job —
              and production times of <strong className="text-background">3–4 days, every single time.</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-6 pt-4">
              {[
                "Live job tracking from receipt to dispatch",
                "Automated scheduling across 38 embroidery heads",
                "Real-time alerts if anything falls behind",
                "Your own branded customer portal",
              ].map(point => (
                <div key={point} className="flex items-center gap-2 text-sm text-background/80">
                  <CheckCheck className="h-4 w-4 text-primary shrink-0" />
                  {point}
                </div>
              ))}
            </div>
            <div className="pt-2">
              <Button onClick={scrollToForm} size="lg" className="text-base px-8" data-testid="button-ontime-cta">
                Book a Discovery Call
              </Button>
            </div>
          </div>
        </section>

        {/* ── PRICING TABLE ─────────────────────────────────────────────────────── */}
        <section className="border-t px-4 py-16">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Transparent pricing per garment</h2>
              <p className="text-muted-foreground">Per-unit embroidery pricing based on quantity and stitch count. No hidden fees.</p>
            </div>

            {/* Embroidery pricing grid — 2026 table, columns up to 25k stitches */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <th className="text-left px-4 py-3 font-semibold">Qty</th>
                    {["≤5,000", "≤7,500", "≤10,000", "≤15,000", "≤20,000", "≤25,000"].map(s => (
                      <th key={s} className="text-center px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">
                        {s} sts
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRICING_2026.filter(t => t.maxQty !== null).map((tier, i) => {
                    // Extract prices for the 6 stitch bands we display
                    const bandMaxes = [5000, 7500, 10000, 15000, 20000, 25000];
                    const qtyLabel = `${tier.minQty}${tier.maxQty ? `–${tier.maxQty}` : "+"}`;
                    return (
                      <tr key={i} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">{qtyLabel}</td>
                        {bandMaxes.map(band => {
                          const entry = tier.prices.find(p => p.maxStitches === band);
                          const price = entry?.price;
                          return (
                            <td key={band} className="px-3 py-3 text-center">
                              {price === undefined || price === "POA"
                                ? <span className="text-muted-foreground text-xs">POA</span>
                                : <span className="font-medium">£{(price as number).toFixed(2)}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* 1000+ row */}
                  <tr className="border-t bg-muted/10">
                    <td className="px-4 py-3 font-semibold">1,000+</td>
                    <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground text-sm">
                      Price on application — <button type="button" onClick={scrollToForm} className="underline hover:text-foreground transition-colors">get in touch</button>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={7} className="px-4 py-2 text-xs text-muted-foreground">
                      All prices per unit, excluding VAT. Logo set-up £12 per logo. Prices shown are 2026 rates.
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Need a quote for a specific job?{" "}
              <button type="button" onClick={scrollToForm} className="underline font-medium hover:text-foreground transition-colors">
                Book a Discovery Call
              </button>{" "}
              and we'll price it up for you.
            </p>
          </div>
        </section>

        {/* ── SCREENSHOTS ──────────────────────────────────────────────────────── */}
        <section className="border-t px-4 py-14">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">A glimpse of what you'll see</h2>
              <p className="text-muted-foreground">Your customer portal — track orders, approve artwork, and stay in the loop from any device.</p>
            </div>
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div className="space-y-2">
                <BrowserFrame
                  src={customerDashboardImg}
                  label="production.selectbranding.co.uk — Your Orders"
                />
                <p className="text-sm text-muted-foreground text-center">
                  Track every job in real time — type, quantity, logo status, production date, and dispatch
                </p>
              </div>
              <div className="space-y-2">
                <BrowserFrame
                  src={customerPortalImg}
                  label="production.selectbranding.co.uk — Sign In"
                />
                <p className="text-sm text-muted-foreground text-center">
                  A clean, branded portal — log in from any device to see exactly where your orders are
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FORM: Book a Discovery Call ───────────────────────────────────────── */}
        <section id="book-call" className="border-t bg-muted/30 px-4 py-16">
          <div className="max-w-lg mx-auto">
            <div className="text-center space-y-2 mb-8">
              <h2 className="text-3xl font-bold tracking-tight">Book a Discovery Call</h2>
              <p className="text-muted-foreground">
                Leave your details and we'll send you instant demo access, then follow up to find a time that works.
              </p>
            </div>

            <div className="bg-card border rounded-lg p-8 shadow-sm">
              {submitted ? (
                <div className="flex flex-col items-center text-center gap-5 py-6">
                  <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">You're all set!</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      We've sent a link to your inbox so you can explore the customer portal right away. Someone from the team will also be in touch shortly to book your discovery call.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Can't see the email? Check your spam folder or request again below.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => { setSubmitted(false); form.reset(); }}
                    data-testid="button-try-again"
                  >
                    Send again
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First name</FormLabel>
                            <FormControl>
                              <Input placeholder="Jane" data-testid="input-first-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last name</FormLabel>
                            <FormControl>
                              <Input placeholder="Smith" data-testid="input-last-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="jane@yourcompany.com" data-testid="input-email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone number</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="07700 900000" data-testid="input-phone" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company name</FormLabel>
                            <FormControl>
                              <Input placeholder="Acme Ltd" data-testid="input-company" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {requestMutation.isError && (
                      <p className="text-sm text-destructive">
                        {(requestMutation.error as Error)?.message || "Something went wrong. Please try again."}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={requestMutation.isPending}
                      data-testid="button-request-demo"
                    >
                      {requestMutation.isPending ? "Sending..." : "Book a Discovery Call"}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                      By submitting, you agree that Select Branding Solutions may follow up with you.
                      No spam, ever.
                    </p>
                  </form>
                </Form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 px-6 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Select Branding Solutions Ltd. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

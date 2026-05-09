import { useState } from "react";
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
import { CheckCircle2, Layers, CalendarDays, BarChart3, MessageSquare, FileText, Zap } from "lucide-react";
import customerDashboardImg from "@assets/screenshots/production_selectbranding_co_uk_demo.png";
import customerPortalImg from "@assets/screenshots/production_selectbranding_co_uk_customer_login.png";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  company: z.string().optional(),
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
      <img
        src={src}
        alt={label}
        className="w-full block"
        loading="lazy"
      />
    </div>
  );
}

export default function DemoAccess() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", company: "" },
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Layers className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Select Branding Production System</span>
        </div>
      </header>

      {/* Hero: pitch + form */}
      <main className="flex-1 flex flex-col">
        <section className="flex flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-12 items-start">

            {/* Left: description */}
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-primary uppercase tracking-widest">Live demo</p>
                <h1 className="text-4xl font-bold tracking-tight leading-tight">
                  See the real system in action
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We use this platform every day to run our embroidery and print production.
                  Fill in your details and we'll email you instant access — no installation,
                  no waiting.
                </p>
              </div>

              <ul className="space-y-4">
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

            {/* Right: form / success */}
            <div className="bg-card border rounded-lg p-8 shadow-sm">
              {submitted ? (
                <div className="flex flex-col items-center text-center gap-5 py-6">
                  <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold">Check your inbox!</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      We've emailed you the demo login credentials. Use them to sign in at
                      the link in the email. The password is case-sensitive.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      If you don't see the email, check your spam folder or try again below.
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
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold">Get instant access</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      We'll email you login credentials straight away.
                    </p>
                  </div>

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

                      <FormField
                        control={form.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Company name{" "}
                              <span className="text-muted-foreground font-normal">(optional)</span>
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="Acme Ltd" data-testid="input-company" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
                        {requestMutation.isPending ? "Sending..." : "Send me access"}
                      </Button>

                      <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        By submitting, you agree that Select Branding Solutions may follow up with you about the system.
                        No spam, ever.
                      </p>
                    </form>
                  </Form>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Video tour section */}
        <section className="border-t px-4 py-16">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">See a full walkthrough</h2>
              <p className="text-muted-foreground">
                Watch a guided tour of the production system — from job intake through to invoicing.
              </p>
            </div>
            <div className="rounded-lg overflow-hidden shadow-2xl border border-border/50 aspect-video">
              <iframe
                src="https://www.youtube.com/embed/6HE3NCGQMfg"
                title="Select Branding Production System — Full Walkthrough"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Screenshots section */}
        <section className="bg-muted/40 border-t px-4 py-16">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">A glimpse of what you'll see</h2>
              <p className="text-muted-foreground">This is your view — the customer portal you'll use to track orders, approve artwork, and stay in the loop.</p>
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
      </main>

      <footer className="border-t py-6 px-6 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Select Branding Solutions Ltd. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Shirt,
  Printer,
  Package,
  Clock,
  Truck,
  MessageSquare,
  LayoutDashboard,
  CheckCircle2,
  ArrowRight,
  Phone,
  Mail,
  Sparkles,
} from "lucide-react";
import sbsLogo from "@assets/logo_transparent.png";

const SERVICES = [
  {
    icon: Shirt,
    title: "Embroidery",
    description:
      "Multi-head embroidery for workwear, uniforms, schoolwear and sports kit. Crisp, durable stitching from small runs to thousands of garments, with free logo digitising and approval before we run a single stitch.",
  },
  {
    icon: Printer,
    title: "Print",
    description:
      "Garment printing for names, numbers, initials and full logos. Ideal where print gives a better finish or price than embroidery — we'll always advise which suits your garments best.",
  },
  {
    icon: Package,
    title: "Bagging & Fulfilment",
    description:
      "Individual bagging, labelling and pack-outs so garments arrive ready to hand straight to your team or customers. Perfect for uniform rollouts and online store fulfilment.",
  },
];

const PORTAL_FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Live order tracking",
    description: "See every job's status in real time — from booked in, through production, to dispatched.",
  },
  {
    icon: MessageSquare,
    title: "Direct messaging",
    description: "Message the production team on any job. No lost emails, no chasing.",
  },
  {
    icon: CheckCircle2,
    title: "Logo approvals online",
    description: "Approve new logos and sew-out samples from your phone in seconds.",
  },
  {
    icon: Truck,
    title: "Dispatch & tracking",
    description: "DPD tracking links and dispatch notifications the moment your order leaves us.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Send us your logo",
    description: "Email your logo or artwork — we digitise it for embroidery and send you a sew-out to approve.",
  },
  {
    step: "2",
    title: "We brand your garments",
    description: "Send garments to us or let us supply them. Your order goes straight into our production schedule.",
  },
  {
    step: "3",
    title: "Dispatched on time",
    description: "Quality-checked, bagged if needed, and shipped with DPD tracking — usually within days, not weeks.",
  },
];

export default function Home() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    service: "",
    message: "",
    website: "", // honeypot
  });
  const [submitted, setSubmitted] = useState(false);

  const enquiry = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enquiry", form);
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => {
      toast({
        title: "Couldn't send your enquiry",
        description: err?.message || "Please try again, or email info@selectbranding.co.uk",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Please add your name and email", variant: "destructive" });
      return;
    }
    enquiry.mutate();
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <img src={sbsLogo} alt="Select Branding Solutions" className="h-9 object-contain" data-testid="img-logo" />
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <button onClick={() => scrollTo("services")} className="text-muted-foreground hover:text-foreground" data-testid="link-services">Services</button>
            <button onClick={() => scrollTo("portal")} className="text-muted-foreground hover:text-foreground" data-testid="link-portal">Customer Portal</button>
            <button onClick={() => scrollTo("how")} className="text-muted-foreground hover:text-foreground" data-testid="link-how">How It Works</button>
            <button onClick={() => scrollTo("contact")} className="text-muted-foreground hover:text-foreground" data-testid="link-contact">Get a Quote</button>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/staff-login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block" data-testid="link-staff-signin">
              Staff Sign In
            </Link>
            <Link href="/customer/login">
              <Button variant="outline" size="sm" data-testid="button-signin">Customer Sign In</Button>
            </Link>
            <Button size="sm" onClick={() => scrollTo("contact")} data-testid="button-header-quote">Get a Quote</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 py-20 text-center md:py-28">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Trade & business garment branding, done properly
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
              Embroidery &amp; print for workwear, <span className="text-primary">without the chasing</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
              Select Branding Solutions brands your uniforms, workwear and kit — with a live
              customer portal so you can track every order, approve logos and message us directly.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
              <Button size="lg" onClick={() => scrollTo("contact")} data-testid="button-hero-quote">
                Get a Quote <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Link href="/portal-preview">
                <Button size="lg" variant="outline" data-testid="button-hero-demo">
                  Try the Live Portal Demo
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 pt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Fast, reliable turnaround</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Free logo setup &amp; approval</span>
              <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Tracked DPD delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">What we do</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            One supplier for everything from a dozen polos to full uniform rollouts.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map((s) => (
            <Card key={s.title} className="hover-elevate" data-testid={`card-service-${s.title.toLowerCase().split(" ")[0]}`}>
              <CardContent className="space-y-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Portal */}
      <section id="portal" className="border-y bg-muted/40">
        <div className="container mx-auto px-4 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold md:text-4xl">
                Your own customer portal — see everything, chase nothing
              </h2>
              <p className="text-muted-foreground">
                Most branding companies leave you emailing for updates. Our customers get a
                login to the same system our production floor runs on: live order status,
                logo approvals, invoices, and a direct line to the team working on your garments.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {PORTAL_FEATURES.map((f) => (
                  <div key={f.title} className="flex gap-3">
                    <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">{f.title}</p>
                      <p className="text-sm text-muted-foreground">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/portal-preview">
                  <Button data-testid="button-portal-demo">
                    Explore the Demo <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="self-center text-sm text-muted-foreground">No sign-up needed — click around freely.</p>
              </div>
            </div>
            <Card className="overflow-hidden border-2 border-primary/20 shadow-lg">
              <div className="border-b bg-primary/5 px-4 py-2 text-xs font-medium text-muted-foreground">
                Customer Portal — live demo preview
              </div>
              <CardContent className="space-y-3 p-4">
                {[
                  { name: "Summer Team Polos", qty: 48, status: "In Production", color: "bg-blue-500" },
                  { name: "Warehouse Hi-Vis Jackets", qty: 100, status: "Dispatched", color: "bg-green-500" },
                  { name: "New Starter Uniform Pack", qty: 12, status: "Awaiting Logo Approval", color: "bg-amber-500" },
                ].map((j) => (
                  <div key={j.name} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{j.name}</p>
                      <p className="text-xs text-muted-foreground">{j.qty} garments</p>
                    </div>
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <span className={`h-2 w-2 rounded-full ${j.color}`} />
                      {j.status}
                    </span>
                  </div>
                ))}
                <Link href="/portal-preview">
                  <Button variant="outline" className="w-full" size="sm" data-testid="button-portal-card-demo">
                    Open the full interactive demo
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container mx-auto px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold md:text-4xl">How it works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            From first email to delivered garments in three simple steps.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.step} className="relative text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {s.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact / enquiry */}
      <section id="contact" className="border-t bg-muted/40">
        <div className="container mx-auto px-4 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold md:text-4xl">Get a quote</h2>
              <p className="text-muted-foreground">
                Tell us what you need branding and we'll come back with a price —
                usually the same working day. No obligation, no hard sell.
              </p>
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <a href="mailto:info@selectbranding.co.uk" className="hover:underline" data-testid="link-email">
                    info@selectbranding.co.uk
                  </a>
                </p>
                <p className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="h-5 w-5 text-primary" />
                  Prefer to talk? Include your number and we'll call you back.
                </p>
              </div>
              <Card className="bg-background">
                <CardContent className="space-y-2 p-5 text-sm">
                  <p className="font-semibold">Not ready for a quote yet?</p>
                  <p className="text-muted-foreground">
                    Have a play with the customer portal demo first — it's the best way to see
                    how working with us feels day-to-day.
                  </p>
                  <Link href="/portal-preview">
                    <Button variant="outline" size="sm" className="mt-2" data-testid="button-contact-demo">
                      Try the Demo
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-background">
              <CardContent className="p-6">
                {submitted ? (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 text-center">
                    <CheckCircle2 className="h-14 w-14 text-green-600" />
                    <h3 className="text-2xl font-semibold">Thanks — we've got it!</h3>
                    <p className="max-w-sm text-muted-foreground">
                      Your enquiry is in and a confirmation email is on its way to you.
                      We'll be in touch shortly — usually the same working day.
                    </p>
                    <Link href="/portal-preview">
                      <Button variant="outline" data-testid="button-success-demo">
                        Explore the Portal Demo while you wait
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="enquiry-name">Name *</Label>
                        <Input id="enquiry-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" data-testid="input-name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="enquiry-company">Company</Label>
                        <Input id="enquiry-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Ltd" data-testid="input-company" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="enquiry-email">Email *</Label>
                        <Input id="enquiry-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@acme.co.uk" data-testid="input-email" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="enquiry-phone">Phone</Label>
                        <Input id="enquiry-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07700 900123" data-testid="input-phone" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>What do you need?</Label>
                      <Select value={form.service} onValueChange={(v) => setForm({ ...form, service: v })}>
                        <SelectTrigger data-testid="select-service">
                          <SelectValue placeholder="Choose a service (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Embroidery">Embroidery</SelectItem>
                          <SelectItem value="Print">Print</SelectItem>
                          <SelectItem value="Embroidery & Print">Embroidery &amp; Print</SelectItem>
                          <SelectItem value="Bagging / Fulfilment">Bagging / Fulfilment</SelectItem>
                          <SelectItem value="Not sure yet">Not sure yet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="enquiry-message">Tell us about the job</Label>
                      <Textarea
                        id="enquiry-message"
                        rows={4}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="e.g. 50 polo shirts with our logo on the left chest, needed by end of the month…"
                        data-testid="input-message"
                      />
                    </div>
                    {/* Honeypot — hidden from real users */}
                    <input
                      type="text"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      className="hidden"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                    />
                    <Button type="submit" className="w-full" size="lg" disabled={enquiry.isPending} data-testid="button-submit-enquiry">
                      {enquiry.isPending ? "Sending…" : "Send Enquiry"}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      We only use your details to respond to your enquiry.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto flex flex-col items-center gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:justify-between">
          <div className="flex items-center gap-3">
            <img src={sbsLogo} alt="Select Branding Solutions" className="h-7 object-contain" />
            <span>© {new Date().getFullYear()} Select Branding Solutions Ltd</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="mailto:info@selectbranding.co.uk" className="hover:text-foreground">info@selectbranding.co.uk</a>
            <Link href="/customer/login" className="hover:text-foreground" data-testid="link-footer-customer">Customer Sign In</Link>
            <Link href="/staff-login" className="hover:text-foreground" data-testid="link-footer-staff">Staff</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  FileText,
  MessageSquare,
  Users,
  Receipt,
  CreditCard,
  Key,
  LogOut,
  Phone,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowUpDown,
  Package,
  Headphones,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import sbsLogo from "@assets/logo_transparent.png";

// ─── Demo data ───────────────────────────────────────────────────────────────

const DEMO_COMPANY = "Apex Sportswear Ltd";
const DEMO_NAME = "Sarah";

const JOBS = [
  {
    id: "1",
    jobName: "Summer Team Polos",
    description: "Left chest logo + back print, Navy Blue",
    quantity: 48,
    dispatchDate: "2026-06-02",
    status: "in_progress",
    tracking: null,
    estimatedPrice: 312.0,
  },
  {
    id: "2",
    jobName: "Staff Fleeces – Warehouse",
    description: "Left chest embroidery, Royal Blue",
    quantity: 24,
    dispatchDate: "2026-06-05",
    status: "in_progress",
    tracking: null,
    estimatedPrice: 204.0,
  },
  {
    id: "3",
    jobName: "Visitor Hi-Vis Vests",
    description: "Back print – VISITOR, Yellow",
    quantity: 36,
    dispatchDate: "2026-06-10",
    status: "in_progress",
    tracking: null,
    estimatedPrice: 126.0,
  },
  {
    id: "4",
    jobName: "Promotional Caps – Trade Show",
    description: "Front logo embroidery, Black",
    quantity: 100,
    dispatchDate: "2026-06-16",
    status: "in_progress",
    tracking: null,
    estimatedPrice: 480.0,
  },
  {
    id: "5",
    jobName: "Winter Jackets – Management",
    description: "Left chest + right sleeve, Charcoal",
    quantity: 12,
    dispatchDate: "2026-05-30",
    status: "in_progress",
    tracking: null,
    estimatedPrice: 264.0,
  },
  {
    id: "6",
    jobName: "Conference Polo Shirts",
    description: "Left chest embroidery, White",
    quantity: 60,
    dispatchDate: "2026-05-14",
    status: "completed",
    tracking: "15092476321GB",
    estimatedPrice: 390.0,
  },
  {
    id: "7",
    jobName: "Reception Uniforms",
    description: "Left chest logo, Burgundy",
    quantity: 8,
    dispatchDate: "2026-05-20",
    status: "completed",
    tracking: "15081937452GB",
    estimatedPrice: 116.0,
  },
];

const TODAY = new Date();

function getStatus(job: (typeof JOBS)[0]) {
  if (job.status === "completed") return "completed";
  const d = new Date(job.dispatchDate);
  d.setHours(0, 0, 0, 0);
  const tod = new Date(TODAY);
  tod.setHours(0, 0, 0, 0);
  if (d < tod) return "overdue";
  if (d.getTime() === tod.getTime()) return "due_today";
  return "in_progress";
}

function StatusBadge({ job }: { job: (typeof JOBS)[0] }) {
  const s = getStatus(job);
  if (s === "completed")
    return (
      <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 whitespace-nowrap">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
      </Badge>
    );
  if (s === "overdue")
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        <AlertCircle className="h-3 w-3 mr-1" /> Overdue
      </Badge>
    );
  if (s === "due_today")
    return (
      <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 whitespace-nowrap">
        <Clock className="h-3 w-3 mr-1" /> Due Today
      </Badge>
    );
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      <Clock className="h-3 w-3 mr-1" /> In Progress
    </Badge>
  );
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortalPreview() {
  const [tab, setTab] = useState<"in_progress" | "completed" | "all">("in_progress");
  const [search, setSearch] = useState("");

  const filtered = JOBS.filter((j) => {
    const s = getStatus(j);
    if (tab === "in_progress" && s === "completed") return false;
    if (tab === "completed" && s !== "completed") return false;
    if (search) {
      const q = search.toLowerCase();
      return j.jobName.toLowerCase().includes(q) || j.description.toLowerCase().includes(q);
    }
    return true;
  });

  const inProgressCount = JOBS.filter((j) => getStatus(j) !== "completed").length;
  const completedCount = JOBS.filter((j) => getStatus(j) === "completed").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Demo banner */}
      <div className="bg-primary text-primary-foreground text-center py-2 text-xs font-medium tracking-wide uppercase">
        Demo Preview — This is how your customer portal could look
      </div>

      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Company logo placeholder */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 rounded-md">
                <Package className="h-5 w-5 text-white" />
                <span className="font-bold text-white text-sm tracking-tight">{DEMO_COMPANY}</span>
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Key className="h-4 w-4 mr-2" /> Change Password
              </Button>
              <Button variant="outline" size="sm">
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 pb-16 max-w-5xl">

        {/* SBS logo hero */}
        <div className="flex justify-center mb-6">
          <img
            src={sbsLogo}
            alt="Select Branding Solutions"
            className="object-contain"
            style={{ maxHeight: "90px", maxWidth: "320px", width: "100%" }}
          />
        </div>

        {/* Contact Us */}
        <div className="mb-6">
          <h2 className="text-center text-lg font-semibold mb-3">Contact Us</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <a href="#" className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-xs text-muted-foreground mt-0.5">0113 255 2694</p>
              </div>
            </a>
            <a href="#" className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <Mail className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground mt-0.5">info@selectbranding.co.uk</p>
              </div>
            </a>
            <button className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Message Us</p>
                <p className="text-xs text-muted-foreground mt-0.5">via the app</p>
              </div>
            </button>
            <a href="#" className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <SiWhatsapp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">WhatsApp</p>
                <p className="text-xs text-muted-foreground mt-0.5">Chat with us</p>
              </div>
            </a>
            <button className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate col-span-2 sm:col-span-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Headphones className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Live Chat</p>
                <p className="text-xs text-muted-foreground mt-0.5">We're here to help</p>
              </div>
            </button>
          </div>
        </div>

        {/* Greeting card */}
        <div className="flex items-start gap-4 rounded-xl bg-muted/50 border border-border p-4 mb-6">
          <span className="text-3xl leading-none mt-0.5 shrink-0" role="img" aria-label="greeting">🦁</span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-base leading-tight">Hi {DEMO_NAME}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              A group of lions is called a pride, a group of crows is a murder, and a group of goldfish is a troubling. Quite the vocabulary!
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">Last signed in about 3 hours ago</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Submit New Job
            </Button>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Pending Submissions
            </Button>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Documents
            </Button>
            <Button variant="outline" className="relative">
              <MessageSquare className="h-4 w-4 mr-2" /> Messages
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">1</Badge>
            </Button>
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" /> My Team
            </Button>
            <Button variant="outline">
              <Receipt className="h-4 w-4 mr-2" /> Invoices
            </Button>
            <Button variant="outline">
              <CreditCard className="h-4 w-4 mr-2" /> Payment Cards
            </Button>
          </div>
        </div>

        {/* Production Queue */}
        <div>
          <h2 className="text-xl font-bold mb-1">Production Queue</h2>
          <p className="text-sm text-muted-foreground mb-4">View the status and progress of your orders in production</p>

          {/* Search + filter row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="in_progress">
                  In Progress
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{inProgressCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{completedCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all">All Orders</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">
                    <span className="flex items-center gap-1 cursor-pointer select-none">
                      Job Name <ArrowUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">
                    <span className="flex items-center gap-1 cursor-pointer select-none">
                      Item Description <ArrowUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-right">
                    <span className="flex items-center justify-end gap-1 cursor-pointer select-none">
                      Qty <ArrowUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-right hidden sm:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      Est. Cost <span className="text-[10px] text-muted-foreground font-normal">(inc. VAT)</span>
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold">
                    <span className="flex items-center gap-1 cursor-pointer select-none">
                      Dispatch Date <ArrowUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold">
                    <span className="flex items-center gap-1 cursor-pointer select-none">
                      Status <ArrowUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell">Tracking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((job) => {
                  const vatPrice = job.estimatedPrice * 1.2;
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium">{job.jobName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{job.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{job.quantity}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <div className="text-right leading-snug">
                          <div className="text-xs text-muted-foreground">£{job.estimatedPrice.toFixed(2)} ex. VAT</div>
                          <div className="text-xs text-muted-foreground">+ £{(job.estimatedPrice * 0.2).toFixed(2)} VAT</div>
                          <div className="font-semibold text-sm">£{vatPrice.toFixed(2)}</div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(job.dispatchDate)}</TableCell>
                      <TableCell><StatusBadge job={job} /></TableCell>
                      <TableCell className="text-sm hidden lg:table-cell">
                        {job.tracking ? (
                          <a
                            href={`https://track.dpd.co.uk/search?reference=${job.tracking}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2 text-xs"
                          >
                            {job.tracking}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-right">
              Showing {filtered.length} of {JOBS.length} orders
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Plus, FileText, MessageSquare, Users, Receipt, CreditCard, Key, LogOut,
  Phone, Mail, Clock, CheckCircle2, AlertCircle, Search, ArrowUpDown,
  ArrowUp, ArrowDown, Package, Headphones, ArrowLeft, Send, Download, ExternalLink,
  Upload, Trash2, UserPlus, ChevronRight, CalendarIcon, MapPin, Lightbulb,
  ShoppingCart, Menu,
} from "lucide-react";
import { SiWhatsapp, SiVisa } from "react-icons/si";
import sbsLogo from "@assets/logo_transparent.png";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type View =
  | "dashboard" | "submit" | "pending" | "documents" | "messages"
  | "team" | "invoices" | "payment-methods" | "delivery-address";

const DEMO_COMPANY = "Apex Sportswear Ltd";
const DEMO_NAME = "Sarah";

type PreviewLineItem = {
  id: string;
  jobType: string;
  description: string;
  stitchCount?: number | null;
  quantity: number;
  estimatedPrice: number | "POA" | null;
};

type PreviewJob = {
  id: string;
  jobName: string;
  poNumber?: string | null;
  notes?: string | null;
  dispatchDate: string | null;
  completed: boolean;
  awaitingPayment?: boolean;
  tracking?: string | null;
  lineItems: PreviewLineItem[];
};

const JOBS: PreviewJob[] = [
  {
    id: "1", jobName: "Summer Team Polos", poNumber: "PO-4471",
    notes: "Please match the navy from last year's order.",
    dispatchDate: "2026-06-05", completed: false, tracking: null,
    lineItems: [
      { id: "1a", jobType: "Embroidery", description: "Left chest logo, Navy Blue", stitchCount: 8200, quantity: 48, estimatedPrice: 187.2 },
      { id: "1b", jobType: "Print", description: "Back print – company name, white", stitchCount: null, quantity: 48, estimatedPrice: 124.8 },
    ],
  },
  {
    id: "2", jobName: "Staff Fleeces – Warehouse", poNumber: null, notes: null,
    dispatchDate: "2026-06-09", completed: false, tracking: null,
    lineItems: [
      { id: "2a", jobType: "Embroidery", description: "Left chest embroidery, Royal Blue", stitchCount: 6400, quantity: 24, estimatedPrice: 204.0 },
    ],
  },
  {
    id: "3", jobName: "Visitor Hi-Vis Vests", poNumber: null, notes: null,
    dispatchDate: "2026-06-12", completed: false, tracking: null,
    lineItems: [
      { id: "3a", jobType: "Print", description: "Back print – VISITOR, black on yellow", stitchCount: null, quantity: 36, estimatedPrice: 126.0 },
    ],
  },
  {
    id: "4", jobName: "Winter Jackets – Management", poNumber: "PO-4459", notes: null,
    dispatchDate: "2026-06-03", completed: false, tracking: null,
    lineItems: [
      { id: "4a", jobType: "Embroidery", description: "Left chest + right sleeve, Charcoal", stitchCount: 9100, quantity: 12, estimatedPrice: 264.0 },
    ],
  },
  {
    id: "5", jobName: "Promotional Caps – Trade Show", poNumber: null,
    notes: "New account – advance payment required before production.",
    dispatchDate: null, completed: false, awaitingPayment: true, tracking: null,
    lineItems: [
      { id: "5a", jobType: "Embroidery", description: "Front logo embroidery, Black", stitchCount: 7400, quantity: 100, estimatedPrice: 480.0 },
    ],
  },
  {
    id: "6", jobName: "New Workwear Range", poNumber: null,
    notes: "Submitted for review – awaiting confirmed production date.",
    dispatchDate: null, completed: false, tracking: null,
    lineItems: [
      { id: "6a", jobType: "Embroidery", description: "Left chest logo, assorted colours", stitchCount: 6800, quantity: 40, estimatedPrice: 280.0 },
    ],
  },
  {
    id: "7", jobName: "Conference Polo Shirts", poNumber: null, notes: null,
    dispatchDate: "2026-05-14", completed: true, tracking: "15092476321GB",
    lineItems: [
      { id: "7a", jobType: "Embroidery", description: "Left chest embroidery, White", stitchCount: 5200, quantity: 60, estimatedPrice: 390.0 },
    ],
  },
  {
    id: "8", jobName: "Reception Uniforms", poNumber: null, notes: null,
    dispatchDate: "2026-05-20", completed: true, tracking: "15081937452GB",
    lineItems: [
      { id: "8a", jobType: "Embroidery", description: "Left chest logo, Burgundy", stitchCount: 4800, quantity: 8, estimatedPrice: 116.0 },
    ],
  },
];

const PENDING_JOBS = [
  { id: "p1", jobName: "New Logo – Training Kit", logoType: "New Logo", quantity: 30, submittedAt: "2026-05-10T09:14:00Z", notes: "New embroidery logo for the squad training kit range. Left chest only." },
  { id: "p2", jobName: "Anniversary Jackets", logoType: "Repeat Logo", quantity: 20, submittedAt: "2026-05-11T14:32:00Z", notes: "25th anniversary edition jackets. Same logo as last year, just silver colourway." },
];

const DOCUMENTS = [
  { id: "d1", name: "Invoice INV-00142.pdf", date: "2026-05-14", size: "142 KB" },
  { id: "d2", name: "Delivery Note DN-0089.pdf", date: "2026-05-14", size: "68 KB" },
  { id: "d3", name: "Order Confirmation OC-1241.pdf", date: "2026-05-10", size: "95 KB" },
  { id: "d4", name: "Invoice INV-00138.pdf", date: "2026-05-07", size: "138 KB" },
  { id: "d5", name: "Logo Approval – Left Chest.pdf", date: "2026-04-22", size: "204 KB" },
];

type ChatMsg = { id: string; sender: "staff" | "customer"; text: string; time: string; staffName?: string };

const CONVERSATIONS = [
  {
    id: "c1",
    jobName: "Summer Team Polos",
    unread: 1,
    messages: [
      { id: "m1", sender: "staff" as const, staffName: "James", text: "Hi Sarah, just checking in on the Summer Team Polos — we've got the embroidery files ready to go. Could you confirm if you'd like the logo on the left chest only, or left chest and sleeve?", time: "09:42" },
      { id: "m2", sender: "customer" as const, text: "Left chest only please! Thanks for checking.", time: "10:15" },
      { id: "m3", sender: "staff" as const, staffName: "James", text: "Perfect, we'll get that started today. Expected dispatch is still on track for 5th June.", time: "10:18" },
      { id: "m4", sender: "staff" as const, staffName: "James", text: "Quick update — we've completed the first run of 20 polos and the quality looks great! The remaining 28 will be finished by end of week.", time: "14:05" },
    ] as ChatMsg[],
  },
  {
    id: "c2",
    jobName: "Conference Polo Shirts",
    unread: 0,
    messages: [
      { id: "m5", sender: "staff" as const, staffName: "Chris", text: "Hi Sarah, your Conference Polo Shirts have been dispatched — tracking number 15092476321GB via DPD.", time: "Yesterday" },
      { id: "m6", sender: "customer" as const, text: "Brilliant, thank you so much! Really pleased with the quality as always.", time: "Yesterday" },
      { id: "m7", sender: "staff" as const, staffName: "Chris", text: "Wonderful to hear! Looking forward to the next order.", time: "Yesterday" },
    ] as ChatMsg[],
  },
  {
    id: "c3",
    jobName: "General Enquiry",
    unread: 0,
    messages: [
      { id: "m8", sender: "customer" as const, text: "Hi, do you offer rush turnaround on embroidery orders?", time: "Mon" },
      { id: "m9", sender: "staff" as const, staffName: "Chris", text: "Yes! We offer a 48-hour express service on most embroidery orders. There's a small surcharge applied — feel free to mention it when submitting your next job.", time: "Mon" },
    ] as ChatMsg[],
  },
];

const TEAM_MEMBERS = [
  { id: "t1", firstName: "Sarah", lastName: "Mitchell", email: "sarah.mitchell@apexsportswear.co.uk", role: "admin", initials: "SM" },
  { id: "t2", firstName: "James", lastName: "Brown", email: "james.brown@apexsportswear.co.uk", role: "member", initials: "JB" },
  { id: "t3", firstName: "Emma", lastName: "Clarke", email: "emma.clarke@apexsportswear.co.uk", role: "member", initials: "EC" },
];

const INVOICES = [
  { id: "i1", ref: "INV-00145", jobName: "Staff Fleeces – Warehouse", date: "2026-06-05", amount: 244.8, status: "due" },
  { id: "i2", ref: "INV-00142", jobName: "Conference Polo Shirts", date: "2026-05-14", amount: 468.0, status: "paid" },
  { id: "i3", ref: "INV-00138", jobName: "Reception Uniforms", date: "2026-05-07", amount: 139.2, status: "paid" },
  { id: "i4", ref: "INV-00131", jobName: "Spring Workwear Order", date: "2026-04-12", amount: 672.0, status: "paid" },
];

const CONTACT = {
  phone: "0113 255 2694",
  phoneTel: "tel:01132552694",
  email: "info@selectbranding.co.uk",
  whatsapp: "https://wa.me/441132552694",
};

const VAT_RATE = 0.2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

type JobStatus = "completed" | "awaiting" | "overdue" | "due_today" | "in_progress";

function getJobStatus(job: PreviewJob): JobStatus {
  if (job.completed) return "completed";
  if (job.awaitingPayment) return "awaiting";
  if (job.dispatchDate) {
    const d = new Date(job.dispatchDate);
    d.setHours(0, 0, 0, 0);
    const t = startOfToday();
    if (d < t) return "overdue";
    if (d.getTime() === t.getTime()) return "due_today";
  }
  return "in_progress";
}

function StatusBadge({ job }: { job: PreviewJob }) {
  const s = getJobStatus(job);
  if (s === "completed") return <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 whitespace-nowrap"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
  if (s === "awaiting") return <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 whitespace-nowrap"><Clock className="h-3 w-3 mr-1" />Awaiting Payment</Badge>;
  if (s === "overdue") return <Badge variant="destructive" className="whitespace-nowrap"><AlertCircle className="h-3 w-3 mr-1" />Overdue</Badge>;
  if (s === "due_today") return <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 whitespace-nowrap"><Clock className="h-3 w-3 mr-1" />Due Today</Badge>;
  return <Badge variant="secondary" className="whitespace-nowrap"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
}

function EstimatedCostCell({ price }: { price: number | "POA" | null | undefined }) {
  if (price === null || price === undefined) return <span className="text-muted-foreground text-sm">—</span>;
  if (price === "POA") return <span className="text-muted-foreground text-sm">POA</span>;
  const vat = price * VAT_RATE;
  return (
    <div className="text-right leading-snug">
      <div className="text-xs text-muted-foreground">£{price.toFixed(2)} ex. VAT</div>
      <div className="text-xs text-muted-foreground">+ £{vat.toFixed(2)} VAT</div>
      <div className="font-semibold text-sm">£{(price + vat).toFixed(2)}</div>
    </div>
  );
}

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const DEMO_POSTCODE = "LS28 6AB";

function dpdUrl(tracking: string) {
  return `https://track.dpd.co.uk/search?reference=${encodeURIComponent(tracking)}&postcode=${encodeURIComponent(DEMO_POSTCODE)}`;
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function SubmitJobView({ onBack }: { onBack: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [jobName, setJobName] = useState("");
  const [logoType, setLogoType] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [droppedFile, setDroppedFile] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current += 1; if (e.dataTransfer.types.includes("Files")) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current = 0; setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) setDroppedFile(f.name); };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold">Submission Received!</h2>
        <p className="text-muted-foreground text-center max-w-md">Your job request has been submitted. Our team will review it and be in touch shortly. You'll be able to track progress from your Production Queue.</p>
        <Button onClick={onBack} className="mt-2">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-1">Submit a New Job</h2>
      <p className="text-sm text-muted-foreground mb-6">Fill in the details below and our team will review your request.</p>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>Job Name <span className="text-destructive">*</span></Label>
          <Input placeholder="e.g. Summer Team Polos" value={jobName} onChange={e => setJobName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Logo Type <span className="text-destructive">*</span></Label>
            <Select value={logoType} onValueChange={setLogoType}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="repeat">Repeat Logo (already set up)</SelectItem>
                <SelectItem value="new">New Logo (new setup required)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity <span className="text-destructive">*</span></Label>
            <Input type="number" placeholder="e.g. 24" value={qty} onChange={e => setQty(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Required Dispatch Date</Label>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input type="date" className="pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea placeholder="Any special instructions, colour preferences, positioning details…" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Files</Label>
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) setDroppedFile(e.target.files[0].name); }} />
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-8 px-4 cursor-pointer transition-colors select-none
              ${isDragging ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40"}`}
          >
            <Upload className={`h-5 w-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{isDragging ? "Drop files here" : droppedFile ? droppedFile : "Drag & drop files, or click to browse"}</span>
            {!droppedFile && <span className="text-xs text-muted-foreground">Logos, artwork, embroidery files accepted</span>}
          </div>
          {droppedFile && (
            <div className="flex items-center justify-between text-sm bg-muted rounded-md px-3 py-2">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{droppedFile}</span>
              <button onClick={() => setDroppedFile(null)} className="text-muted-foreground hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        <Button className="w-full" onClick={() => { if (jobName && logoType && qty) setSubmitted(true); }} disabled={!jobName || !logoType || !qty}>
          Submit Job Request
        </Button>
      </div>
    </div>
  );
}

function PendingView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-1">Pending Submissions</h2>
      <p className="text-sm text-muted-foreground mb-6">Job requests awaiting review by our team.</p>
      <div className="space-y-3">
        {PENDING_JOBS.map(j => (
          <Card key={j.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold">{j.jobName}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{j.notes}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span>Qty: <span className="font-medium text-foreground">{j.quantity}</span></span>
                    <span>Logo: <span className="font-medium text-foreground">{j.logoType}</span></span>
                    <span>Submitted: <span className="font-medium text-foreground">{fmtDate(j.submittedAt)}</span></span>
                  </div>
                </div>
                <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 shrink-0">
                  <Clock className="h-3 w-3 mr-1" /> Awaiting Review
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DocumentsView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-1">Documents</h2>
      <p className="text-sm text-muted-foreground mb-6">Invoices, delivery notes, and order confirmations.</p>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold">Document</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Date</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Size</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DOCUMENTS.map(doc => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">{doc.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{fmtDate(doc.date)}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{doc.size}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MessagesView({ onBack }: { onBack: () => void }) {
  const [activeConv, setActiveConv] = useState(CONVERSATIONS[0].id);
  const [chats, setChats] = useState(CONVERSATIONS);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conv = chats.find(c => c.id === activeConv)!;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv, conv.messages.length]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const newMsg: ChatMsg = { id: `new-${Date.now()}`, sender: "customer", text: input.trim(), time: timeStr };
    setChats(prev => prev.map(c => c.id === activeConv ? { ...c, messages: [...c.messages, newMsg] } : c));
    setInput("");
    setTimeout(() => {
      const replies = [
        "Thanks for the message, Sarah! We'll get back to you shortly.",
        "Got it — we'll look into that for you now.",
        "Thanks Sarah, noted! We'll keep you updated.",
        "Great, leave it with us!",
      ];
      const reply: ChatMsg = { id: `reply-${Date.now()}`, sender: "staff", staffName: "James", text: replies[Math.floor(Math.random() * replies.length)], time: timeStr };
      setChats(prev => prev.map(c => c.id === activeConv ? { ...c, messages: [...c.messages, reply] } : c));
    }, 1500);
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-4">Messages</h2>
      <div className="border rounded-lg overflow-hidden flex" style={{ height: "520px" }}>
        <div className="w-56 border-r flex flex-col shrink-0 bg-muted/20">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chats.map(c => (
              <button
                key={c.id}
                onClick={() => { setActiveConv(c.id); setChats(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x)); }}
                className={`w-full text-left px-3 py-3 border-b hover-elevate transition-colors flex items-start gap-2 ${activeConv === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium truncate">{c.jobName}</p>
                    {c.unread > 0 && <Badge variant="destructive" className="h-4 w-4 p-0 flex items-center justify-center text-[10px] shrink-0">{c.unread}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.messages[c.messages.length - 1]?.text}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-4 py-3 border-b bg-card/60">
            <p className="font-semibold text-sm">{conv.jobName}</p>
            <p className="text-xs text-muted-foreground">Select Branding Solutions</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {conv.messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === "customer" ? "justify-end" : "justify-start"}`}>
                {msg.sender === "staff" && (
                  <Avatar className="h-7 w-7 shrink-0 mr-2 mt-0.5">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">SB</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${msg.sender === "customer" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                  {msg.sender === "staff" && <p className="text-xs font-semibold mb-0.5 opacity-70">{msg.staffName}</p>}
                  <p className="leading-relaxed">{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === "customer" ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>{msg.time}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t p-3 flex gap-2">
            <Textarea
              placeholder="Type a message…"
              rows={1}
              className="resize-none"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim()} className="self-end shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamView({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState(TEAM_MEMBERS);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");

  const addMember = () => {
    if (!newEmail || !newFirst) return;
    setMembers(prev => [...prev, { id: `t${Date.now()}`, firstName: newFirst, lastName: newLast, email: newEmail, role: "member", initials: `${newFirst[0]}${newLast?.[0] || ""}`.toUpperCase() }]);
    setNewEmail(""); setNewFirst(""); setNewLast(""); setShowAdd(false);
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">My Team</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage who has access to your customer portal.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><UserPlus className="h-4 w-4 mr-2" />Add Team Member</Button>
      </div>

      {showAdd && (
        <Card className="mb-4">
          <CardHeader className="pb-3"><CardTitle className="text-base">Invite Team Member</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>First Name</Label><Input placeholder="e.g. Tom" value={newFirst} onChange={e => setNewFirst(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Last Name</Label><Input placeholder="e.g. Hughes" value={newLast} onChange={e => setNewLast(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email Address</Label><Input type="email" placeholder="e.g. tom.hughes@company.co.uk" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
            <div className="flex gap-2 pt-1">
              <Button onClick={addMember} disabled={!newEmail || !newFirst}>Send Invite</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">{m.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm">{m.firstName} {m.lastName} {m.email === "sarah.mitchell@apexsportswear.co.uk" && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={m.role === "admin" ? "default" : "secondary"} className="capitalize">{m.role === "admin" ? "Account Admin" : "Member"}</Badge>
              {m.role !== "admin" && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setMembers(prev => prev.filter(x => x.id !== m.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoicesView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-1">Invoices</h2>
      <p className="text-sm text-muted-foreground mb-6">Your invoice history from Select Branding Solutions.</p>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="font-semibold">Reference</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Description</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">Date</TableHead>
              <TableHead className="font-semibold text-right">Amount (inc. VAT)</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map(inv => (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30">
                <TableCell className="font-medium text-sm">{inv.ref}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{inv.jobName}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{fmtDate(inv.date)}</TableCell>
                <TableCell className="text-right font-semibold text-sm">£{inv.amount.toFixed(2)}</TableCell>
                <TableCell>
                  {inv.status === "paid"
                    ? <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>
                    : <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"><Clock className="h-3 w-3 mr-1" />Due</Badge>
                  }
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm flex-wrap gap-2">
        <p className="text-muted-foreground">Total paid: <span className="font-semibold text-foreground">£1,279.20</span></p>
        <p className="text-muted-foreground">Outstanding: <span className="font-semibold text-amber-600">£244.80</span></p>
      </div>
    </div>
  );
}

function DeliveryAddressView({ onBack }: { onBack: () => void }) {
  const [editing, setEditing] = useState(false);
  const [line1, setLine1] = useState("Unit 12, Apex Business Park");
  const [line2, setLine2] = useState("Bradford Road");
  const [city, setCity] = useState("Leeds");
  const [postcode, setPostcode] = useState("LS28 6AB");

  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h2 className="text-2xl font-bold mb-1">Delivery Address</h2>
      <p className="text-sm text-muted-foreground mb-6">Where we'll send your completed orders.</p>

      {!editing ? (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div className="text-sm leading-relaxed">
                  <p className="font-medium">{DEMO_COMPANY}</p>
                  <p className="text-muted-foreground">{line1}</p>
                  <p className="text-muted-foreground">{line2}</p>
                  <p className="text-muted-foreground">{city}</p>
                  <p className="text-muted-foreground">{postcode}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="space-y-1.5"><Label>Address Line 1</Label><Input value={line1} onChange={e => setLine1(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Address Line 2</Label><Input value={line2} onChange={e => setLine2(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Town / City</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Postcode</Label><Input value={postcode} onChange={e => setPostcode(e.target.value)} /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => setEditing(false)}>Save Address</Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaymentCardsView({ onBack }: { onBack: () => void }) {
  const [saved, setSaved] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const handlePay = () => {
    setPaying(true);
    setTimeout(() => { setPaying(false); setPaid(true); }, 1800);
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Payment Cards</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Saved cards for fast, secure payment of invoices.</p>
        </div>
      </div>

      {saved && (
        <Card className="mb-4 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-md flex items-center justify-center">
                  <SiVisa className="text-white h-5 w-8" />
                </div>
                <div>
                  <p className="font-medium text-sm">Visa ending in 4242</p>
                  <p className="text-xs text-muted-foreground">Expires 08 / 28</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Default</Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setSaved(false)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!saved && (
        <div className="mb-4 p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">
          No saved cards. Add one below to enable fast invoice payments.
        </div>
      )}

      {!paid && (
        <Card className="mb-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm">Outstanding Invoice</p>
                <p className="text-sm text-muted-foreground">INV-00145 — Staff Fleeces – Warehouse</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-bold text-lg">£244.80</p>
                {saved && (
                  <Button size="sm" onClick={handlePay} disabled={paying}>
                    {paying ? "Processing…" : "Pay Now"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {paid && (
        <Card className="mb-4 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-sm text-green-800 dark:text-green-200">Payment Successful</p>
              <p className="text-xs text-green-700 dark:text-green-300">£244.80 charged to Visa ending 4242. Reference: PAY-2026-00145.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a New Card</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cardholder Name</Label>
            <Input placeholder="Sarah Mitchell" />
          </div>
          <div className="space-y-1.5">
            <Label>Card Number</Label>
            <Input placeholder="1234 5678 9012 3456" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Expiry Date</Label><Input placeholder="MM / YY" /></div>
            <div className="space-y-1.5"><Label>CVC</Label><Input placeholder="123" /></div>
          </div>
          <Button className="w-full mt-1">Save Card Securely</Button>
          <p className="text-xs text-muted-foreground text-center">Secured by Stripe. We never store your card details directly.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Dashboard view ────────────────────────────────────────────────────────────

type SortKey = "date" | "jobName" | "description" | "quantity" | "status" | "tracking";

function DashboardView({
  onNavigate, unread, onSuggestFeature,
}: {
  onNavigate: (v: View) => void;
  unread: number;
  onSuggestFeature: () => void;
}) {
  const [tab, setTab] = useState<"in_progress" | "completed" | "all">("in_progress");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; message: string; reference?: string } | null>(null);

  const isCompleted = (j: PreviewJob) => j.completed;

  const filtered = JOBS
    .filter(j => {
      if (tab === "in_progress" && isCompleted(j)) return false;
      if (tab === "completed" && !isCompleted(j)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          j.jobName.toLowerCase().includes(q) ||
          (j.poNumber ?? "").toLowerCase().includes(q) ||
          (j.notes ?? "").toLowerCase().includes(q) ||
          j.lineItems.some(li => (li.description ?? "").toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "jobName":
          comparison = a.jobName.localeCompare(b.jobName);
          break;
        case "description": {
          const aDesc = a.lineItems[0]?.description || a.lineItems[0]?.jobType || "";
          const bDesc = b.lineItems[0]?.description || b.lineItems[0]?.jobType || "";
          comparison = aDesc.localeCompare(bDesc);
          break;
        }
        case "quantity": {
          const aQty = a.lineItems.reduce((s, li) => s + li.quantity, 0);
          const bQty = b.lineItems.reduce((s, li) => s + li.quantity, 0);
          comparison = aQty - bQty;
          break;
        }
        case "status": {
          const rank: Record<JobStatus, number> = { overdue: 0, due_today: 1, awaiting: 2, in_progress: 3, completed: 4 };
          comparison = rank[getJobStatus(a)] - rank[getJobStatus(b)];
          break;
        }
        case "tracking":
          comparison = (a.tracking || "").localeCompare(b.tracking || "");
          break;
        case "date":
        default:
          if (!a.dispatchDate && !b.dispatchDate) comparison = 0;
          else if (!a.dispatchDate) comparison = 1;
          else if (!b.dispatchDate) comparison = -1;
          else comparison = new Date(a.dispatchDate).getTime() - new Date(b.dispatchDate).getTime();
          break;
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });

  const inProgressCount = JOBS.filter(j => !isCompleted(j)).length;
  const completedCount = JOBS.filter(j => isCompleted(j)).length;

  const handleColumnSort = (column: SortKey) => {
    if (sortBy === column) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortBy(column); setSortDirection("asc"); }
  };

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Selection / payment
  const toggleLineItem = (id: string) => {
    setSelectedLineItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allLineItems = JOBS.flatMap(j => j.lineItems.map(li => ({ li, job: j })));
  const payableLineItems = filtered.flatMap(j => j.lineItems.filter(li => typeof li.estimatedPrice === "number"));
  const allPayableSelected = payableLineItems.length > 0 && payableLineItems.every(li => selectedLineItemIds.has(li.id));
  const somePayableSelected = payableLineItems.some(li => selectedLineItemIds.has(li.id));
  const toggleAllPayable = () => {
    if (allPayableSelected) setSelectedLineItemIds(new Set());
    else setSelectedLineItemIds(new Set(payableLineItems.map(li => li.id)));
  };

  const selectedSubtotal = allLineItems
    .filter(({ li }) => selectedLineItemIds.has(li.id) && typeof li.estimatedPrice === "number")
    .reduce((sum, { li }) => sum + (li.estimatedPrice as number), 0);
  const selectedVat = selectedSubtotal * VAT_RATE;
  const selectedTotal = selectedSubtotal + selectedVat;

  // "Did you know" — average cost per logo over completed orders
  const completedJobs = JOBS.filter(isCompleted);
  const totalSpend = completedJobs.reduce(
    (s, j) => s + j.lineItems.reduce((ls, li) => ls + (typeof li.estimatedPrice === "number" ? li.estimatedPrice : 0), 0),
    0,
  );
  const totalLogos = completedJobs.reduce(
    (s, j) => s + j.lineItems.filter(li => {
      const t = li.jobType.toLowerCase();
      return t.includes("embroid") || t.includes("print");
    }).reduce((ls, li) => ls + li.quantity, 0),
    0,
  );
  const avgCostPerLogo = totalLogos > 0 ? totalSpend / totalLogos : null;

  // Banners
  const awaitingJobs = (tab === "completed" ? [] : JOBS).filter(j => j.awaitingPayment && !j.completed);
  const awaitingTotalEx = awaitingJobs
    .flatMap(j => j.lineItems)
    .reduce((s, li) => s + (typeof li.estimatedPrice === "number" ? li.estimatedPrice : 0), 0);
  const awaitingTotalVat = awaitingTotalEx * VAT_RATE;

  const notBookedJobs = (tab === "completed" ? [] : filtered).filter(
    j => !j.completed && (!j.dispatchDate || j.lineItems.length === 0),
  );

  return (
    <>
      {/* SBS logo hero */}
      <div className="flex justify-center mb-6">
        <img src={sbsLogo} alt="Select Branding Solutions" className="object-contain" style={{ maxHeight: "100px", maxWidth: "360px", width: "100%" }} />
      </div>

      {/* Contact Us */}
      <div className="mb-6">
        <h2 className="text-center text-lg font-semibold mb-3">Contact Us</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <a href={CONTACT.phoneTel} className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40"><Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
            <div><p className="text-sm font-medium">Phone</p><p className="text-xs text-muted-foreground mt-0.5">{CONTACT.phone}</p></div>
          </a>
          <a href={`mailto:${CONTACT.email}`} className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40"><Mail className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>
            <div><p className="text-sm font-medium">Email</p><p className="text-xs text-muted-foreground mt-0.5 break-all">{CONTACT.email}</p></div>
          </a>
          <button onClick={() => onNavigate("messages")} className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><MessageSquare className="h-5 w-5 text-primary" /></div>
            <div><p className="text-sm font-medium">Message Us</p><p className="text-xs text-muted-foreground mt-0.5">via the app</p></div>
          </button>
          <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40"><SiWhatsapp className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
            <div><p className="text-sm font-medium">WhatsApp</p><p className="text-xs text-muted-foreground mt-0.5">Chat with us</p></div>
          </a>
          <button onClick={() => onNavigate("messages")} className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 col-span-2 sm:col-span-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40"><Headphones className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
            <div><p className="text-sm font-medium">Live Chat</p><p className="text-xs text-muted-foreground mt-0.5">We're here to help</p></div>
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div className="flex items-start gap-4 rounded-xl bg-muted/50 border border-border p-4 mb-6">
        <span className="text-3xl leading-none mt-0.5 shrink-0" role="img" aria-label="greeting icon">🦁</span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-base leading-tight">Hi {DEMO_NAME}</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">A group of lions is called a pride, a group of crows is a murder, and a group of goldfish is a troubling. Quite the vocabulary!</p>
          {avgCostPerLogo !== null && (
            <p className="text-sm text-foreground mt-2 leading-relaxed flex items-start gap-1.5">
              <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                Did you know? Your average cost per logo over the last 12 weeks was just{" "}
                <span className="font-semibold">£{avgCostPerLogo.toFixed(2)}</span>.
              </span>
            </p>
          )}
          <p className="text-xs text-muted-foreground/70 mt-2">Last signed in about 3 hours ago</p>
        </div>
      </div>

      {/* Action buttons (desktop) */}
      <div className="hidden md:flex items-center gap-3 flex-wrap mb-6">
        <Button onClick={() => onNavigate("submit")}><Plus className="h-4 w-4 mr-2" />Submit New Job</Button>
        <Button variant="outline" onClick={() => onNavigate("pending")}><FileText className="h-4 w-4 mr-2" />Pending Submissions</Button>
        <Button variant="outline" onClick={() => onNavigate("documents")}><FileText className="h-4 w-4 mr-2" />Documents</Button>
        <Button variant="outline" className="relative" onClick={() => onNavigate("messages")}>
          <MessageSquare className="h-4 w-4 mr-2" />Messages
          {unread > 0 && <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-xs">{unread}</Badge>}
        </Button>
        <Button variant="outline" onClick={() => onNavigate("team")}><Users className="h-4 w-4 mr-2" />My Team</Button>
        <Button variant="outline" onClick={() => onNavigate("invoices")}><Receipt className="h-4 w-4 mr-2" />Invoices</Button>
        <Button variant="outline" onClick={() => onNavigate("payment-methods")}><CreditCard className="h-4 w-4 mr-2" />Payment Cards</Button>
        <Button variant="outline" onClick={() => onNavigate("delivery-address")}><MapPin className="h-4 w-4 mr-2" />Delivery Address</Button>
        <Button variant="outline" onClick={onSuggestFeature}><Lightbulb className="h-4 w-4 mr-2" />Suggest a Feature</Button>
      </div>

      {/* Action button (mobile) */}
      <div className="md:hidden mb-6">
        <Button className="w-full" onClick={() => onNavigate("submit")}><Plus className="h-4 w-4 mr-2" />Submit New Job</Button>
      </div>

      {/* Production Queue */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground mb-2">Production Queue</h2>
        <p className="text-sm text-muted-foreground">View the status and progress of your orders in production</p>
      </div>

      {/* Search and filter controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={sortBy} onValueChange={(v: SortKey) => { setSortBy(v); setSortDirection("asc"); }}>
            <SelectTrigger className="w-full sm:w-48">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Production Date</SelectItem>
              <SelectItem value="jobName">Job Name</SelectItem>
              <SelectItem value="description">Item Description</SelectItem>
              <SelectItem value="quantity">Quantity</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="tracking">Tracking</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
            title={sortDirection === "asc" ? "Ascending (earliest first)" : "Descending (latest first)"}
          >
            {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>
        </div>
        <Tabs value={tab} onValueChange={v => { setTab(v as typeof tab); setSelectedLineItemIds(new Set()); }}>
          <TabsList>
            <TabsTrigger value="in_progress">In Progress <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{inProgressCount}</Badge></TabsTrigger>
            <TabsTrigger value="completed">Completed <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{completedCount}</Badge></TabsTrigger>
            <TabsTrigger value="all">All Orders</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Payment required (BACS) banner */}
      {awaitingJobs.length > 0 && (
        <div className="mb-4 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-orange-900 dark:text-orange-100 text-sm">Payment required before production begins</p>
              <p className="text-xs text-orange-800 dark:text-orange-200 mt-0.5">
                {awaitingJobs.length} order{awaitingJobs.length !== 1 ? "s" : ""} ({awaitingJobs.map(j => j.jobName).join(", ")}) {awaitingJobs.length !== 1 ? "are" : "is"} on hold pending advance payment by BACS. Once payment is received and confirmed, production will be scheduled.
              </p>
              <div className="mt-2 text-xs text-orange-800 dark:text-orange-200 space-y-0.5">
                <p className="font-semibold">BACS Payment Details:</p>
                <p>Account name: <span className="font-medium">Select Branding Solutions Ltd</span></p>
                <p>Sort code: <span className="font-medium">04-06-05</span></p>
                <p>Account number: <span className="font-medium">30422879</span></p>
                <p className="mt-1 text-orange-700 dark:text-orange-300">Please use your company name as the payment reference.</p>
              </div>
            </div>
            {awaitingTotalEx > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xs text-orange-700 dark:text-orange-300">£{awaitingTotalEx.toFixed(2)} ex. VAT</p>
                <p className="text-xs text-orange-700 dark:text-orange-300">+ £{awaitingTotalVat.toFixed(2)} VAT</p>
                <p className="font-bold text-orange-900 dark:text-orange-100 text-sm">£{(awaitingTotalEx + awaitingTotalVat).toFixed(2)} total due</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Not-yet-booked banner */}
      {notBookedJobs.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <p className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
            {notBookedJobs.length} order{notBookedJobs.length !== 1 ? "s" : ""} not yet booked into production
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
            {notBookedJobs.map(j => j.jobName).join(", ")} {notBookedJobs.length !== 1 ? "are" : "is"} currently being reviewed by our team and will be scheduled with a confirmed production date shortly. We'll be in touch if we need anything from you.
          </p>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No {tab.replace("_", " ")} orders</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-4">
            {filtered.map(job => (
              <Card key={job.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{job.jobName}</CardTitle>
                  {job.poNumber && <p className="text-sm text-muted-foreground">PO: {job.poNumber}</p>}
                  {job.notes && <p className="text-sm text-muted-foreground mt-1">Note: {job.notes}</p>}
                  <div className="flex items-center gap-2 mt-2"><StatusBadge job={job} /></div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="pb-3 border-b">
                    <p className="text-xs text-muted-foreground mb-1">Production Date</p>
                    {job.dispatchDate
                      ? <p className="text-sm font-medium">{fmtDate(job.dispatchDate)}</p>
                      : <p className="text-sm font-medium text-amber-600">Not yet booked in</p>}
                  </div>

                  {job.completed && job.tracking && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">DPD Local Tracking Number</p>
                      <a href={dpdUrl(job.tracking)} target="_blank" rel="noopener noreferrer" className="text-sm font-mono font-semibold text-primary hover:underline">
                        {job.tracking}
                      </a>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Line Items:</p>
                    {job.lineItems.map(li => (
                      <div key={li.id} className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          {typeof li.estimatedPrice === "number" && (
                            <Checkbox checked={selectedLineItemIds.has(li.id)} onCheckedChange={() => toggleLineItem(li.id)} className="mt-0.5 shrink-0" />
                          )}
                          <div className="flex items-start justify-between gap-2 flex-1">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{li.jobType}</p>
                              {li.description && <p className="text-xs text-muted-foreground mt-0.5">{li.description}</p>}
                              {li.stitchCount ? <p className="text-xs text-muted-foreground mt-0.5">{li.stitchCount.toLocaleString()} stitches</p> : null}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold mb-1">Qty: {li.quantity}</p>
                              <EstimatedCostCell price={li.estimatedPrice} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground">
                      Estimated costs include VAT and are based on the quantity and stitch count provided. Final invoice may differ if these change. Carriage is charged separately.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table layout */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      {payableLineItems.length > 0 && (
                        <Checkbox
                          checked={allPayableSelected}
                          onCheckedChange={toggleAllPayable}
                          aria-label="Select all payable items"
                          className={somePayableSelected && !allPayableSelected ? "opacity-50" : ""}
                        />
                      )}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("jobName")}>
                      <div className="flex items-center">Job Name<SortIndicator column="jobName" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("description")}>
                      <div className="flex items-center">Item Description<SortIndicator column="description" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("quantity")}>
                      <div className="flex items-center justify-end">Quantity<SortIndicator column="quantity" /></div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col items-end leading-tight">
                        <span>Est. Cost</span>
                        <span className="text-[10px] font-normal text-muted-foreground">(inc. VAT, exc. carriage)</span>
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("date")}>
                      <div className="flex items-center">Production Date<SortIndicator column="date" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("status")}>
                      <div className="flex items-center">Status<SortIndicator column="status" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleColumnSort("tracking")}>
                      <div className="flex items-center">Tracking<SortIndicator column="tracking" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(job =>
                    job.lineItems.map((li, index) => (
                      <TableRow key={li.id} className={index > 0 ? "border-t-0" : ""}>
                        <TableCell className="w-10">
                          {typeof li.estimatedPrice === "number" && (
                            <Checkbox
                              checked={selectedLineItemIds.has(li.id)}
                              onCheckedChange={() => toggleLineItem(li.id)}
                              aria-label={`Select ${li.jobType} line item`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span>{job.jobName}</span>
                          {index === 0 && job.poNumber && <span className="text-xs text-muted-foreground ml-2">(PO: {job.poNumber})</span>}
                          {index === 0 && job.notes && <div className="text-xs text-muted-foreground mt-1">Note: {job.notes}</div>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{li.jobType}</div>
                            {li.description && <div className="text-xs text-muted-foreground">{li.description}</div>}
                            {li.stitchCount ? <div className="text-xs text-muted-foreground">{li.stitchCount.toLocaleString()} stitches</div> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{li.quantity}</TableCell>
                        <TableCell className="text-right"><EstimatedCostCell price={li.estimatedPrice} /></TableCell>
                        <TableCell>
                          {job.dispatchDate
                            ? fmtDate(job.dispatchDate)
                            : <span className="text-amber-600 font-medium">Not yet booked in</span>}
                        </TableCell>
                        <TableCell><StatusBadge job={job} /></TableCell>
                        <TableCell>
                          {index === 0 && job.completed && job.tracking ? (
                            <a href={dpdUrl(job.tracking)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary hover:underline">
                              {job.tracking}
                            </a>
                          ) : (
                            index === 0 && <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          <p className="hidden md:block text-xs text-muted-foreground mt-2 px-1">
            Estimated costs include VAT (20%) and are based on the quantity and stitch count provided at submission. The final invoice may differ if quantities or stitch counts change after production. Carriage is charged separately based on number of boxes.
          </p>
        </>
      )}

      {/* Sticky Pay Now bar */}
      {selectedLineItemIds.size > 0 && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg px-4 py-3">
          <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">{selectedLineItemIds.size} item{selectedLineItemIds.size !== 1 ? "s" : ""} selected</span>
              <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
              <div className="hidden sm:block text-sm">
                <span className="text-muted-foreground">£{selectedSubtotal.toFixed(2)} ex. VAT + £{selectedVat.toFixed(2)} VAT = </span>
                <span className="font-semibold">£{selectedTotal.toFixed(2)} total</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedLineItemIds(new Set())}>Clear</Button>
              <Button size="sm" onClick={() => { setPaymentResult(null); setPayDialogOpen(true); }}>
                <CreditCard className="w-4 h-4 mr-2" />Pay Now — £{selectedTotal.toFixed(2)}
              </Button>
            </div>
          </div>
          <div className="sm:hidden text-xs text-muted-foreground mt-1 max-w-screen-xl mx-auto">
            £{selectedSubtotal.toFixed(2)} ex. VAT + £{selectedVat.toFixed(2)} VAT = £{selectedTotal.toFixed(2)} inc. VAT
          </div>
        </div>
      )}

      {/* Pay Now confirmation dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { setPayDialogOpen(open); if (!open) setPaymentResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{paymentResult ? (paymentResult.success ? "Payment Successful" : "Payment Failed") : "Confirm Payment"}</DialogTitle>
            <DialogDescription>
              {paymentResult
                ? paymentResult.success ? "Your card has been charged successfully." : "There was a problem processing your payment."
                : "Your saved card on file will be charged for the following items."}
            </DialogDescription>
          </DialogHeader>

          {!paymentResult ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allLineItems.filter(({ li }) => selectedLineItemIds.has(li.id)).map(({ li, job }) => {
                  const price = li.estimatedPrice as number;
                  return (
                    <div key={li.id} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="font-medium">{job.jobName}</div>
                        <div className="text-muted-foreground text-xs">{li.jobType} · Qty {li.quantity}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">£{price.toFixed(2)} ex. VAT</div>
                        <div className="font-medium">£{(price * 1.2).toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal ex. VAT</span><span>£{selectedSubtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm text-muted-foreground"><span>VAT (20%)</span><span>£{selectedVat.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>£{selectedTotal.toFixed(2)}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">Carriage is not included and will be invoiced separately.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => {
                  setPaymentResult({ success: true, message: `Payment of £${selectedTotal.toFixed(2)} was successful.`, reference: "PAY-2026-00146" });
                  setSelectedLineItemIds(new Set());
                }}>
                  Pay £{selectedTotal.toFixed(2)}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className={`rounded-md p-4 text-sm ${paymentResult.success ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200" : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"}`}>
                {paymentResult.message}
                {paymentResult.reference && <div className="text-xs mt-1 opacity-75">Reference: {paymentResult.reference}</div>}
              </div>
              <DialogFooter>
                <Button onClick={() => setPayDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function PortalPreview() {
  const [view, setView] = useState<View>("dashboard");
  const [unread, setUnread] = useState(1);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [featureText, setFeatureText] = useState("");
  const [featureSubmitted, setFeatureSubmitted] = useState(false);

  const handleNavigate = (v: View) => {
    if (v === "messages") setUnread(0);
    setView(v);
  };

  const PAGE_TITLES: Record<View, string> = {
    dashboard: "Dashboard",
    submit: "Submit New Job",
    pending: "Pending Submissions",
    documents: "Documents",
    messages: "Messages",
    team: "My Team",
    invoices: "Invoices",
    "payment-methods": "Payment Cards",
    "delivery-address": "Delivery Address",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Demo banner */}
      <div className="bg-primary text-primary-foreground text-center py-2 text-xs font-medium tracking-wide uppercase">
        Demo Preview — This is how your customer portal could look
      </div>

      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              {view !== "dashboard" && (
                <button onClick={() => setView("dashboard")} className="mr-1 text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 rounded-md">
                <Package className="h-5 w-5 text-white" />
                <span className="font-bold text-white text-sm tracking-tight">{DEMO_COMPANY}</span>
              </div>
              {view !== "dashboard" && (
                <div className="hidden sm:flex items-center gap-1 text-muted-foreground text-sm">
                  <ChevronRight className="h-4 w-4" />
                  <span>{PAGE_TITLES[view]}</span>
                </div>
              )}
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" size="sm"><Key className="h-4 w-4 mr-2" />Change Password</Button>
              <Button variant="outline" size="sm"><LogOut className="h-4 w-4 mr-2" />Logout</Button>
            </div>

            {/* Mobile menu */}
            <div className="flex md:hidden items-center gap-2">
              {unread > 0 && (
                <Button variant="ghost" size="icon" onClick={() => handleNavigate("messages")} className="relative">
                  <MessageSquare className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-medium">{unread}</span>
                </Button>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetHeader className="mb-4"><SheetTitle>Menu</SheetTitle></SheetHeader>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("messages")}><MessageSquare className="h-4 w-4" />Messages{unread > 0 && <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-xs">{unread}</Badge>}</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("pending")}><FileText className="h-4 w-4" />Pending Submissions</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("documents")}><FileText className="h-4 w-4" />Documents</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("invoices")}><Receipt className="h-4 w-4" />Invoices</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("team")}><Users className="h-4 w-4" />My Team</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("payment-methods")}><CreditCard className="h-4 w-4" />Payment Cards</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => handleNavigate("delivery-address")}><MapPin className="h-4 w-4" />Delivery Address</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => { setFeatureSubmitted(false); setFeatureOpen(true); }}><Lightbulb className="h-4 w-4" />Suggest a Feature</Button>
                    <Separator className="my-2" />
                    <Button variant="ghost" className="justify-start gap-3 h-11"><Key className="h-4 w-4" />Change Password</Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11 text-destructive"><LogOut className="h-4 w-4" />Logout</Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-8 max-w-5xl">
        {view === "dashboard" && <DashboardView onNavigate={handleNavigate} unread={unread} onSuggestFeature={() => { setFeatureSubmitted(false); setFeatureOpen(true); }} />}
        {view === "submit" && <SubmitJobView onBack={() => setView("dashboard")} />}
        {view === "pending" && <PendingView onBack={() => setView("dashboard")} />}
        {view === "documents" && <DocumentsView onBack={() => setView("dashboard")} />}
        {view === "messages" && <MessagesView onBack={() => setView("dashboard")} />}
        {view === "team" && <TeamView onBack={() => setView("dashboard")} />}
        {view === "invoices" && <InvoicesView onBack={() => setView("dashboard")} />}
        {view === "payment-methods" && <PaymentCardsView onBack={() => setView("dashboard")} />}
        {view === "delivery-address" && <DeliveryAddressView onBack={() => setView("dashboard")} />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card flex items-stretch h-16">
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate" onClick={() => setView("dashboard")}>
          <Package className="h-5 w-5" /><span>Orders</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate relative" onClick={() => handleNavigate("messages")}>
          <span className="relative">
            <MessageSquare className="h-5 w-5" />
            {unread > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-medium">{unread}</span>}
          </span>
          <span>Messages</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate" onClick={() => handleNavigate("invoices")}>
          <Receipt className="h-5 w-5" /><span>Invoices</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate" onClick={() => handleNavigate("submit")}>
          <Plus className="h-5 w-5" /><span>New Job</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate" onClick={() => handleNavigate("team")}>
          <Users className="h-5 w-5" /><span>My Team</span>
        </button>
      </nav>

      {/* Suggest a Feature dialog */}
      <Dialog open={featureOpen} onOpenChange={setFeatureOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{featureSubmitted ? "Thank You!" : "Suggest a Feature"}</DialogTitle>
            <DialogDescription>
              {featureSubmitted
                ? "Your suggestion has been sent to our team. We really appreciate your feedback!"
                : "Got an idea to make the portal better? We'd love to hear it."}
            </DialogDescription>
          </DialogHeader>
          {!featureSubmitted ? (
            <>
              <Textarea
                placeholder="Describe your idea…"
                rows={4}
                value={featureText}
                onChange={e => setFeatureText(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setFeatureOpen(false)}>Cancel</Button>
                <Button disabled={!featureText.trim()} onClick={() => { setFeatureSubmitted(true); setFeatureText(""); }}>Send Suggestion</Button>
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <Button onClick={() => setFeatureOpen(false)}>Close</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

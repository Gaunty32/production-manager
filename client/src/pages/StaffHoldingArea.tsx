import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, FileText, MessageSquare, CheckCircle, XCircle, Eye, Plus, X, StickyNote, Pencil, Check, Search, Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { StaffJobFileUpload } from "@/components/StaffJobFileUpload";
import { JobFormDialog } from "@/components/JobFormDialog";
import { JobEditDialog } from "@/components/JobEditDialog";

type Job = {
  id: string;
  jobName: string;
  jobNumber?: number | null;
  customerId: string;
  customerName: string;
  customerStripePaymentLink?: string | null;
  customerCreditAccount?: boolean;
  poNumber: string | null;
  quantity: number;
  requiredDispatchDate: string | null;
  notes: string | null;
  staffNotes: string | null;
  deliveryAddress: string | null;
  submittedAt: string;
  submittedById?: string | null;
  submitterEmail?: string | null;
  files?: { id: string; fileName: string; fileSize: number }[];
  messages?: { id: string; senderType: string; message: string; createdAt: string }[];
};

type DialogState = {
  type: "approve" | "reject" | null;
  jobId: string | null;
  jobName: string | null;
  customerId: string | null;
};

export default function StaffHoldingArea() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogState, setDialogState] = useState<DialogState>({ type: null, jobId: null, jobName: null, customerId: null });
  const [editingNoteJobId, setEditingNoteJobId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [embroiderySetups, setEmbroiderySetups] = useState<string[]>([]);
  const [setupNotRequired, setSetupNotRequired] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const previousMessageCountsRef = useRef<Record<string, number>>({});
  const isInitialLoadRef = useRef<boolean>(true);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: pendingJobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/staff/jobs/pending"],
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  const { data: customers = [] } = useQuery<{ id: string; name: string; active: boolean }[]>({
    queryKey: ["/api/customers"],
  });

  const { data: staff = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/staff"],
  });

  const activeCustomers = customers.filter(c => c.active !== false);

  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  const filteredPendingJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pendingJobs.filter(j => {
      if (customerFilter !== "all" && j.customerId !== customerFilter) return false;
      if (!q) return true;
      return (
        j.jobName?.toLowerCase().includes(q) ||
        j.customerName?.toLowerCase().includes(q) ||
        (j.poNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [pendingJobs, searchQuery, customerFilter]);

  const submittingCustomers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const j of pendingJobs) {
      if (j.customerId && !seen.has(j.customerId)) seen.set(j.customerId, j.customerName);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingJobs]);

  // Track which card is most visible using IntersectionObserver
  useEffect(() => {
    if (!pendingJobs || pendingJobs.length === 0) {
      setActiveJobId(null);
      return;
    }

    // Set first job as active initially
    if (!activeJobId && pendingJobs.length > 0) {
      setActiveJobId(pendingJobs[0].id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the card with highest intersection ratio
        let maxRatio = 0;
        let mostVisibleJobId: string | null = null;

        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisibleJobId = entry.target.getAttribute('data-job-id');
          }
        });

        if (mostVisibleJobId && maxRatio > 0.3) {
          setActiveJobId(mostVisibleJobId);
        }
      },
      {
        root: null,
        threshold: [0, 0.3, 0.5, 0.7, 1.0],
      }
    );

    // Observe all cards
    Object.values(cardRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [pendingJobs, activeJobId]);

  // Show popup notification when new customer messages arrive
  useEffect(() => {
    if (isLoading) return;

    const currentMessageCounts: Record<string, number> = {};
    let totalNewMessages = 0;
    const jobsWithNewMessages: string[] = [];

    // Count customer messages for each job
    pendingJobs.forEach(job => {
      const customerMessages = (job.messages || []).filter(m => m.senderType === "customer");
      const count = customerMessages.length;
      currentMessageCounts[job.id] = count;

      // Skip notification on initial load
      if (!isInitialLoadRef.current) {
        const previousCount = previousMessageCountsRef.current[job.id] || 0;
        if (count > previousCount) {
          const newCount = count - previousCount;
          totalNewMessages += newCount;
          jobsWithNewMessages.push(job.jobName);
        }
      }
    });

    // Show notification if there are new customer messages
    if (!isInitialLoadRef.current && totalNewMessages > 0) {
      toast({
        title: "New customer message",
        description: jobsWithNewMessages.length === 1
          ? `${jobsWithNewMessages[0]} has ${totalNewMessages} new message${totalNewMessages > 1 ? 's' : ''}`
          : `${totalNewMessages} new messages from ${jobsWithNewMessages.length} jobs`,
      });
    }

    previousMessageCountsRef.current = currentMessageCounts;
    isInitialLoadRef.current = false;
  }, [pendingJobs, isLoading, toast]);

  const approveMutation = useMutation({
    mutationFn: async ({ jobId, customerId, setupNames }: { jobId: string; customerId: string | null; setupNames: string[] }) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/approve`, {});
      const result = await res.json();
      for (const name of setupNames.filter(n => n.trim())) {
        await apiRequest("POST", "/api/logo-setups", { customerId, jobName: name.trim() });
      }
      return result;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/logo-setups"] });
      setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
      setEmbroiderySetups([]);
      setSetupNotRequired(false);
      // Auto-open the production worksheet so staff can complete the job details
      try {
        const res = await fetch(`/api/jobs/${variables.jobId}`, { credentials: "include" });
        if (res.ok) {
          const fullJob = await res.json();
          setEditingJob(fullJob);
        }
      } catch {
        toast({ title: "Job approved", description: "The job has been moved to production" });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve job",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ jobId, reason, message }: { jobId: string; reason: string; message?: string }) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/reject`, {
        reason,
        message,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      toast({
        title: "Job rejected",
        description: "The customer has been notified",
      });
      setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
      setRejectionReason("");
      setRejectionMessage("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject job",
        variant: "destructive",
      });
    },
  });

  const staffNotesMutation = useMutation({
    mutationFn: ({ jobId, staffNotes }: { jobId: string; staffNotes: string }) =>
      apiRequest("PATCH", `/api/staff/jobs/${jobId}/staff-notes`, { staffNotes: staffNotes.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      setEditingNoteJobId(null);
    },
    onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
  });

  const handlePrintJob = (job: Job) => {
    const esc = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const requiredDate = job.requiredDispatchDate
      ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
      : "Not set";
    const submitted = job.submittedAt
      ? format(new Date(job.submittedAt), "d MMM yyyy 'at' HH:mm")
      : "";

    const row = (label: string, value: string) =>
      value
        ? `<div class="row"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`
        : "";

    const block = (label: string, value: string) =>
      value
        ? `<div class="block"><div class="label">${esc(label)}</div><div class="box">${value}</div></div>`
        : "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(job.jobName)} — ${esc(job.customerName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; margin: 32px; }
    .customer { color: #6366f1; font-weight: 600; font-size: 13px; margin: 0 0 2px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    .po { color: #71717a; font-size: 13px; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; margin-bottom: 20px; }
    .label { color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
    .value { font-size: 15px; font-weight: 500; }
    .block { margin-bottom: 18px; }
    .box { border: 1px solid #e4e4e7; background: #fafafa; border-radius: 6px; padding: 12px; font-size: 14px; white-space: pre-line; }
    hr { border: none; border-top: 1px solid #e4e4e7; margin: 20px 0; }
    .footer { color: #a1a1aa; font-size: 11px; margin-top: 28px; }
  </style>
</head>
<body>
  <p class="customer">${esc(job.customerName)}</p>
  <h1>${esc(job.jobName)}</h1>
  ${job.poNumber ? `<p class="po">PO: ${esc(job.poNumber)}</p>` : ""}
  <div class="grid">
    ${row("Quantity", esc(job.quantity))}
    ${row("Required Date", esc(requiredDate))}
    ${row("Submitted", esc(submitted))}
    ${row("Files", esc(job.files?.length || 0))}
  </div>
  ${block("Delivery Address", job.deliveryAddress ? esc(job.deliveryAddress) : "")}
  ${block("Notes", job.notes ? esc(job.notes) : "")}
  ${block("Internal Notes", job.staffNotes ? esc(job.staffNotes) : "")}
  <div class="footer">Printed ${esc(format(new Date(), "d MMM yyyy 'at' HH:mm"))} — Select Branding Solutions</div>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      toast({
        title: "Couldn't open print window",
        description: "Please allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const updateJobMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setEditingJob(null);
      toast({ title: "Job updated", description: "Production details have been saved" });
    },
    onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
  });

  const handleApprove = (jobId: string, jobName: string, customerId: string) => {
    setDialogState({ type: "approve", jobId, jobName, customerId });
  };

  const handleReject = (jobId: string, jobName: string) => {
    setDialogState({ type: "reject", jobId, jobName, customerId: null });
  };

  const confirmApprove = () => {
    if (dialogState.jobId) {
      approveMutation.mutate({
        jobId: dialogState.jobId,
        customerId: dialogState.customerId,
        setupNames: embroiderySetups,
      });
    }
  };

  const confirmReject = () => {
    if (dialogState.jobId && rejectionReason.trim()) {
      rejectMutation.mutate({
        jobId: dialogState.jobId,
        reason: rejectionReason,
        message: rejectionMessage.trim() || undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4 md:py-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Customer Job Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve customer job requests ({filteredPendingJobs.length}
            {filteredPendingJobs.length !== pendingJobs.length ? ` of ${pendingJobs.length}` : ""} pending)
          </p>
        </div>
        <div className="flex-shrink-0">
          <JobFormDialog
            trigger={
              <Button data-testid="button-new-job-holding">
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            }
            customers={activeCustomers}
            staff={staff}
            onJobCreated={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
            }}
          />
        </div>
      </div>

      {pendingJobs.length === 0 ? (
        <div className="px-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No pending submissions
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by job name, customer, or PO…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-holding-search"
              />
            </div>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[220px]" data-testid="select-holding-customer">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {submittingCustomers.map(c => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-holding-customer-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchQuery || customerFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(""); setCustomerFilter("all"); }}
                data-testid="button-holding-clear-filters"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="px-4 pb-24 md:pb-4">
            {filteredPendingJobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-holding-no-matches">
                  No submissions match your filters.
                </CardContent>
              </Card>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredPendingJobs.map((job, index) => (
              <Card 
                key={job.id}
                ref={(el) => cardRefs.current[job.id] = el}
                data-job-id={job.id}
                data-testid={`card-job-${job.id}`}
                className={activeJobId === job.id ? "border-2 border-primary md:border md:border-border md:shadow-none transition-all duration-200" : "md:transition-none"}
              >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-0.5" data-testid={`text-customer-${job.id}`}>
                      {job.customerName}
                    </p>
                    <CardTitle className="text-lg mb-1 truncate" data-testid={`text-jobname-${job.id}`}>
                      {job.jobName}
                    </CardTitle>
                    {job.poNumber && (
                      <p className="text-sm text-muted-foreground">PO: {job.poNumber}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintJob(job)}
                      data-testid={`button-print-${job.id}`}
                    >
                      <Printer className="h-4 w-4 mr-1.5" />
                      Print
                    </Button>
                    <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                    <p className="font-medium">{job.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Required Date</p>
                    <p className="font-medium text-sm">
                      {job.requiredDispatchDate
                        ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Submitted</p>
                    <p className="font-medium text-sm">
                      {format(new Date(job.submittedAt), "d MMM yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(job.submittedAt), "HH:mm")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Files</p>
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{job.files?.length || 0}</span>
                    </div>
                  </div>
                </div>

                {job.deliveryAddress && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Delivery Address</p>
                    <p className="text-sm whitespace-pre-line">{job.deliveryAddress}</p>
                  </div>
                )}

                {/* Desktop: Show notes/files inline. Mobile: Use accordions */}
                <div className="hidden md:block space-y-4">
                  {job.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-sm whitespace-pre-line">{job.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Staff internal notes */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground">Internal Notes</p>
                      {editingNoteJobId !== job.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => { setEditingNoteJobId(job.id); setNoteText(job.staffNotes || ""); }}
                          data-testid={`button-edit-note-${job.id}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {job.staffNotes ? "Edit" : "Add note"}
                        </Button>
                      )}
                    </div>
                    {editingNoteJobId === job.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add an internal note..."
                          className="text-sm"
                          autoResize
                          autoFocus
                          data-testid={`textarea-note-${job.id}`}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingNoteJobId(null)}
                            data-testid={`button-cancel-note-${job.id}`}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => staffNotesMutation.mutate({ jobId: job.id, staffNotes: noteText })}
                            disabled={staffNotesMutation.isPending}
                            data-testid={`button-save-note-${job.id}`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : job.staffNotes ? (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                        <p className="text-sm whitespace-pre-line text-amber-900 dark:text-amber-100">{job.staffNotes}</p>
                      </div>
                    ) : null}
                  </div>

                  <StaffJobFileUpload jobId={job.id} autoMessageOnDownload />
                </div>

                {/* Mobile: Accordion for notes/files */}
                <div className="md:hidden">
                  <Accordion type="multiple" className="space-y-2">
                    {job.notes && (
                      <AccordionItem value="notes" className="border rounded-md px-4">
                        <AccordionTrigger className="text-sm font-medium hover:no-underline">
                          Notes
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="p-3 bg-muted rounded-md">
                            <p className="text-sm whitespace-pre-line">{job.notes}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    <AccordionItem value="internal-notes" className="border rounded-md px-4">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        <span className="flex items-center gap-1.5">
                          <StickyNote className="h-3.5 w-3.5" />
                          Internal Notes {job.staffNotes ? "" : "(none)"}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pb-2">
                        {editingNoteJobId === job.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Add an internal note..."
                              className="text-sm"
                              autoResize
                              data-testid={`textarea-note-mobile-${job.id}`}
                            />
                            <div className="flex gap-2 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setEditingNoteJobId(null)}>Cancel</Button>
                              <Button
                                size="sm"
                                onClick={() => staffNotesMutation.mutate({ jobId: job.id, staffNotes: noteText })}
                                disabled={staffNotesMutation.isPending}
                              >
                                <Check className="h-3 w-3 mr-1" />Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {job.staffNotes && (
                              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                                <p className="text-sm whitespace-pre-line text-amber-900 dark:text-amber-100">{job.staffNotes}</p>
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => { setEditingNoteJobId(job.id); setNoteText(job.staffNotes || ""); }}
                              data-testid={`button-edit-note-mobile-${job.id}`}
                            >
                              <Pencil className="h-3 w-3 mr-1.5" />
                              {job.staffNotes ? "Edit note" : "Add note"}
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="files" className="border rounded-md px-4">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        Files
                      </AccordionTrigger>
                      <AccordionContent>
                        <StaffJobFileUpload jobId={job.id} autoMessageOnDownload />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                {(job.messages?.length || 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    <span>{job.messages?.length} message{job.messages && job.messages.length > 1 ? 's' : ''} from customer</span>
                  </div>
                )}

                {/* Desktop: Show action buttons inline */}
                <div className="hidden md:block space-y-2 pt-2">
                  <Button
                    onClick={() => setLocation(`/staff/job/${job.id}`)}
                    variant="outline"
                    className="w-full"
                    data-testid={`button-view-details-${job.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details & Chat
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(job.id, job.jobName, job.customerId)}
                      className="flex-1"
                      data-testid={`button-approve-${job.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(job.id, job.jobName)}
                      variant="destructive"
                      className="flex-1"
                      data-testid={`button-reject-${job.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>

                {/* Mobile: Show all action buttons inline */}
                <div className="md:hidden space-y-2 pt-2">
                  <Button
                    onClick={() => setLocation(`/staff/job/${job.id}`)}
                    variant="outline"
                    className="w-full"
                    data-testid={`button-view-details-${job.id}`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details & Chat
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(job.id, job.jobName, job.customerId)}
                      className="flex-1"
                      size="sm"
                      data-testid={`button-approve-${job.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(job.id, job.jobName)}
                      variant="destructive"
                      className="flex-1"
                      size="sm"
                      data-testid={`button-reject-${job.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            ))}
            </div>
            )}
          </div>

          {/* Mobile: Sticky action bar - targets currently visible job */}
          {pendingJobs.length > 0 && activeJobId && (() => {
            const activeJob = pendingJobs.find(j => j.id === activeJobId);
            return activeJob ? (
              <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-sm border-t border-primary">
                <div className="p-3 max-w-md mx-auto">
                  <div className="text-xs text-center text-primary-foreground mb-2 truncate font-medium">
                    Active: {activeJob.jobName}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(activeJob.id, activeJob.jobName, activeJob.customerId)}
                      className="flex-1 bg-background text-foreground hover:bg-background/90"
                      size="sm"
                      data-testid="button-approve-sticky"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(activeJob.id, activeJob.jobName)}
                      variant="destructive"
                      className="flex-1"
                      size="sm"
                      data-testid="button-reject-sticky"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                  <div className="text-xs text-center text-primary-foreground/80 mt-2">
                    Scroll to change active job
                  </div>
                </div>
              </div>
            ) : null;
          })()}
        </>
      )}

      {/* Approve Confirmation Dialog */}
      <Dialog
        open={dialogState.type === "approve"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
            setEmbroiderySetups([]);
            setSetupNotRequired(false);
          }
        }}
      >
        <DialogContent className="max-w-md" data-testid="dialog-approve">
          <DialogHeader>
            <DialogTitle>Approve Job</DialogTitle>
            <DialogDescription>
              Approving "{dialogState.jobName}" will move it to the production queue.
            </DialogDescription>
          </DialogHeader>

          {/* Embroidery Set-Up Section */}
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Embroidery Set-Up(s)</p>
              <div className="flex items-center gap-1">
                <Button
                  variant={setupNotRequired ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSetupNotRequired(prev => !prev);
                    setEmbroiderySetups([]);
                  }}
                  data-testid="button-setup-not-required"
                >
                  Not Required
                </Button>
                {!setupNotRequired && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEmbroiderySetups(prev => [...prev, ""])}
                    data-testid="button-add-setup"
                  >
                    + Add Set-Up
                  </Button>
                )}
              </div>
            </div>
            {!setupNotRequired && embroiderySetups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Optional — add any new logo/embroidery set-ups to be created for this job.
              </p>
            )}
            {setupNotRequired && (
              <p className="text-xs text-muted-foreground">
                No embroidery set-up needed for this job.
              </p>
            )}
            {!setupNotRequired && embroiderySetups.map((name, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  placeholder="Set-up name (e.g. Left Chest Logo)"
                  value={name}
                  onChange={(e) => {
                    const updated = [...embroiderySetups];
                    updated[idx] = e.target.value;
                    setEmbroiderySetups(updated);
                  }}
                  data-testid={`input-setup-name-${idx}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEmbroiderySetups(prev => prev.filter((_, i) => i !== idx))}
                  data-testid={`button-remove-setup-${idx}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
                setEmbroiderySetups([]);
                setSetupNotRequired(false);
              }}
              data-testid="button-cancel-approve"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApprove}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? "Approving..." : "Approve Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog
        open={dialogState.type === "reject"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
            setRejectionReason("");
            setRejectionMessage("");
          }
        }}
      >
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>Reject Job</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting "{dialogState.jobName}". The customer will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Rejection Reason *</label>
              <Textarea
                placeholder="e.g., Incomplete information, out of scope, etc."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                autoResize
                data-testid="input-rejection-reason"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Message to Customer (Optional)</label>
              <Textarea
                placeholder="Add any additional context or instructions..."
                value={rejectionMessage}
                onChange={(e) => setRejectionMessage(e.target.value)}
                autoResize
                data-testid="input-rejection-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogState({ type: null, jobId: null, jobName: null, customerId: null });
                setRejectionReason("");
                setRejectionMessage("");
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-opened after approval so staff can fill in production details immediately */}
      <JobEditDialog
        open={editingJob !== null}
        onOpenChange={(open) => !open && setEditingJob(null)}
        job={editingJob ? {
          ...editingJob,
          goodsReceived: editingJob.goodsReceived ? new Date(editingJob.goodsReceived) : null,
          requiredDispatchDate: editingJob.requiredDispatchDate ? new Date(editingJob.requiredDispatchDate) : null,
        } : null}
        customers={activeCustomers}
        staff={staff}
        onSubmit={(id, data) => updateJobMutation.mutate({ id, data })}
      />

    </div>
  );
}

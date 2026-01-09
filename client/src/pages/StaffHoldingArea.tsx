import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Clock, FileText, MessageSquare, Package, CheckCircle, XCircle, Calendar, Eye, Upload } from "lucide-react";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { StaffJobFileUpload } from "@/components/StaffJobFileUpload";

type Job = {
  id: string;
  jobName: string;
  customerName: string;
  poNumber: string | null;
  quantity: number;
  requiredDispatchDate: string | null;
  notes: string | null;
  deliveryAddress: string | null;
  submittedAt: string;
  files?: { id: string; fileName: string; fileSize: number }[];
  messages?: { id: string; senderType: string; message: string; createdAt: string }[];
};

type DialogState = {
  type: "approve" | "reject" | null;
  jobId: string | null;
  jobName: string | null;
};

export default function StaffHoldingArea() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogState, setDialogState] = useState<DialogState>({ type: null, jobId: null, jobName: null });
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const previousMessageCountsRef = useRef<Record<string, number>>({});
  const isInitialLoadRef = useRef<boolean>(true);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: pendingJobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/staff/jobs/pending"],
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

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
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/approve`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Job approved",
        description: "The job has been approved and moved to production",
      });
      setDialogState({ type: null, jobId: null, jobName: null });
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
      setDialogState({ type: null, jobId: null, jobName: null });
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

  const handleApprove = (jobId: string, jobName: string) => {
    setDialogState({ type: "approve", jobId, jobName });
  };

  const handleReject = (jobId: string, jobName: string) => {
    setDialogState({ type: "reject", jobId, jobName });
  };

  const confirmApprove = () => {
    if (dialogState.jobId) {
      approveMutation.mutate(dialogState.jobId);
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
      <div className="px-4 py-4 md:py-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Customer Job Submissions</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve customer job requests ({pendingJobs.length} pending)
        </p>
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
          <div className="px-4 pb-24 md:pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingJobs.map((job, index) => (
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
                  <Badge variant="secondary" className="flex-shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
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
                      {format(new Date(job.submittedAt), "MMM d, yyyy")}
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

                  <StaffJobFileUpload jobId={job.id} />
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

                    <AccordionItem value="files" className="border rounded-md px-4">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        Files
                      </AccordionTrigger>
                      <AccordionContent>
                        <StaffJobFileUpload jobId={job.id} />
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
                      onClick={() => handleApprove(job.id, job.jobName)}
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
                      onClick={() => handleApprove(job.id, job.jobName)}
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
                      onClick={() => handleApprove(activeJob.id, activeJob.jobName)}
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
        onOpenChange={(open) => !open && setDialogState({ type: null, jobId: null, jobName: null })}
      >
        <DialogContent data-testid="dialog-approve">
          <DialogHeader>
            <DialogTitle>Approve Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve "{dialogState.jobName}"? This will move it to the production queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogState({ type: null, jobId: null, jobName: null })}
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
            setDialogState({ type: null, jobId: null, jobName: null });
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
                rows={3}
                data-testid="input-rejection-reason"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Message to Customer (Optional)</label>
              <Textarea
                placeholder="Add any additional context or instructions..."
                value={rejectionMessage}
                onChange={(e) => setRejectionMessage(e.target.value)}
                rows={3}
                data-testid="input-rejection-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogState({ type: null, jobId: null, jobName: null });
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
    </div>
  );
}

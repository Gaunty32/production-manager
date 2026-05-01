import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Send, FileText, MessageSquare, CheckCircle, XCircle, Clock, Edit2, Save, Users, X } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Job = {
  id: string;
  jobName: string;
  poNumber: string | null;
  quantity: number;
  requiredDispatchDate: string | null;
  notes: string | null;
  status: string;
  deliveryAddress: string | null;
  submittedAt: string;
  customerId: string;
};

type JobFile = {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
};

type JobMessage = {
  id: string;
  senderType: "customer" | "staff";
  senderName: string | null;
  message: string;
  createdAt: string;
};

type Customer = {
  id: string;
  name: string;
  address: string | null;
};

type StaffMember = {
  id: string;
  name: string;
  email: string | null;
};

export default function StaffJobDetail() {
  const [, params] = useRoute("/staff/job/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const [ccStaffIds, setCcStaffIds] = useState<string[]>([]);
  const [showCcPicker, setShowCcPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [embroiderySetups, setEmbroiderySetups] = useState<string[]>([]);
  const [setupNotRequired, setSetupNotRequired] = useState(false);
  const previousCustomerMessageCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [editedJob, setEditedJob] = useState({
    jobName: "",
    poNumber: "",
    quantity: 1,
    requiredDispatchDate: "",
    notes: "",
    deliveryAddress: "",
  });

  const jobId = params?.id;

  const { data: job, isLoading: isLoadingJob } = useQuery<Job>({
    queryKey: [`/api/jobs/${jobId}`],
    enabled: !!jobId,
  });

  const { data: files = [], isLoading: isLoadingFiles } = useQuery<JobFile[]>({
    queryKey: [`/api/jobs/${jobId}/files`],
    enabled: !!jobId,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<JobMessage[]>({
    queryKey: [`/api/staff/jobs/${jobId}/messages`],
    enabled: !!jobId,
    refetchInterval: 3000,
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: [`/api/customers/${job?.customerId}`],
    enabled: !!job?.customerId,
  });

  const { data: allStaff = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
  });

  // Initialize edit form when job loads
  useEffect(() => {
    if (job) {
      setEditedJob({
        jobName: job.jobName || "",
        poNumber: job.poNumber || "",
        quantity: job.quantity || 1,
        requiredDispatchDate: job.requiredDispatchDate
          ? format(new Date(job.requiredDispatchDate), "yyyy-MM-dd")
          : "",
        notes: job.notes || "",
        deliveryAddress: job.deliveryAddress || "",
      });
    }
  }, [job]);

  // Show popup notification when new customer messages arrive
  useEffect(() => {
    if (isLoadingMessages) return;

    const customerMessages = messages.filter(m => m.senderType === "customer");
    const currentCustomerMessageCount = customerMessages.length;

    if (!isInitialLoadRef.current && currentCustomerMessageCount > previousCustomerMessageCountRef.current) {
      const newCount = currentCustomerMessageCount - previousCustomerMessageCountRef.current;
      toast({
        title: "New customer message",
        description: `${newCount} new message${newCount > 1 ? 's' : ''} received`,
      });
    }

    previousCustomerMessageCountRef.current = currentCustomerMessageCount;
    isInitialLoadRef.current = false;
  }, [messages, isLoadingMessages, toast]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, ccIds }: { message: string; ccIds: string[] }) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/messages`, { message, ccStaffIds: ccIds });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
      setNewMessage("");
      setCcStaffIds([]);
      setShowCcPicker(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: async (data: typeof editedJob) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}`, {
        jobName: data.jobName,
        poNumber: data.poNumber || null,
        quantity: Number(data.quantity),
        requiredDispatchDate: data.requiredDispatchDate ? new Date(data.requiredDispatchDate).toISOString() : null,
        notes: data.notes || null,
        deliveryAddress: data.deliveryAddress || null,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      toast({
        title: "Job updated",
        description: "The job details have been saved",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update job",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (setupNames: string[]) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/approve`, {});
      const result = await res.json();
      // Create any embroidery set-ups
      for (const name of setupNames.filter(n => n.trim())) {
        await apiRequest("POST", "/api/logo-setups", {
          customerId: job?.customerId,
          jobName: name.trim(),
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/logo-setups"] });
      toast({
        title: "Job approved",
        description: "The job has been approved and moved to production",
      });
      setLocation("/holding-area");
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
    mutationFn: async ({ reason, message }: { reason: string; message?: string }) => {
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
      setLocation("/holding-area");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject job",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (newMessage.trim() && jobId) {
      sendMessageMutation.mutate({ message: newMessage.trim(), ccIds: ccStaffIds });
    }
  };

  const toggleCcStaff = (staffId: string) => {
    setCcStaffIds(prev =>
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    );
  };

  const handleSaveEdit = () => {
    if (!editedJob.jobName.trim()) {
      toast({
        title: "Validation error",
        description: "Job name is required",
        variant: "destructive",
      });
      return;
    }
    updateJobMutation.mutate(editedJob);
  };

  const handleCancelEdit = () => {
    if (job) {
      setEditedJob({
        jobName: job.jobName || "",
        poNumber: job.poNumber || "",
        quantity: job.quantity || 1,
        requiredDispatchDate: job.requiredDispatchDate
          ? format(new Date(job.requiredDispatchDate), "yyyy-MM-dd")
          : "",
        notes: job.notes || "",
        deliveryAddress: job.deliveryAddress || "",
      });
    }
    setIsEditing(false);
  };

  const confirmApprove = () => {
    approveMutation.mutate(embroiderySetups);
    setShowApproveDialog(false);
    setEmbroiderySetups([]);
    setSetupNotRequired(false);
  };

  const confirmReject = () => {
    if (rejectionReason.trim()) {
      rejectMutation.mutate({
        reason: rejectionReason,
        message: rejectionMessage.trim() || undefined,
      });
      setShowRejectDialog(false);
    }
  };

  if (isLoadingJob) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  const isPending = job.status === "pending_customer_approval";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/holding-area")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{job?.jobName || "Job Details"}</h1>
                {customer ? (
                  <p className="text-sm text-muted-foreground">{customer.name}</p>
                ) : job?.customerId ? (
                  <p className="text-sm text-muted-foreground text-muted-foreground/50">Loading customer...</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPending && !isEditing && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              {isPending && isEditing && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={updateJobMutation.isPending}
                    data-testid="button-save"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateJobMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Job Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Job Information</CardTitle>
                  {isPending ? (
                    <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  ) : (
                    <Badge variant="default">
                      {job.status}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Job Name *</label>
                      <Input
                        value={editedJob.jobName}
                        onChange={(e) => setEditedJob({ ...editedJob, jobName: e.target.value })}
                        placeholder="Job name"
                        data-testid="input-edit-job-name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">PO Number</label>
                      <Input
                        value={editedJob.poNumber}
                        onChange={(e) => setEditedJob({ ...editedJob, poNumber: e.target.value })}
                        placeholder="PO number"
                        data-testid="input-edit-po-number"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Quantity *</label>
                      <Input
                        type="number"
                        min={1}
                        value={editedJob.quantity}
                        onChange={(e) => setEditedJob({ ...editedJob, quantity: Number(e.target.value) })}
                        data-testid="input-edit-quantity"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Required Dispatch Date *</label>
                      <Input
                        type="date"
                        value={editedJob.requiredDispatchDate}
                        onChange={(e) => setEditedJob({ ...editedJob, requiredDispatchDate: e.target.value })}
                        data-testid="input-edit-dispatch-date"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Delivery Address</label>
                      <Textarea
                        value={editedJob.deliveryAddress}
                        onChange={(e) => setEditedJob({ ...editedJob, deliveryAddress: e.target.value })}
                        rows={3}
                        placeholder="Delivery address"
                        data-testid="input-edit-delivery-address"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Notes</label>
                      <Textarea
                        value={editedJob.notes}
                        onChange={(e) => setEditedJob({ ...editedJob, notes: e.target.value })}
                        autoResize
                        placeholder="Notes"
                        data-testid="input-edit-notes"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Job Name</p>
                      <p className="font-medium" data-testid="text-job-name">{job.jobName}</p>
                    </div>
                    {job.poNumber && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">PO Number</p>
                        <p className="font-medium">{job.poNumber}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Quantity</p>
                        <p className="font-medium">{job.quantity}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Required Date</p>
                        <p className="font-medium">
                          {job.requiredDispatchDate
                            ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                            : "Not set"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Submitted</p>
                      <p className="font-medium">
                        {format(new Date(job.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    {job.deliveryAddress && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Delivery Address</p>
                        <p className="text-sm whitespace-pre-line">{job.deliveryAddress}</p>
                      </div>
                    )}
                    {job.notes && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Notes</p>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-line">{job.notes}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Files */}
            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attached Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 bg-muted rounded-md"
                      data-testid={`file-${file.fileName}`}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(file.fileSize / 1024)} KB
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Approval Actions */}
            {isPending && !isEditing && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={() => setShowApproveDialog(true)}
                    className="w-full"
                    size="lg"
                    data-testid="button-approve"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Approve Job
                  </Button>
                  <Button
                    onClick={() => setShowRejectDialog(true)}
                    variant="destructive"
                    className="w-full"
                    size="lg"
                    data-testid="button-reject"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    Reject Job
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Messaging */}
          <div>
            <Card className="h-[calc(100vh-12rem)] flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Conversation with Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0 p-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {isLoadingMessages ? (
                    <p className="text-center text-muted-foreground text-sm">Loading messages...</p>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm">No messages yet</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderType === "staff" ? "justify-end" : "justify-start"}`}
                        data-testid={`message-${msg.id}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg p-3 ${
                            msg.senderType === "staff"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                          <p
                            className={`text-xs mt-1 ${
                              msg.senderType === "staff"
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                            {msg.senderName && ` • ${msg.senderName}`}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="border-t p-4 space-y-2">
                  {/* CC bar — shown when CC picker is open or CC'd members are selected */}
                  {(showCcPicker || ccStaffIds.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 min-h-8">
                      <span className="text-xs text-muted-foreground shrink-0">CC:</span>
                      {ccStaffIds.map(id => {
                        const s = allStaff.find(m => m.id === id);
                        return s ? (
                          <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                            {s.name}
                            <button
                              onClick={() => toggleCcStaff(id)}
                              className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                              data-testid={`button-remove-cc-${id}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ) : null;
                      })}
                      <Popover open={showCcPicker} onOpenChange={setShowCcPicker}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="button-add-cc">
                            + Add
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1" align="start">
                          {allStaff.filter(s => s.email).length === 0 ? (
                            <p className="text-xs text-muted-foreground p-2">No staff with email found</p>
                          ) : (
                            allStaff.filter(s => s.email).map(s => (
                              <button
                                key={s.id}
                                onClick={() => toggleCcStaff(s.id)}
                                className="w-full text-left px-2 py-1.5 text-sm rounded hover-elevate flex items-center justify-between gap-2"
                                data-testid={`button-cc-staff-${s.id}`}
                              >
                                <span>{s.name}</span>
                                {ccStaffIds.includes(s.id) && (
                                  <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                              </button>
                            ))
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your message to the customer..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={2}
                      className="resize-none"
                      data-testid="input-message"
                    />
                    <div className="flex flex-col gap-1 self-end">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowCcPicker(prev => !prev)}
                        title="CC colleagues"
                        className={ccStaffIds.length > 0 ? "border-primary" : ""}
                        data-testid="button-toggle-cc"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                        size="icon"
                        data-testid="button-send-message"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    This message will be sent to the customer.{ccStaffIds.length > 0 && ` ${ccStaffIds.length} colleague${ccStaffIds.length > 1 ? 's' : ''} will be CC'd.`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={(open) => {
        if (!open) { setShowApproveDialog(false); setEmbroiderySetups([]); setSetupNotRequired(false); }
      }}>
        <DialogContent className="max-w-md" data-testid="dialog-approve">
          <DialogHeader>
            <DialogTitle>Approve Job</DialogTitle>
            <DialogDescription>
              Approving "{job.jobName}" will move it to the production queue.
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
              onClick={() => { setShowApproveDialog(false); setEmbroiderySetups([]); setSetupNotRequired(false); }}
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

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>Reject Job</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting "{job.jobName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Reason *</label>
              <Input
                placeholder="e.g., Insufficient information"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                data-testid="input-rejection-reason"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Additional Message (Optional)</label>
              <Textarea
                placeholder="Add any additional details for the customer..."
                value={rejectionMessage}
                onChange={(e) => setRejectionMessage(e.target.value)}
                rows={4}
                data-testid="input-rejection-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
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

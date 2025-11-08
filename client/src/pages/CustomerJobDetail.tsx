import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Send, FileText, Package, Calendar, MessageSquare, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

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
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
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
  message: string;
  createdAt: string;
};

export default function CustomerJobDetail() {
  const [, params] = useRoute("/customer/job/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");

  const jobId = params?.id;

  const { data: job, isLoading: isLoadingJob } = useQuery<Job>({
    queryKey: [`/api/customer-portal/jobs/${jobId}`],
    enabled: !!jobId,
  });

  const { data: files = [], isLoading: isLoadingFiles } = useQuery<JobFile[]>({
    queryKey: [`/api/customer-portal/jobs/${jobId}/files`],
    enabled: !!jobId,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<JobMessage[]>({
    queryKey: [`/api/customer-portal/jobs/${jobId}/messages`],
    enabled: !!jobId,
    refetchInterval: 3000, // Poll every 3 seconds for real-time chat
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/customer-portal/jobs/${jobId}/messages`, {
        message,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer-portal/jobs/${jobId}/messages`] });
      setNewMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been sent to staff",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate(newMessage);
  };

  const getStatusBadge = () => {
    if (!job) return null;

    switch (job.status) {
      case "pending_customer_approval":
        return (
          <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case "production":
        return (
          <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved - In Production
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoadingJob || isLoadingFiles || isLoadingMessages) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/customer/pending")}
              data-testid="button-back-to-pending"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-job-name">
                {job.jobName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Job Details & Communication
              </p>
            </div>
            {getStatusBadge()}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Job Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Job Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Quantity</p>
                    <p className="font-medium">{job.quantity}</p>
                  </div>
                  {job.poNumber && (
                    <div>
                      <p className="text-sm text-muted-foreground">PO Number</p>
                      <p className="font-medium">{job.poNumber}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Required Date</p>
                    <p className="font-medium">
                      {job.requiredDispatchDate
                        ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Submitted</p>
                    <p className="font-medium">
                      {format(new Date(job.submittedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  {job.approvedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Approved</p>
                      <p className="font-medium text-green-600">
                        {format(new Date(job.approvedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  )}
                  {job.rejectedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Rejected</p>
                      <p className="font-medium text-red-600">
                        {format(new Date(job.rejectedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  )}
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

                {job.rejectionReason && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Rejection Reason</p>
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                      <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-line">
                        {job.rejectionReason}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Files */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Attached Files ({files.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files attached</p>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-md"
                        data-testid={`file-${file.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(file.fileSize / 1024)} KB • Uploaded{" "}
                              {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chat */}
          <div className="lg:col-span-1">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No messages yet. Start a conversation with staff.
                  </p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderType === "customer" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.senderType === "customer"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-line">{message.message}</p>
                        <p
                          className={`text-xs mt-1 ${
                            message.senderType === "customer"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {message.senderType === "staff" ? "Staff • " : "You • "}
                          {format(new Date(message.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={2}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    size="icon"
                    data-testid="button-send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

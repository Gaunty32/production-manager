import { goBack } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, FileText, MessageSquare, XCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

type Job = {
  id: string;
  jobName: string;
  poNumber: string | null;
  quantity: number;
  requiredDispatchDate: string | null;
  notes: string | null;
  status: string;
  submittedAt: string;
  files?: { id: string; fileName: string }[];
  messages?: { id: string }[];
};

type CustomerUser = {
  email: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

export default function CustomerPendingJobs() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();
  const { toast } = useToast();
  const [jobToCancel, setJobToCancel] = useState<Job | null>(null);

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: pendingJobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/customer-portal/jobs/pending"],
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/customer-portal/jobs/${jobId}/cancel`, {});
      return response.json();
    },
    onSuccess: () => {
      setJobToCancel(null);
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs"] });
      toast({
        title: "Submission cancelled",
        description: "The submission has been removed from your pending list.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to cancel submission",
        description: error.message || "Please refresh and try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation Banner - only shown when staff is viewing as customer */}
      {isImpersonating && customerUser && (
        <ImpersonationBanner customerEmail={customerUser.email} />
      )}
      
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          {/* Customer Logo - Top Center */}
          {customerUser?.customerLogoUrl && (
            <div className="flex justify-center mb-4">
              <img 
                src={customerUser.customerLogoUrl} 
                alt={customerUser.customerName || "Customer logo"}
                className="max-h-16 max-w-[200px] object-contain"
                data-testid="img-customer-logo"
              />
            </div>
          )}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => goBack("/customer/dashboard", setLocation)}
              data-testid="button-back-to-dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pending Submissions</h1>
              <p className="text-sm text-muted-foreground">
                Jobs awaiting staff review
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {pendingJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No pending submissions
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/customer/submit")}
                data-testid="button-submit-first"
              >
                Submit Your First Job
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingJobs.map((job) => (
              <Card
                key={job.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setLocation(`/customer/job/${job.id}`)}
                data-testid={`card-job-${job.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1" data-testid={`text-jobname-${job.id}`}>
                        {job.jobName}
                      </CardTitle>
                      {job.poNumber && (
                        <p className="text-sm text-muted-foreground">
                          PO: {job.poNumber}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Pending Review
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
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

                  {job.notes && (
                    <div className="mt-3 p-3 bg-muted rounded-md">
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{job.notes}</p>
                    </div>
                  )}

                  {(job.messages?.length || 0) > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                      <span>{job.messages?.length} message{job.messages && job.messages.length > 1 ? 's' : ''}</span>
                    </div>
                  )}

                  {!isImpersonating && (
                    <div className="mt-5 flex justify-end border-t pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setJobToCancel(job);
                        }}
                        data-testid={`button-cancel-job-${job.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel submission
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog
        open={!!jobToCancel}
        onOpenChange={(open) => {
          if (!open && !cancelMutation.isPending) setJobToCancel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel <strong>{jobToCancel?.jobName}</strong> before it is reviewed by our team.
              The submission and its uploaded files will be kept in our records, but it will no longer be processed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep submission</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (jobToCancel) cancelMutation.mutate(jobToCancel.id);
              }}
              data-testid="button-confirm-cancel-job"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel submission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

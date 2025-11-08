import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, FileText, MessageSquare, Package } from "lucide-react";
import { format } from "date-fns";

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

export default function CustomerPendingJobs() {
  const [, setLocation] = useLocation();

  const { data: pendingJobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ["/api/customer-portal/jobs/pending"],
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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/customer/dashboard")}
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

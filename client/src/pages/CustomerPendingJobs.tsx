import { goBack } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerJobEditSchema, type CustomerJobEdit } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, FileText, MessageSquare, Package, Pencil } from "lucide-react";
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
  deliveryAddress?: string | null;
  status: string;
  submittedAt: string;
  files?: { id: string; fileName: string }[];
  messages?: { id: string }[];
};

function EditSubmissionDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { toast } = useToast();

  const form = useForm<CustomerJobEdit>({
    resolver: zodResolver(customerJobEditSchema),
    defaultValues: {
      jobName: job.jobName,
      poNumber: job.poNumber ?? "",
      quantity: job.quantity || undefined,
      notes: job.notes ?? "",
      deliveryAddress: job.deliveryAddress ?? "",
      requiredDispatchDate: job.requiredDispatchDate
        ? job.requiredDispatchDate.slice(0, 10)
        : "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CustomerJobEdit) => {
      const res = await apiRequest("PATCH", `/api/customer-portal/jobs/${job.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: [`/api/customer-portal/jobs/${job.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs", job.id] });
      toast({ title: "Order updated", description: "Your changes have been saved." });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save changes",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="jobName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-jobname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO number (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-po" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? null : Number(e.target.value))
                        }
                        data-testid="input-edit-quantity"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="requiredDispatchDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required despatch date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-edit-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deliveryAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery address</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} data-testid="input-edit-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} data-testid="input-edit-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-edit-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-edit-save"
              >
                {saveMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type CustomerUser = {
  email: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

export default function CustomerPendingJobs() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Pending Review
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingJob(job);
                        }}
                        data-testid={`button-edit-${job.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
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

      {editingJob && (
        <EditSubmissionDialog job={editingJob} onClose={() => setEditingJob(null)} />
      )}
    </div>
  );
}

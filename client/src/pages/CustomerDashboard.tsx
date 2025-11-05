import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { LogOut, Package, Clock, CheckCircle2, AlertCircle, Circle, CircleCheck, CircleX } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { getMachineName } from "@shared/machines";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LineItem = {
  id: string;
  jobId: string;
  jobType: string;
  quantity: number;
  description: string | null;
  machineId: number | null;
  completed: boolean;
  logoApproved: boolean;
};

type Job = {
  id: string;
  customerId: string;
  jobName: string;
  poNumber: string | null;
  quantity: number;
  goodsReceived: string | null;
  requiredDispatchDate: string | null;
  completed: boolean;
  status: string;
  notes: string | null;
  invoiceStatus: string;
  lineItems: LineItem[];
};

type CustomerUser = {
  id: string;
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("in_progress");

  const { data: customerUser, isLoading: isLoadingUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: jobs = [], isLoading: isLoadingJobs } = useQuery<Job[]>({
    queryKey: ["/api/customer-portal/jobs"],
    enabled: !!customerUser,
  });

  // Sort jobs by required dispatch date (oldest first) and filter by status
  const filteredJobs = jobs
    .filter(job => {
      if (statusFilter === "all") return true;
      if (statusFilter === "completed") return job.completed;
      if (statusFilter === "in_progress") return !job.completed;
      return true;
    })
    .sort((a, b) => {
      // Sort by required dispatch date ascending (oldest first)
      // Jobs without dates go to the end
      if (!a.requiredDispatchDate && !b.requiredDispatchDate) return 0;
      if (!a.requiredDispatchDate) return 1;
      if (!b.requiredDispatchDate) return -1;
      return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
    });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/customer-auth/logout", {});
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/customer/login");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getStatusBadge = (job: Job) => {
    if (job.completed) {
      return (
        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    const isOverdue = job.requiredDispatchDate && isPast(new Date(job.requiredDispatchDate)) && !isToday(new Date(job.requiredDispatchDate));
    const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));

    if (isOverdue) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Overdue
        </Badge>
      );
    }

    if (isDueToday) {
      return (
        <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
          <Clock className="h-3 w-3 mr-1" />
          Due Today
        </Badge>
      );
    }

    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        In Progress
      </Badge>
    );
  };

  if (isLoadingUser || isLoadingJobs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Customer Portal</h1>
              <p className="text-sm text-muted-foreground">
                Welcome{customerUser?.firstName ? `, ${customerUser.firstName}` : ""}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Production Queue</h2>
            <p className="text-sm text-muted-foreground">
              View the status and progress of your orders in production
            </p>
          </div>
          
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
            <TabsList data-testid="tabs-status-filter">
              <TabsTrigger value="in_progress" data-testid="tab-in-progress">
                In Progress
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">
                All Orders
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {jobs.length === 0 ? "No orders found" : `No ${statusFilter.replace('_', ' ')} orders`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Name</TableHead>
                    <TableHead>Item Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-center">Goods Rcvd</TableHead>
                    <TableHead className="text-center">Logo</TableHead>
                    <TableHead>Date Required</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const lineItems = job.lineItems || [];
                    
                    if (lineItems.length === 0) {
                      // Show job even if no line items
                      return (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="font-medium" data-testid={`text-jobname-${job.id}`}>
                            {job.jobName}
                            {job.poNumber && (
                              <span className="text-xs text-muted-foreground ml-2">
                                (PO: {job.poNumber})
                              </span>
                            )}
                            {job.notes && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Note: {job.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-right">{job.quantity}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell className="text-center">
                            {job.goodsReceived ? (
                              <CircleCheck className="h-4 w-4 text-green-600 inline" data-testid={`icon-goods-received-${job.id}`} />
                            ) : (
                              <CircleX className="h-4 w-4 text-red-600 inline" data-testid={`icon-goods-not-received-${job.id}`} />
                            )}
                          </TableCell>
                          <TableCell className="text-center">—</TableCell>
                          <TableCell data-testid={`text-dispatch-${job.id}`}>
                            {job.requiredDispatchDate
                              ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                              : "Not set"}
                          </TableCell>
                          <TableCell>{getStatusBadge(job)}</TableCell>
                        </TableRow>
                      );
                    }
                    
                    // Show one row per line item
                    return lineItems.map((lineItem, index) => (
                      <TableRow
                        key={lineItem.id}
                        data-testid={`row-lineitem-${lineItem.id}`}
                        className={index > 0 ? "border-t-0" : ""}
                      >
                        <TableCell className="font-medium">
                          {index === 0 && (
                            <>
                              <span data-testid={`text-jobname-${job.id}`}>{job.jobName}</span>
                              {job.poNumber && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  (PO: {job.poNumber})
                                </span>
                              )}
                              {job.notes && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Note: {job.notes}
                                </div>
                              )}
                            </>
                          )}
                          {index > 0 && (
                            <span className="text-muted-foreground text-sm ml-4">↳</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{lineItem.jobType}</div>
                            {lineItem.description && (
                              <div className="text-xs text-muted-foreground">
                                {lineItem.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{lineItem.quantity}</TableCell>
                        <TableCell data-testid={`text-machine-${lineItem.id}`}>
                          {getMachineName(lineItem.machineId)}
                        </TableCell>
                        <TableCell className="text-center">
                          {index === 0 && (
                            job.goodsReceived ? (
                              <CircleCheck className="h-4 w-4 text-green-600 inline" data-testid={`icon-goods-received-${job.id}`} />
                            ) : (
                              <CircleX className="h-4 w-4 text-red-600 inline" data-testid={`icon-goods-not-received-${job.id}`} />
                            )
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {lineItem.logoApproved ? (
                            <CircleCheck className="h-4 w-4 text-green-600 inline" data-testid={`icon-logo-approved-${lineItem.id}`} />
                          ) : (
                            <CircleX className="h-4 w-4 text-amber-600 inline" data-testid={`icon-logo-not-approved-${lineItem.id}`} />
                          )}
                        </TableCell>
                        <TableCell>
                          {index === 0 && job.requiredDispatchDate && (
                            <span data-testid={`text-dispatch-${job.id}`}>
                              {format(new Date(job.requiredDispatchDate), "MMM d, yyyy")}
                            </span>
                          )}
                          {index === 0 && !job.requiredDispatchDate && (
                            <span className="text-muted-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {index === 0 && getStatusBadge(job)}
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

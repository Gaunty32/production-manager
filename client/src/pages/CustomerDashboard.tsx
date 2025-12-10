import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { LogOut, Package, Clock, CheckCircle2, AlertCircle, Circle, CircleCheck, CircleX, Plus, FileText, Search, ArrowUpDown, PoundSterling, Key } from "lucide-react";
import { PricingTableDialog } from "@/components/PricingTableDialog";
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
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

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
  dhlTrackingNumber: string | null;
  lineItems: LineItem[];
};

type CustomerUser = {
  id: string;
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
};

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("in_progress");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "jobName" | "quantity">("date");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiRequest("POST", "/api/customer-auth/change-password", data);
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully",
      });
      setChangePasswordOpen(false);
      changePasswordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = (values: z.infer<typeof changePasswordSchema>) => {
    changePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  };

  const { data: customerUser, isLoading: isLoadingUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: jobs = [], isLoading: isLoadingJobs } = useQuery<Job[]>({
    queryKey: ["/api/customer-portal/jobs"],
    enabled: !!customerUser,
  });

  // Filter by status and search term, then sort
  const filteredJobs = jobs
    .filter(job => {
      // Status filter
      if (statusFilter === "completed" && !job.completed) return false;
      if (statusFilter === "in_progress" && job.completed) return false;
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const jobNameMatch = job.jobName.toLowerCase().includes(searchLower);
        const poNumberMatch = (job.poNumber ?? "").toLowerCase().includes(searchLower);
        const descriptionMatch = job.lineItems?.some(item => 
          (item.description ?? "").toLowerCase().includes(searchLower)
        ) || false;
        const notesMatch = (job.notes ?? "").toLowerCase().includes(searchLower);
        
        return jobNameMatch || poNumberMatch || descriptionMatch || notesMatch;
      }
      
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "jobName":
          return a.jobName.localeCompare(b.jobName);
        
        case "quantity":
          // Sum quantities from line items
          const aQty = a.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || a.quantity;
          const bQty = b.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || b.quantity;
          return bQty - aQty; // Descending (largest first)
        
        case "date":
        default:
          // Sort by required dispatch date ascending (oldest first)
          if (!a.requiredDispatchDate && !b.requiredDispatchDate) return 0;
          if (!a.requiredDispatchDate) return 1;
          if (!b.requiredDispatchDate) return -1;
          return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
      }
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
      {/* Impersonation Banner - only shown when staff is viewing as customer */}
      {isImpersonating && customerUser && (
        <ImpersonationBanner customerEmail={customerUser.email} />
      )}
      
      {/* Header */}
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Customer Portal</h1>
              <p className="text-sm text-muted-foreground">
                Welcome{customerUser?.firstName ? `, ${customerUser.firstName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PricingTableDialog />
              <Button
                variant="outline"
                onClick={() => setChangePasswordOpen(true)}
                data-testid="button-change-password"
              >
                <Key className="h-4 w-4 mr-2" />
                Change Password
              </Button>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setLocation("/customer/submit")}
              data-testid="button-submit-job"
            >
              <Plus className="h-4 w-4 mr-2" />
              Submit New Job
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/pending")}
              data-testid="button-view-pending"
            >
              <FileText className="h-4 w-4 mr-2" />
              Pending Submissions
            </Button>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Production Queue</h2>
            <p className="text-sm text-muted-foreground">
              View the status and progress of your orders in production
            </p>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-sort">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date" data-testid="sort-date">Production Date</SelectItem>
                  <SelectItem value="jobName" data-testid="sort-jobname">Job Name</SelectItem>
                  <SelectItem value="quantity" data-testid="sort-quantity">Quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Status Tabs */}
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
          <>
            {/* Mobile Card Layout - Hidden on md and above */}
            <div className="md:hidden space-y-4">
              {filteredJobs.map((job) => {
                const lineItems = job.lineItems || [];
                
                return (
                  <Card key={job.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{job.jobName}</CardTitle>
                      {job.poNumber && (
                        <p className="text-sm text-muted-foreground">PO: {job.poNumber}</p>
                      )}
                      {job.notes && (
                        <p className="text-sm text-muted-foreground mt-1">Note: {job.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {getStatusBadge(job)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Job-level info */}
                      <div className="grid grid-cols-2 gap-3 pb-3 border-b">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Production Date</p>
                          <p className="text-sm font-medium">
                            {job.requiredDispatchDate
                              ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                              : "Not set"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Goods Received</p>
                          <div className="flex items-center gap-1">
                            {job.goodsReceived ? (
                              <>
                                <CircleCheck className="h-4 w-4 text-green-600" />
                                <span className="text-sm">Yes</span>
                              </>
                            ) : (
                              <>
                                <CircleX className="h-4 w-4 text-red-600" />
                                <span className="text-sm">No</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Tracking Info for Completed Jobs */}
                      {job.completed && job.dhlTrackingNumber && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">DHL Tracking Number</p>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={`https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(job.dhlTrackingNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono font-semibold text-primary hover:underline"
                              data-testid={`link-tracking-mobile-${job.id}`}
                            >
                              {job.dhlTrackingNumber}
                            </a>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(job.dhlTrackingNumber || "");
                                toast({
                                  title: "Copied!",
                                  description: "Tracking number copied to clipboard",
                                });
                              }}
                              data-testid={`button-copy-tracking-${job.id}`}
                            >
                              <span className="text-xs">Copy</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Line Items */}
                      {lineItems.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold">Line Items:</p>
                          {lineItems.map((lineItem, index) => (
                            <div key={lineItem.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{lineItem.jobType}</p>
                                  {lineItem.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {lineItem.description}
                                    </p>
                                  )}
                                </div>
                                <p className="text-sm font-semibold ml-2">Qty: {lineItem.quantity}</p>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <div className="flex items-center gap-1">
                                  {lineItem.logoApproved ? (
                                    <>
                                      <CircleCheck className="h-3.5 w-3.5 text-green-600" />
                                      <span className="text-xs">Logo OK</span>
                                    </>
                                  ) : (
                                    <>
                                      <CircleX className="h-3.5 w-3.5 text-amber-600" />
                                      <span className="text-xs">Logo Pending</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Quantity: {job.quantity}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table Layout - Hidden on mobile, shown on md and above */}
            <Card className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Name</TableHead>
                    <TableHead>Item Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-center">Goods Received</TableHead>
                    <TableHead className="text-center">Logo Approved</TableHead>
                    <TableHead>Production Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tracking</TableHead>
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
                          <TableCell>
                            {job.completed && job.dhlTrackingNumber ? (
                              <a
                                href={`https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(job.dhlTrackingNumber)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-primary hover:underline"
                                data-testid={`link-tracking-${job.id}`}
                              >
                                {job.dhlTrackingNumber}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
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
                          <span data-testid={`text-jobname-${job.id}-${index}`}>{job.jobName}</span>
                          {index === 0 && job.poNumber && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (PO: {job.poNumber})
                            </span>
                          )}
                          {index === 0 && job.notes && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Note: {job.notes}
                            </div>
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
                        <TableCell className="text-center">
                          {job.goodsReceived ? (
                            <CircleCheck className="h-4 w-4 text-green-600 inline" data-testid={`icon-goods-received-${job.id}-${index}`} />
                          ) : (
                            <CircleX className="h-4 w-4 text-red-600 inline" data-testid={`icon-goods-not-received-${job.id}-${index}`} />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {lineItem.logoApproved ? (
                            <CircleCheck className="h-4 w-4 text-green-600 inline" data-testid={`icon-logo-approved-${lineItem.id}`} />
                          ) : (
                            <CircleX className="h-4 w-4 text-amber-600 inline" data-testid={`icon-logo-not-approved-${lineItem.id}`} />
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-dispatch-${job.id}-${index}`}>
                          {job.requiredDispatchDate
                            ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                            : <span className="text-muted-foreground">Not set</span>
                          }
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(job)}
                        </TableCell>
                        <TableCell>
                          {index === 0 && job.completed && job.dhlTrackingNumber ? (
                            <a
                              href={`https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(job.dhlTrackingNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-primary hover:underline"
                              data-testid={`link-tracking-${job.id}`}
                            >
                              {job.dhlTrackingNumber}
                            </a>
                          ) : (
                            index === 0 && <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
          </>
        )}
      </main>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new password.
            </DialogDescription>
          </DialogHeader>
          <Form {...changePasswordForm}>
            <form onSubmit={changePasswordForm.handleSubmit(handleChangePassword)} className="space-y-4">
              <FormField
                control={changePasswordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your current password" 
                        {...field} 
                        data-testid="input-current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your new password" 
                        {...field} 
                        data-testid="input-new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Confirm your new password" 
                        {...field} 
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setChangePasswordOpen(false);
                    changePasswordForm.reset();
                  }}
                  data-testid="button-cancel-change-password"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-submit-change-password"
                >
                  {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

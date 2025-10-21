import { useState, useEffect } from "react";
import { Plus, Search, AlertCircle, Clock, Palette, CheckCircle, X, MoreVertical, Users, Briefcase, ChevronDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { JobFormDialog } from "@/components/JobFormDialog";
import { JobEditDialog } from "@/components/JobEditDialog";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { LogoSetupDialog } from "@/components/LogoSetupDialog";
import { JobRow } from "@/components/JobRow";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getMachineName } from "@shared/machines";
import type { Customer, Job, JobWithLineItems, Staff, LogoSetup } from "@shared/schema";
import { canViewPrices } from "@shared/schema";
import { useParams } from "wouter";
import { isPast, isToday, format } from "date-fns";

export default function Dashboard() {
  const { toast } = useToast();
  const params = useParams();
  const machineId = params.id ? parseInt(params.id) : null;
  const [searchTerm, setSearchTerm] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showLogoSetupDialog, setShowLogoSetupDialog] = useState(false);
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false);
  const [completedOrdersOpen, setCompletedOrdersOpen] = useState(false);

  // Fetch current user
  const { data: currentUser } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: customersData = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Sort customers alphabetically by name
  const customers = [...customersData].sort((a, b) => a.name.localeCompare(b.name));

  const { data: staffData = [], isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Sort staff alphabetically by name
  const staff = [...staffData].sort((a, b) => a.name.localeCompare(b.name));

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobWithLineItems[]>({
    queryKey: machineId ? ["/api/jobs", `?machineId=${machineId}`] : ["/api/jobs"],
  });

  const { data: logoSetups = [], isLoading: logoSetupsLoading } = useQuery<LogoSetup[]>({
    queryKey: ["/api/logo-setups"],
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/jobs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Success",
        description: "Order created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/jobs/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Success",
        description: "Order deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setEditingJob(null);
      toast({
        title: "Success",
        description: "Order updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
    },
  });

  const approveLogoSetupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/logo-setups/${id}`, {
        approved: true,
        approvedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/logo-setups"] });
      toast({
        title: "Success",
        description: "Logo set-up approved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve logo set-up",
        variant: "destructive",
      });
    },
  });

  const deleteLogoSetupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/logo-setups/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/logo-setups"] });
      toast({
        title: "Success",
        description: "Logo set-up removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove logo set-up",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (job) {
      setEditingJob(job);
    }
  };

  const handleDelete = (id: string) => {
    deleteJobMutation.mutate(id);
  };

  const jobsWithCustomers = jobs.map((job) => {
    const customer = customers.find((c) => c.id === job.customerId);
    const staffMember = staff.find((s) => s.id === job.completedById);
    return {
      ...job,
      customerName: customer?.name || "Unknown",
      completedByName: staffMember?.name || null,
    };
  });

  const filteredJobs = jobsWithCustomers.filter((job) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      job.customerName.toLowerCase().includes(searchLower) ||
      job.jobName.toLowerCase().includes(searchLower) ||
      (job.poNumber && job.poNumber.toLowerCase().includes(searchLower))
    );
  });

  // Separate active and completed orders
  // Production Queue: only show jobs that have all required info (dates + embroidery approval)
  const activeJobs = filteredJobs.filter(job => {
    if (job.invoiceStatus !== 'pending') return false;
    
    // Must have both dates to enter production queue
    if (!job.requiredDispatchDate || !job.goodsReceived) return false;
    
    // Must have all line items with embroidery approved
    const allLogosApproved = job.lineItems && job.lineItems.length > 0 
      && job.lineItems.every(item => item.logoApproved);
    
    return allLogosApproved;
  });
  
  // Pending Orders: orders that are pending but don't have all required info yet
  const pendingJobs = filteredJobs.filter(job => {
    if (job.invoiceStatus !== 'pending') return false;
    
    // Missing dates OR missing logo approvals
    const missingDates = !job.requiredDispatchDate || !job.goodsReceived;
    const allLogosApproved = job.lineItems && job.lineItems.length > 0 
      && job.lineItems.every(item => item.logoApproved);
    const missingLogoApprovals = !allLogosApproved;
    
    return missingDates || missingLogoApprovals;
  });
  
  // Completed Orders: only show jobs that have been invoiced
  const completedJobs = filteredJobs.filter(job => job.invoiceStatus === 'invoiced');

  const sortedActiveJobs = [...activeJobs].sort(
    (a, b) => new Date(a.requiredDispatchDate!).getTime() - new Date(b.requiredDispatchDate!).getTime()
  );

  const sortedPendingJobs = [...pendingJobs].sort((a, b) => {
    // Sort by dispatch date if both have it, otherwise by customer name
    if (a.requiredDispatchDate && b.requiredDispatchDate) {
      return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
    }
    if (a.requiredDispatchDate) return -1;
    if (b.requiredDispatchDate) return 1;
    return a.customerName.localeCompare(b.customerName);
  });

  const sortedCompletedJobs = [...completedJobs].sort((a, b) => {
    if (!a.requiredDispatchDate) return 1;
    if (!b.requiredDispatchDate) return -1;
    return new Date(b.requiredDispatchDate).getTime() - new Date(a.requiredDispatchDate).getTime();
  });

  // Calculate overdue and due today orders (only from active jobs)
  const overdueOrders = sortedActiveJobs.filter(job => 
    job.requiredDispatchDate && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate)
  );
  
  const dueTodayOrders = sortedActiveJobs.filter(job => 
    job.requiredDispatchDate && isToday(job.requiredDispatchDate)
  );

  const pageTitle = machineId 
    ? `${getMachineName(machineId)} Orders` 
    : "Production Queue";

  if (customersLoading || jobsLoading || staffLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Orders sorted by dispatch date
            </p>
          </div>
          <div className="flex gap-2">
            <JobFormDialog
              trigger={
                <Button data-testid="button-add-order">
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              }
              customers={customers}
              staff={staff}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-more-actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowCustomerDialog(true)} data-testid="menu-add-customer">
                  <Users className="h-4 w-4 mr-2" />
                  Add Customer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLogoSetupDialog(true)} data-testid="menu-add-logo-setup">
                  <Palette className="h-4 w-4 mr-2" />
                  New Logo Set-Up
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <CustomerFormDialog
              open={showCustomerDialog}
              onOpenChange={setShowCustomerDialog}
              onSubmit={(data) => {
                createCustomerMutation.mutate(data);
                setShowCustomerDialog(false);
              }}
            />
            <LogoSetupDialog
              open={showLogoSetupDialog}
              onOpenChange={setShowLogoSetupDialog}
              customers={customers}
            />
          </div>
        </div>

        {/* Urgent Orders Summary */}
        {(overdueOrders.length > 0 || dueTodayOrders.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Overdue Orders */}
            {overdueOrders.length > 0 && (
              <div className="border border-destructive/50 rounded-md p-4 bg-destructive/5" data-testid="section-overdue-orders">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <h3 className="font-semibold text-destructive">
                    Overdue Orders ({overdueOrders.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {overdueOrders.map((job) => (
                    <div key={job.id} className="text-sm" data-testid={`overdue-summary-${job.id}`}>
                      <span className="font-medium">{job.customerName}</span>
                      <span className="text-muted-foreground"> - {job.jobName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Orders Due Today */}
            {dueTodayOrders.length > 0 && (
              <div className="border border-amber-500/50 rounded-md p-4 bg-amber-500/5" data-testid="section-due-today-orders">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                  <h3 className="font-semibold text-amber-600 dark:text-amber-500">
                    Due Today ({dueTodayOrders.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {dueTodayOrders.map((job) => (
                    <div key={job.id} className="text-sm" data-testid={`due-today-summary-${job.id}`}>
                      <span className="font-medium">{job.customerName}</span>
                      <span className="text-muted-foreground"> - {job.jobName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Logo Set-Up Queue */}
        {logoSetups.filter(ls => !ls.approved).length > 0 && (
          <div className="border border-primary/30 rounded-md p-4 bg-primary/5 mb-6" data-testid="section-logo-setups">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-primary">
                  Logo Set-Up Queue ({logoSetups.filter(ls => !ls.approved).length})
                </h3>
              </div>
              <LogoSetupDialog
                trigger={
                  <Button variant="outline" size="sm" data-testid="button-add-logo-setup">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Logo Set-Up
                  </Button>
                }
                customers={customers}
              />
            </div>
            <div className="space-y-2">
              {logoSetups
                .filter(ls => !ls.approved)
                .map((setup) => {
                  const customer = customers.find(c => c.id === setup.customerId);
                  return (
                    <div
                      key={setup.id}
                      className="flex items-center justify-between bg-background rounded-md p-3"
                      data-testid={`logo-setup-${setup.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{customer?.name || "Unknown Customer"}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className="text-sm">{setup.jobName}</span>
                        </div>
                        {setup.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{setup.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Added {format(new Date(setup.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveLogoSetupMutation.mutate(setup.id)}
                          disabled={approveLogoSetupMutation.isPending}
                          data-testid={`button-approve-${setup.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve (£10)
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteLogoSetupMutation.mutate(setup.id)}
                          disabled={deleteLogoSetupMutation.isPending}
                          data-testid={`button-delete-${setup.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by customer, job name, or PO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Production Queue - Active Orders */}
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Customer
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Job Name
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    PO #
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Qty
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Machine
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Runs
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Time/Run
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Total
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Price
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Dispatch
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    On Time
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Completed By
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {sortedActiveJobs.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-muted-foreground">
                      {searchTerm ? "No active orders match your search." : "No active orders found. Click 'New Order' to create one."}
                    </td>
                  </tr>
                ) : (
                  sortedActiveJobs.map((job) => {
                    const customer = customers.find(c => c.id === job.customerId);
                    return (
                      <JobRow
                        key={job.id}
                        job={{
                          ...job,
                          goodsReceived: new Date(job.goodsReceived!),
                          requiredDispatchDate: new Date(job.requiredDispatchDate!),
                        }}
                        customer={customer}
                        showPrices={canViewPrices(currentUser?.role)}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Orders Section - Orders that need attention */}
        {sortedPendingJobs.length > 0 && (
          <Collapsible open={pendingOrdersOpen} onOpenChange={setPendingOrdersOpen} className="mt-8">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex w-full items-center justify-between p-0 hover:bg-transparent mb-4" data-testid="button-toggle-pending">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <h2 className="text-xl font-semibold text-foreground">
                    Pending Orders - Awaiting Information ({sortedPendingJobs.length})
                  </h2>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${pendingOrdersOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <div className="border rounded-md overflow-hidden bg-amber-50 dark:bg-amber-950/20">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Customer
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Job Name
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        PO #
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Qty
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Machine
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Runs
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Time/Run
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Total
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Price
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Dispatch
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Status
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {sortedPendingJobs.map((job) => {
                      const customer = customers.find(c => c.id === job.customerId);
                      return (
                        <JobRow
                          key={job.id}
                          job={{
                            ...job,
                            goodsReceived: job.goodsReceived ? new Date(job.goodsReceived) : null,
                            requiredDispatchDate: job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : null,
                          }}
                          customer={customer}
                          showPrices={canViewPrices(currentUser?.role)}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          isCompleted={false}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Completed Orders Section */}
        {sortedCompletedJobs.length > 0 && (
          <Collapsible open={completedOrdersOpen} onOpenChange={setCompletedOrdersOpen} className="mt-8">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex w-full items-center justify-between p-0 hover:bg-transparent mb-4" data-testid="button-toggle-completed">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h2 className="text-xl font-semibold text-foreground">
                    Completed Orders ({sortedCompletedJobs.length})
                  </h2>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${completedOrdersOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Customer
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Job Name
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        PO #
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Qty
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Machine
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Runs
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Time/Run
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Total
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Price
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Dispatch
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        On Time
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Completed By
                      </th>
                      <th className="py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        Invoice Ref
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {sortedCompletedJobs.map((job) => {
                      const customer = customers.find(c => c.id === job.customerId);
                      return (
                        <JobRow
                          key={job.id}
                          job={{
                            ...job,
                            goodsReceived: job.goodsReceived ? new Date(job.goodsReceived) : null,
                            requiredDispatchDate: job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : null,
                          }}
                          customer={customer}
                          showPrices={canViewPrices(currentUser?.role)}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          isCompleted={true}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <JobEditDialog
          open={editingJob !== null}
          onOpenChange={(open) => !open && setEditingJob(null)}
          job={editingJob ? {
            ...editingJob,
            goodsReceived: editingJob.goodsReceived ? new Date(editingJob.goodsReceived) : null,
            requiredDispatchDate: editingJob.requiredDispatchDate ? new Date(editingJob.requiredDispatchDate) : null,
          } : null}
          customers={customers}
          staff={staff}
          onSubmit={(id, data) => updateJobMutation.mutate({ id, data })}
        />
      </div>
    </div>
  );
}

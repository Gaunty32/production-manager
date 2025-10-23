import { useState, useEffect } from "react";
import { Plus, Search, AlertCircle, Clock, Palette, CheckCircle, X, MoreVertical, Users, Briefcase, ChevronDown } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ProductionWorksheet } from "@/components/ProductionWorksheet";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getMachineName } from "@shared/machines";
import type { Customer, Job, JobWithLineItems, Staff, LogoSetup } from "@shared/schema";
import { canViewPrices } from "@shared/schema";
import { useParams } from "wouter";
import { isPast, isToday, format, addDays, startOfDay, endOfDay } from "date-fns";

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
  const [activeFilter, setActiveFilter] = useState<'overdue' | 'logo-setups' | '3-days' | null>(null);
  const [worksheetJob, setWorksheetJob] = useState<JobWithLineItems | null>(null);

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

  // Combine all non-completed jobs for unified production queue
  const allProductionJobs = [...activeJobs, ...pendingJobs].sort((a, b) => {
    // Sort by dispatch date if both have it, otherwise pending jobs go to end
    if (a.requiredDispatchDate && b.requiredDispatchDate) {
      return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
    }
    if (a.requiredDispatchDate) return -1;
    if (b.requiredDispatchDate) return 1;
    return a.customerName.localeCompare(b.customerName);
  });

  // Calculate key metrics for at-a-glance view
  const overdueOrders = allProductionJobs.filter(job => 
    job.requiredDispatchDate && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate)
  );
  
  // Jobs due in 3 days (using calendar boundaries)
  const now = new Date();
  const day3Start = startOfDay(addDays(now, 3));
  const day3End = endOfDay(addDays(now, 3));
  
  const jobsDueIn3Days = allProductionJobs.filter(job => {
    if (!job.requiredDispatchDate) return false;
    const dispatchDate = new Date(job.requiredDispatchDate);
    // Within calendar day 3 from now
    return dispatchDate >= day3Start && dispatchDate <= day3End;
  });
  
  const pendingLogoSetups = logoSetups.filter(ls => !ls.approved);

  // Apply active filter to production jobs
  const displayedJobs = (() => {
    if (!activeFilter) return allProductionJobs;
    
    switch (activeFilter) {
      case 'overdue':
        return overdueOrders;
      case '3-days':
        return jobsDueIn3Days;
      case 'logo-setups':
        // Filter jobs that have line items without logo approval
        return allProductionJobs.filter(job => {
          return job.lineItems && job.lineItems.length > 0 
            && job.lineItems.some(item => !item.logoApproved);
        });
      default:
        return allProductionJobs;
    }
  })();

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

        {/* At-a-Glance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Overdue Orders */}
          <Card 
            className={`hover-elevate active-elevate-2 cursor-pointer transition-all ${activeFilter === 'overdue' ? 'ring-2 ring-destructive' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'overdue' ? null : 'overdue')}
            data-testid="card-filter-overdue"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overdue Orders</p>
                  <h3 className="text-3xl font-bold text-destructive mt-2">{overdueOrders.length}</h3>
                </div>
                <div className="h-12 w-12 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
              </div>
              {activeFilter === 'overdue' && (
                <p className="text-xs text-destructive mt-2 font-medium">Click to clear filter</p>
              )}
            </div>
          </Card>

          {/* Logo Set-Ups */}
          <Card className="hover-elevate">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Logo Set-Ups</p>
                  <h3 className="text-3xl font-bold text-primary mt-2">{pendingLogoSetups.length}</h3>
                </div>
                <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Palette className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>
          </Card>

          {/* Jobs Due in 3 Days */}
          <Card 
            className={`hover-elevate active-elevate-2 cursor-pointer transition-all ${activeFilter === '3-days' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setActiveFilter(activeFilter === '3-days' ? null : '3-days')}
            data-testid="card-filter-3-days"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Due in 3 Days</p>
                  <h3 className="text-3xl font-bold text-foreground mt-2">{jobsDueIn3Days.length}</h3>
                </div>
                <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              {activeFilter === '3-days' && (
                <p className="text-xs text-primary mt-2 font-medium">Click to clear filter</p>
              )}
            </div>
          </Card>
        </div>

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

        <div className="mb-6">
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

        {/* Production Queue - All Jobs (Active + Pending) */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">
              {activeFilter === 'overdue' && 'Overdue Orders'}
              {activeFilter === '3-days' && 'Jobs Due in 3 Days'}
              {activeFilter === 'logo-setups' && 'Jobs Awaiting Logo Approval'}
              {!activeFilter && 'All Jobs in Production'}
            </h2>
            {activeFilter && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setActiveFilter(null)}
                data-testid="button-clear-filter"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filter
              </Button>
            )}
          </div>
          {displayedJobs.length === 0 ? (
            <div className="border rounded-md p-12 text-center">
              <p className="text-muted-foreground">
                {activeFilter 
                  ? "No jobs match this filter." 
                  : searchTerm 
                    ? "No jobs match your search." 
                    : "No jobs found. Click 'New Order' to create one."}
              </p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden" data-testid="table-production-queue">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="text-xs text-muted-foreground uppercase tracking-wider">
                    <TableHead className="py-3 px-3">Customer</TableHead>
                    <TableHead className="py-3 px-3">Job</TableHead>
                    <TableHead className="py-3 px-3">PO #</TableHead>
                    <TableHead className="py-3 px-3">Qty</TableHead>
                    <TableHead className="py-3 px-3">Machine</TableHead>
                    <TableHead className="py-3 px-3">Production</TableHead>
                    {canViewPrices(currentUser?.role) && (
                      <TableHead className="py-3 px-3">Price</TableHead>
                    )}
                    <TableHead className="py-3 px-3">Date Required</TableHead>
                    <TableHead className="py-3 px-3">Status</TableHead>
                    <TableHead className="py-3 px-3">Completed By</TableHead>
                    <TableHead className="py-3 px-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedJobs.map((job) => {
                    const customer = customers.find(c => c.id === job.customerId);
                    if (!customer) return null;
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
                        onDelete={(jobId) => {
                          if (window.confirm(`Are you sure you want to delete this job: ${job.jobName}?`)) {
                            deleteJobMutation.mutate(jobId);
                          }
                        }}
                        onPrintWorksheet={(jobId) => {
                          const fullJob = jobs.find(j => j.id === jobId);
                          if (fullJob) {
                            setWorksheetJob(fullJob);
                          }
                        }}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

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

        {worksheetJob && (
          <ProductionWorksheet
            job={worksheetJob}
            customer={customers.find(c => c.id === worksheetJob.customerId)!}
            onClose={() => setWorksheetJob(null)}
          />
        )}
      </div>
    </div>
  );
}

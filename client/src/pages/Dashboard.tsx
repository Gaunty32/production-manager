import { useState, useEffect } from "react";
import { DemoText, DemoAmount } from "@/components/DemoText";
import { Plus, Search, AlertCircle, Clock, Palette, CheckCircle, X, MoreVertical, Users, Briefcase, ChevronDown, ChevronRight, Package, Coins, ArrowUpDown, Printer, Truck, FileText, MessageSquare, Paperclip, Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { JobFormDialog } from "@/components/JobFormDialog";
import { JobEditDialog } from "@/components/JobEditDialog";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { LogoSetupDialog } from "@/components/LogoSetupDialog";
import { LineItemRow } from "@/components/LineItemRow";
import { ProductionWorksheet } from "@/components/ProductionWorksheet";
import { EditTrackingDialog } from "@/components/EditTrackingDialog";
import { DpdBookingDialog } from "@/components/DpdBookingDialog";
import { JobErrorsDialog } from "@/components/JobErrorsDialog";
import { JobErrorBadge } from "@/components/JobErrorBadge";
import { JobFilesDialog } from "@/components/JobFilesDialog";
import { RecordProductionDialog } from "@/components/RecordProductionDialog";
import { BulkCompleteDialog, type BulkCompleteItem } from "@/components/BulkCompleteDialog";
import { MachineScheduleBoard } from "@/components/MachineScheduleBoard";
import { CustomerDocumentsManager } from "@/components/CustomerDocumentsManager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMachines } from "@/hooks/useMachines";
import { getMachineName } from "@shared/machines";
import type { Customer, Job, JobWithLineItems, JobLineItem, Staff, LogoSetup, User } from "@shared/schema";
import { canViewPrices } from "@shared/schema";
import { useParams, useLocation } from "wouter";
import { isPast, isToday, format, addDays, startOfDay, endOfDay } from "date-fns";
import { getPrice, getPrintPrice, getFlatRatePrice, getBaggingPrice, calculateJobPrice, type PricingTable } from "@shared/pricing";
import { getCustomerColorClasses } from "@shared/colors";

export default function Dashboard() {
  const { toast } = useToast();
  const params = useParams();
  const machineId = params.id ? parseInt(params.id) : null;
  const [searchTerm, setSearchTerm] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showLogoSetupDialog, setShowLogoSetupDialog] = useState(false);
  const [showCompletedSetups, setShowCompletedSetups] = useState(false);
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false);
  const [completedOrdersOpen, setCompletedOrdersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'production' | 'completed' | 'setups'>('production');
  const [activeFilter, setActiveFilter] = useState<'overdue' | 'logo-setups' | '3-days' | null>(null);
  const [prodTab, setProdTab] = useState<'queue' | 'payment' | 'lineitems' | 'schedule'>('queue');
  const [worksheetJob, setWorksheetJob] = useState<JobWithLineItems | null>(null);
  const [sortOrder, setSortOrder] = useState<'date' | 'customer' | 'jobNumber'>('date');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);
  const [editingTrackingJob, setEditingTrackingJob] = useState<JobWithLineItems | null>(null);
  const [dpdBookingJob, setDpdBookingJob] = useState<JobWithLineItems | null>(null);
  const [dpdBatchJobs, setDpdBatchJobs] = useState<{ id: string; jobName: string; jobNumber: number | null; customerId: string }[]>([]);
  const [dpdJustBooked, setDpdJustBooked] = useState(false);
  const [dpdShipPrompt, setDpdShipPrompt] = useState<{ id: string; jobName: string; jobNumber: number | null; customerId: string }[] | null>(null);
  const [recordingProductionItem, setRecordingProductionItem] = useState<{ lineItem: JobLineItem; jobName: string } | null>(null);
  const [filesDialogJob, setFilesDialogJob] = useState<{ id: string; jobName: string; jobNumber: number } | null>(null);
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");

  // Fetch current user
  const { data: currentUser } = useQuery<{ id: string; username?: string; email: string; firstName?: string; lastName?: string; role?: string }>({
    queryKey: ["/api/staff-auth/user"],
    retry: false,
  });

  const { data: customersData = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Sort customers alphabetically by name
  const customers = [...customersData].sort((a, b) => a.name.localeCompare(b.name));
  // Only show active customers in selection dropdowns (inactive customers should not be selectable)
  const activeCustomers = customers.filter(c => c.active !== false);

  const { data: staffData = [], isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Sort staff alphabetically by name
  const staff = [...staffData].sort((a, b) => a.name.localeCompare(b.name));

  const { machines: dbMachines } = useMachines();
  const staffById = new Map(staff.map((s) => [s.id, s.name]));

  // Resolve the operator name for a line item: explicit operator first, then
  // fall back to the assigned machine's default operator.
  const getOperatorName = (lineItem: JobLineItem): string | null => {
    if (lineItem.operatorId) return staffById.get(lineItem.operatorId) || null;
    if (lineItem.machineId) {
      const machine = dbMachines.find((m) => m.id === lineItem.machineId);
      if (machine?.defaultOperatorId) return staffById.get(machine.defaultOperatorId) || null;
    }
    return null;
  };

  // Resolve the effective operator id for a line item (used for filtering).
  const getOperatorId = (lineItem: JobLineItem): string | null => {
    if (lineItem.operatorId) return lineItem.operatorId;
    if (lineItem.machineId) {
      const machine = dbMachines.find((m) => m.id === lineItem.machineId);
      return machine?.defaultOperatorId ?? null;
    }
    return null;
  };

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobWithLineItems[]>({
    queryKey: machineId ? ["/api/jobs", `?machineId=${machineId}`] : ["/api/jobs"],
  });

  const { data: logoSetups = [], isLoading: logoSetupsLoading } = useQuery<LogoSetup[]>({
    queryKey: ["/api/logo-setups"],
  });

  const { data: completedLogoSetups = [] } = useQuery<LogoSetup[]>({
    queryKey: ["/api/logo-setups/completed"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  interface JobError {
    id: string;
    jobId: string;
    errorDescription: string;
    resolved: boolean;
    assignedToId: string | null;
  }

  const { data: allJobErrors = [] } = useQuery<JobError[]>({
    queryKey: ["/api/job-errors/all"],
  });

  // Fetch conversation unread counts for the message badges
  interface StaffConversation { jobId: string; unreadCount: number; }
  const { data: staffConversations = [] } = useQuery<StaffConversation[]>({
    queryKey: ["/api/staff/conversations"],
    refetchInterval: 30000,
  });
  const unreadByJobId = staffConversations.reduce<Record<string, number>>((acc, c) => {
    acc[c.jobId] = c.unreadCount;
    return acc;
  }, {});

  const [, setLocation] = useLocation();

  const errorsByJobId = allJobErrors.reduce<Record<string, JobError[]>>((acc, error) => {
    if (!acc[error.jobId]) {
      acc[error.jobId] = [];
    }
    acc[error.jobId].push(error);
    return acc;
  }, {});

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

  const bulkDeleteJobsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let deleted = 0;
      const failures: string[] = [];
      for (const id of ids) {
        try {
          await apiRequest("DELETE", `/api/jobs/${id}`);
          deleted++;
        } catch (e) {
          failures.push(id);
        }
      }
      return { deleted, failures };
    },
    onSuccess: ({ deleted, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setSelectedJobIds(new Set());
      toast({
        title: failures.length ? "Partially completed" : "Success",
        description: failures.length
          ? `Deleted ${deleted} job${deleted !== 1 ? 's' : ''}, ${failures.length} failed.`
          : `Deleted ${deleted} job${deleted !== 1 ? 's' : ''} successfully.`,
        variant: failures.length ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete jobs",
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

  const markPaymentReceivedMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/mark-payment-received`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Payment confirmed", description: "Job released for production scheduling." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark payment as received.", variant: "destructive" });
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

  // All non-completed line items across the selected jobs — the candidates for
  // the "Complete N Items" bulk action.
  const bulkCompleteItems: BulkCompleteItem[] = jobsWithCustomers
    .filter((job) => selectedJobIds.has(job.id))
    .flatMap((job) => {
      const lineItems = (job as JobWithLineItems).lineItems ?? [];
      return lineItems
        .filter((li) => !li.completed)
        .map((li) => ({
          lineItem: li,
          jobName: job.jobName,
          customerName: job.customerName,
          defaultOperatorId: getOperatorId(li),
        }));
    });

  const filteredJobs = jobsWithCustomers.filter((job) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const lineItems = (job as JobWithLineItems).lineItems ?? [];
    const matchesMachine = lineItems.some((li) =>
      li.machineId ? getMachineName(li.machineId).toLowerCase().includes(searchLower) : false
    );
    const matchesStaff = lineItems.some((li) => {
      const op = getOperatorName(li);
      return op ? op.toLowerCase().includes(searchLower) : false;
    });
    return (
      job.customerName.toLowerCase().includes(searchLower) ||
      job.jobName.toLowerCase().includes(searchLower) ||
      (job.poNumber && job.poNumber.toLowerCase().includes(searchLower)) ||
      (job.jobNumber !== null && job.jobNumber.toString().toLowerCase().includes(searchLower)) ||
      matchesMachine ||
      matchesStaff
    );
  });

  // Awaiting Payment: jobs where the customer requires advance payment and it hasn't been received yet
  const awaitingPaymentJobs = filteredJobs.filter(job => {
    if (job.status === 'pending_customer_approval') return false;
    if (job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready') return false;
    return (job as any).customerRequiresAdvancePayment === true && !(job as any).paymentReceived;
  });

  const awaitingPaymentJobIds = new Set(awaitingPaymentJobs.map(j => j.id));

  // Separate active and completed orders
  // Production Queue: only show jobs that have all required info (dates + embroidery approval)
  const activeJobs = filteredJobs.filter(job => {
    // Exclude jobs pending customer approval (still in Holding Area)
    if (job.status === 'pending_customer_approval') return false;
    
    // Exclude invoiced and ready jobs (only show pending and not_ready)
    if (job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready') return false;

    // Exclude jobs awaiting advance payment
    if (awaitingPaymentJobIds.has(job.id)) return false;
    
    // Must have both dates to enter production queue
    if (!job.requiredDispatchDate || !job.goodsReceived) return false;
    
    // Must have all line items with embroidery approved
    const allLogosApproved = job.lineItems && job.lineItems.length > 0 
      && job.lineItems.every(item => item.logoApproved);
    
    return allLogosApproved;
  });
  
  // Pending Orders: orders that are pending but don't have all required info yet
  const pendingJobs = filteredJobs.filter(job => {
    // Exclude jobs pending customer approval (still in Holding Area)
    if (job.status === 'pending_customer_approval') return false;
    
    // Exclude invoiced and ready jobs (only show pending and not_ready)
    if (job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready') return false;

    // Exclude jobs awaiting advance payment
    if (awaitingPaymentJobIds.has(job.id)) return false;
    
    // Missing dates OR missing logo approvals
    const missingDates = !job.requiredDispatchDate || !job.goodsReceived;
    const allLogosApproved = job.lineItems && job.lineItems.length > 0 
      && job.lineItems.every(item => item.logoApproved);
    const missingLogoApprovals = !allLogosApproved;
    
    return missingDates || missingLogoApprovals;
  });
  
  // Completed Orders: derive from unfiltered jobs for independent search
  // Get all completed jobs (both 'ready' for invoicing and already 'invoiced')
  const allCompletedJobs = jobsWithCustomers.filter(job => 
    job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready'
  );

  // Apply unified search filtering to completed orders (same search as production queue)
  const filteredCompletedJobs = allCompletedJobs.filter((job) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      job.customerName.toLowerCase().includes(searchLower) ||
      job.jobName.toLowerCase().includes(searchLower) ||
      (job.poNumber && job.poNumber.toLowerCase().includes(searchLower)) ||
      (job.jobNumber !== null && job.jobNumber.toString().toLowerCase().includes(searchLower))
    );
  });

  // Sort completed jobs
  const latestCompletionTime = (job: (typeof filteredCompletedJobs)[number]): number => {
    const times = ((job as JobWithLineItems).lineItems ?? [])
      .map(li => li.completedAt ? new Date(li.completedAt).getTime() : NaN)
      .filter(t => !isNaN(t));
    if (times.length) return Math.max(...times);
    return job.requiredDispatchDate ? new Date(job.requiredDispatchDate).getTime() : 0;
  };
  const sortedCompletedJobs = [...filteredCompletedJobs].sort(
    (a, b) => latestCompletionTime(b) - latestCompletionTime(a)
  );
  const awaitingDespatchCount = allCompletedJobs.filter(j => !j.dhlTrackingNumber && j.invoiceStatus === 'ready').length;

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

  // Combine all non-completed jobs for unified production queue with configurable sorting
  const allProductionJobs = [...activeJobs, ...pendingJobs].sort((a, b) => {
    switch (sortOrder) {
      case 'customer':
        return a.customerName.localeCompare(b.customerName);
      case 'jobNumber':
        if (a.jobNumber === null && b.jobNumber === null) return 0;
        if (a.jobNumber === null) return 1;
        if (b.jobNumber === null) return -1;
        // Handle both numeric and string job numbers
        const aNum = typeof a.jobNumber === 'number' ? a.jobNumber : parseInt(a.jobNumber) || 0;
        const bNum = typeof b.jobNumber === 'number' ? b.jobNumber : parseInt(b.jobNumber) || 0;
        if (aNum !== bNum) {
          return aNum - bNum;
        }
        // If numeric parts are equal, do string comparison for full job number
        return String(a.jobNumber).localeCompare(String(b.jobNumber));
      case 'date':
      default:
        // Sort by dispatch date if both have it, otherwise pending jobs go to end
        if (a.requiredDispatchDate && b.requiredDispatchDate) {
          return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
        }
        if (a.requiredDispatchDate) return -1;
        if (b.requiredDispatchDate) return 1;
        return a.customerName.localeCompare(b.customerName);
    }
  });

  // Calculate key metrics for at-a-glance view
  const overdueOrders = allProductionJobs.filter(job => {
    if (!job.requiredDispatchDate) return false;
    const dispatchDate = new Date(job.requiredDispatchDate);
    return isPast(dispatchDate) && !isToday(dispatchDate);
  });
  
  // Jobs due today
  const jobsDueToday = allProductionJobs.filter(job => {
    if (!job.requiredDispatchDate) return false;
    const dispatchDate = new Date(job.requiredDispatchDate);
    return isToday(dispatchDate);
  });
  
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
  
  // Calculate quantities — only garments still outstanding (skip completed line
  // items; fall back to job quantity only when the job has no line items)
  const outstandingQuantity = (job: (typeof allProductionJobs)[number]) =>
    job.lineItems && job.lineItems.length > 0
      ? job.lineItems.reduce(
          (itemSum, item) => itemSum + (item.completed ? 0 : item.quantity || 0),
          0,
        )
      : job.quantity || 0;

  const overdueQuantity = overdueOrders.reduce((sum, job) => sum + outstandingQuantity(job), 0);

  const dueTodayQuantity = jobsDueToday.reduce((sum, job) => sum + outstandingQuantity(job), 0);

  const dueIn3DaysQuantity = jobsDueIn3Days.reduce((sum, job) => sum + outstandingQuantity(job), 0);
  
  const pendingLogoSetups = logoSetups.filter(ls => !ls.approved);
  
  // Apply unified search filtering to embroidery set-ups
  const filteredLogoSetups = pendingLogoSetups.filter((setup) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const customer = customers.find(c => c.id === setup.customerId);
    return (
      (customer?.name?.toLowerCase().includes(searchLower)) ||
      (setup.jobName?.toLowerCase().includes(searchLower)) ||
      (setup.notes?.toLowerCase().includes(searchLower))
    );
  });

  // Calculate total quantity and total value for production queue
  const productionQueueMetrics = (() => {
    let totalQuantity = 0;
    let totalValue = 0;

    allProductionJobs.forEach(job => {
      if (job.lineItems) {
        // Get customer for this job to determine pricing table
        const customer = customers.find(c => c.id === job.customerId);
        
        // Determine pricing table: use 2025 if explicitly set, otherwise 2026 if explicitly set, otherwise default to 2026
        let pricingTable: PricingTable = "2026";
        if (customer?.pricingTable2025) {
          pricingTable = "2025";
        } else if (customer?.pricingTable2026) {
          pricingTable = "2026";
        }

        job.lineItems.forEach(lineItem => {
          totalQuantity += lineItem.quantity || 0;

          // Calculate price based on job type
          try {
            let itemPrice: number | "POA" = 0;

            if (lineItem.jobType === "Bagging") {
              const result = getBaggingPrice(lineItem.quantity, pricingTable);
              itemPrice = result.totalPrice;
            } else if (lineItem.jobType === "Print Initials/Name" || lineItem.jobType === "Embroidery Initials/Name") {
              const result = getFlatRatePrice(lineItem.quantity, lineItem.jobType);
              itemPrice = result.totalPrice;
            } else if (lineItem.jobType === "Print" && lineItem.stitchCount) {
              const result = getPrintPrice(lineItem.quantity, lineItem.stitchCount, pricingTable);
              itemPrice = result.totalPrice;
            } else if (lineItem.stitchCount) {
              // Embroidery or Other with stitch count
              const result = getPrice(lineItem.quantity, lineItem.stitchCount, pricingTable);
              itemPrice = result.totalPrice; // Can be "POA"
            }

            // Only add to total if it's a number (not POA)
            if (typeof itemPrice === "number") {
              totalValue += itemPrice;
            }
          } catch (error) {
            // Skip items that can't be priced (e.g., missing data, invalid params)
          }
        });
      }
    });

    return { totalQuantity, totalValue };
  })();

  // Calculate the amount due for a single job. Uses the exact same pricing as
  // the customer portal (calculateJobPrice + the customer's pricing table) so
  // the staff figure always matches what the customer sees. Returns the numeric
  // total of priced line items, and whether any line item is POA.
  const calculateJobAmountDue = (job: JobWithLineItems): { amount: number; hasPoa: boolean } => {
    const customer = customers.find(c => c.id === job.customerId);
    // Same resolution order as the customer portal: 2026 first, then 2025.
    const pricingTable: PricingTable | null = customer?.pricingTable2026
      ? "2026"
      : customer?.pricingTable2025
        ? "2025"
        : null;

    const lineItems = job.lineItems ?? [];
    if (lineItems.length === 0) return { amount: 0, hasPoa: false };

    // No pricing table configured for this customer → everything is POA,
    // exactly as the customer portal would show.
    if (!pricingTable) return { amount: 0, hasPoa: true };

    let amount = 0;
    let hasPoa = false;
    try {
      const { lineItemPrices } = calculateJobPrice(
        lineItems.map(li => ({
          quantity: li.quantity,
          stitchCount: li.stitchCount || 0,
          jobType: li.jobType || undefined,
        })),
        pricingTable
      );
      for (const p of lineItemPrices) {
        if (typeof p.totalPrice === "number") {
          amount += p.totalPrice;
        } else {
          hasPoa = true;
        }
      }
    } catch (error) {
      // Couldn't price the job (missing data, invalid params) — treat as POA
      hasPoa = true;
    }
    return { amount, hasPoa };
  };

  // Apply active filter to production jobs
  const allDisplayedJobs = (() => {
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

  // Separate jobs that have no line items yet — these are NOT in the schedule
  // and have no due date. Show them in a dedicated panel so it's obvious they
  // still need attention before they can be booked in.
  const unscheduledJobs = allDisplayedJobs.filter(
    j => !j.lineItems || j.lineItems.length === 0
  );
  const lineItemMatchesFilter = (li: JobLineItem): boolean => {
    const machineOk = machineFilter === "all" || li.machineId === parseInt(machineFilter);
    const operatorOk = operatorFilter === "all" || getOperatorId(li) === operatorFilter;
    return machineOk && operatorOk;
  };

  const matchesMachineOperatorFilter = (job: JobWithLineItems): boolean => {
    if (machineFilter === "all" && operatorFilter === "all") return true;
    if (!job.lineItems || job.lineItems.length === 0) return false;
    return job.lineItems.some(lineItemMatchesFilter);
  };

  const displayedJobs = allDisplayedJobs
    .filter(j => j.lineItems && j.lineItems.length > 0)
    .filter(matchesMachineOperatorFilter);

  // When a KPI scorecard filter is active, always show the Production Queue tab
  // (the filter narrows the queue), regardless of which pill was last selected.
  const effectiveProdTab = activeFilter ? 'queue' : prodTab;

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
              customers={activeCustomers}
              staff={staff}
              onJobCreated={async (jobId) => {
                // Fetch the full job with line items for the worksheet
                try {
                  const response = await fetch(`/api/jobs/${jobId}`, { credentials: 'include' });
                  if (response.ok) {
                    const fullJob = await response.json();
                    setWorksheetJob(fullJob);
                  }
                } catch (error) {
                  console.error('Failed to fetch job for worksheet:', error);
                }
              }}
            />
            <Button 
              variant="outline" 
              data-testid="button-view-completed-orders"
              onClick={() => {
                setViewMode('completed');
                setTimeout(() => {
                  const completedSection = document.querySelector('[data-testid="section-completed-orders"]');
                  if (completedSection) {
                    completedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
            >
              <Package className="h-4 w-4 mr-2" />
              Completed Orders
            </Button>
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
                  New Embroidery Set-Up
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
              customers={activeCustomers}
            />
          </div>
        </div>

        {/* At-a-Glance Summary */}
        <div className={`grid grid-cols-1 gap-4 mb-6 ${currentUser?.role === 'super_admin' ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          {/* Overdue + Due Today Orders */}
          <Card 
            className={`hover-elevate active-elevate-2 cursor-pointer transition-all ${activeFilter === 'overdue' ? 'ring-2 ring-destructive' : ''}`}
            onClick={() => setActiveFilter(activeFilter === 'overdue' ? null : 'overdue')}
            data-testid="card-filter-overdue"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overdue / Due Today</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <h3 className="text-3xl font-bold text-destructive" data-testid="text-overdue-quantity">{overdueQuantity.toLocaleString()}</h3>
                    <span className="text-xl font-semibold text-amber-500" data-testid="text-due-today-quantity">/ {dueTodayQuantity.toLocaleString()}</span>
                  </div>
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
                  <h3 className="text-3xl font-bold text-foreground mt-2" data-testid="text-due-3-days-quantity">{dueIn3DaysQuantity.toLocaleString()}</h3>
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

          {/* Embroidery Set-Ups */}
          <Card className="hover-elevate">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Embroidery Set-Ups</p>
                  <h3 className="text-3xl font-bold text-primary mt-2">{pendingLogoSetups.length}</h3>
                </div>
                <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Palette className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>
          </Card>

          {/* Total Quantity - All Users */}
          <Card className="hover-elevate">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Quantity</p>
                  <h3 className="text-3xl font-bold text-foreground mt-2" data-testid="text-total-quantity">
                    {productionQueueMetrics.totalQuantity.toLocaleString()}
                  </h3>
                </div>
                <div className="h-12 w-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </div>
          </Card>

          {/* Total Value - Super Admin Only */}
          {currentUser?.role === 'super_admin' && (
            <Card className="hover-elevate">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Value</p>
                    <h3 className="text-3xl font-bold text-foreground mt-2" data-testid="text-total-value">
                      <DemoAmount value={productionQueueMetrics.totalValue} />
                    </h3>
                  </div>
                  <div className="h-12 w-12 bg-green-500/10 rounded-full flex items-center justify-center">
                    <Coins className="h-6 w-6 text-green-500" />
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Search and Action Bar */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search all orders, set-ups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <JobFormDialog
              trigger={
                <Button data-testid="button-add-order-main">
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              }
              customers={activeCustomers}
              staff={staff}
              onJobCreated={async (jobId) => {
                try {
                  const response = await fetch(`/api/jobs/${jobId}`, { credentials: 'include' });
                  if (response.ok) {
                    const fullJob = await response.json();
                    setWorksheetJob(fullJob);
                  }
                } catch (error) {
                  console.error('Failed to fetch job for worksheet:', error);
                }
              }}
            />
            <Button 
              variant="outline" 
              onClick={() => setShowCustomerDialog(true)}
              data-testid="button-add-customer-main"
            >
              <Users className="h-4 w-4 mr-2" />
              New Customer
            </Button>
            <LogoSetupDialog
              trigger={
                <Button variant="outline" data-testid="button-add-setup-main">
                  <Palette className="h-4 w-4 mr-2" />
                  New Embroidery Set-Up
                </Button>
              }
              customers={activeCustomers}
            />
            <CustomerDocumentsManager
              trigger={
                <Button variant="outline" data-testid="button-manage-documents">
                  <FileText className="h-4 w-4 mr-2" />
                  Customer Documents
                </Button>
              }
            />
            
            {/* View Toggle */}
            <div className="border rounded-md p-1 flex gap-1 ml-2">
              <Button
                variant={viewMode === 'production' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('production')}
                data-testid="button-view-production"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Production Queue
              </Button>
              <Button
                variant={viewMode === 'setups' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('setups')}
                data-testid="button-view-setups"
              >
                <Palette className="h-4 w-4 mr-2" />
                Set-Ups ({pendingLogoSetups.length})
              </Button>
              <Button
                variant={viewMode === 'completed' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('completed')}
                data-testid="button-view-completed"
              >
                <Package className="h-4 w-4 mr-2" />
                Completed ({allCompletedJobs.length})
              </Button>
            </div>
          </div>
        </div>

        {/* Production sub-section pill tabs — keeps the Production Queue (main data)
            at the top and tucks secondary panels behind pills to reduce clutter. */}
        {viewMode === 'production' && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <Button
              variant={effectiveProdTab === 'queue' ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => { setActiveFilter(null); setProdTab('queue'); }}
              data-testid="pill-tab-queue"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Production Queue
            </Button>
            <Button
              variant={effectiveProdTab === 'payment' ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => { setActiveFilter(null); setProdTab('payment'); }}
              data-testid="pill-tab-payment"
            >
              Awaiting Payment ({awaitingPaymentJobs.length})
            </Button>
            <Button
              variant={effectiveProdTab === 'lineitems' ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => { setActiveFilter(null); setProdTab('lineitems'); }}
              data-testid="pill-tab-lineitems"
            >
              Awaiting Line Items ({unscheduledJobs.length})
            </Button>
            <Button
              variant={effectiveProdTab === 'schedule' ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => { setActiveFilter(null); setProdTab('schedule'); }}
              data-testid="pill-tab-schedule"
            >
              <Palette className="h-4 w-4 mr-2" />
              Machine Schedule
            </Button>
          </div>
        )}

        {/* Awaiting Payment Section */}
        {viewMode === 'production' && effectiveProdTab === 'payment' && (
          awaitingPaymentJobs.length > 0 ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1 rounded-full bg-orange-500" />
              <h2 className="text-xl font-semibold text-foreground">Awaiting Payment</h2>
              <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
                {awaitingPaymentJobs.length} job{awaitingPaymentJobs.length > 1 ? 's' : ''} on hold
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              These jobs are awaiting BACS payment. Mark payment received to release for production.
            </p>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contents</TableHead>
                    <TableHead>Required Date</TableHead>
                    {canViewPrices(currentUser?.role) && <TableHead className="text-right">Amount Due</TableHead>}
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awaitingPaymentJobs.map((job) => {
                    const customer = customers.find(c => c.id === job.customerId);
                    const lineItems = (job as JobWithLineItems).lineItems ?? [];
                    const totalQty = lineItems.reduce((sum, li) => sum + (li.quantity ?? 0), 0);
                    const jobTypes = [...new Set(lineItems.map(li => li.jobType).filter(Boolean))];
                    const contentsLabel = lineItems.length > 0
                      ? `${totalQty} garment${totalQty !== 1 ? 's' : ''} · ${lineItems.length} line item${lineItems.length !== 1 ? 's' : ''}${jobTypes.length ? ` (${jobTypes.join(', ')})` : ''}`
                      : '—';
                    const isPending = markPaymentReceivedMutation.isPending && (markPaymentReceivedMutation.variables as string) === job.id;
                    return (
                      <TableRow
                        key={job.id}
                        className="bg-orange-50/40 dark:bg-orange-950/20 cursor-pointer hover:bg-orange-100/60 dark:hover:bg-orange-950/40"
                        onClick={() => setEditingJob(job)}
                        data-testid={`row-awaiting-payment-${job.id}`}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm"><DemoText>{job.jobName}</DemoText></p>
                            {job.jobNumber && <p className="text-xs text-muted-foreground">#{job.jobNumber}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm"><DemoText>{customer?.name || (job as any).customerName}</DemoText></span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{contentsLabel}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {job.requiredDispatchDate
                              ? format(new Date(job.requiredDispatchDate), 'dd/MM/yy')
                              : '—'}
                          </span>
                        </TableCell>
                        {canViewPrices(currentUser?.role) && (
                          <TableCell className="text-right">
                            {(() => {
                              const { amount, hasPoa } = calculateJobAmountDue(job as JobWithLineItems);
                              return (
                                <span className="text-sm font-medium tabular-nums" data-testid={`text-amount-due-${job.id}`}>
                                  <DemoAmount value={amount} />{hasPoa ? ' + POA' : ''}
                                </span>
                              );
                            })()}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="bg-orange-600 text-white"
                              disabled={isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                markPaymentReceivedMutation.mutate(job.id);
                              }}
                              data-testid={`button-mark-paid-${job.id}`}
                            >
                              {isPending ? "Confirming…" : "Mark as Paid"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              disabled={deleteJobMutation.isPending && (deleteJobMutation.variables as string) === job.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete this job: ${job.jobName}? This cannot be undone.`)) {
                                  deleteJobMutation.mutate(job.id);
                                }
                              }}
                              data-testid={`button-delete-awaiting-${job.id}`}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          ) : (
            <div className="mb-6 border rounded-md p-8 text-center text-muted-foreground" data-testid="empty-awaiting-payment">
              No jobs are awaiting payment.
            </div>
          )
        )}

        {/* Awaiting line items — jobs not yet booked into the schedule */}
        {viewMode === 'production' && effectiveProdTab === 'lineitems' && (
          unscheduledJobs.length > 0 ? (
          <div className="mb-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold text-foreground">
                Awaiting Line Items — Not Yet Booked In
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                These {unscheduledJobs.length} job{unscheduledJobs.length !== 1 ? 's' : ''} have no line items yet, so {unscheduledJobs.length !== 1 ? 'they are' : 'it is'} not on the production schedule and {unscheduledJobs.length !== 1 ? 'have' : 'has'} no due date. Edit each job to add line items.
              </p>
            </div>
            <div className="border border-amber-200 dark:border-amber-900 rounded-md bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-amber-100/60 dark:bg-amber-900/30">
                    <TableRow className="text-xs text-muted-foreground uppercase tracking-wider">
                      <TableHead className="py-3 px-3">Customer</TableHead>
                      <TableHead className="py-3 px-3">Job</TableHead>
                      <TableHead className="py-3 px-3">Job #</TableHead>
                      <TableHead className="py-3 px-3">PO #</TableHead>
                      <TableHead className="py-3 px-3">Qty</TableHead>
                      <TableHead className="py-3 px-3">Date Required</TableHead>
                      <TableHead className="py-3 px-3">Submitted</TableHead>
                      <TableHead className="py-3 px-3">Status</TableHead>
                      <TableHead className="py-3 px-3 w-10">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unscheduledJobs.map(job => (
                      <TableRow key={`unsched-${job.id}`} data-testid={`row-unscheduled-${job.id}`}>
                        <TableCell className="py-2 px-3"><DemoText className="font-medium">{job.customerName}</DemoText></TableCell>
                        <TableCell className="py-2 px-3 font-medium"><DemoText>{job.jobName}</DemoText></TableCell>
                        <TableCell className="py-2 px-3">
                          <span className="text-xs font-mono">{job.jobNumber || '-'}</span>
                        </TableCell>
                        <TableCell className="py-2 px-3">{job.poNumber || '-'}</TableCell>
                        <TableCell className="py-2 px-3 text-center">{job.quantity || 0}</TableCell>
                        <TableCell className="py-2 px-3">
                          {job.requiredDispatchDate
                            ? format(new Date(job.requiredDispatchDate), 'dd/MM/yy')
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2 px-3 whitespace-nowrap">
                          {job.submittedAt ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-mono">{format(new Date(job.submittedAt), 'd MMM yy')}</span>
                              <span className="text-[10px] text-muted-foreground">{format(new Date(job.submittedAt), 'HH:mm')}</span>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <span className="text-amber-600 text-xs font-medium">Needs line items</span>
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(job.id)}
                              data-testid={`button-add-line-items-unscheduled-${job.id}`}
                            >
                              Add line items
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(job.id)}
                              data-testid={`button-edit-unscheduled-${job.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="relative"
                              onClick={() => setLocation(`/messages?jobId=${job.id}`)}
                              data-testid={`button-chat-unscheduled-${job.id}`}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Chat
                              {!!(unreadByJobId[job.id] && unreadByJobId[job.id] > 0) && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              disabled={deleteJobMutation.isPending && (deleteJobMutation.variables as string) === job.id}
                              onClick={() => {
                                if (window.confirm(`Delete this job: ${job.jobName}? This cannot be undone.`)) {
                                  deleteJobMutation.mutate(job.id);
                                }
                              }}
                              data-testid={`button-delete-unscheduled-${job.id}`}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          ) : (
            <div className="mb-6 border rounded-md p-8 text-center text-muted-foreground" data-testid="empty-awaiting-lineitems">
              No jobs are awaiting line items.
            </div>
          )
        )}

        {/* Machine Schedule Board (printable pill view) */}
        {viewMode === 'production' && effectiveProdTab === 'schedule' && (
          <div className="mb-6">
            <MachineScheduleBoard />
          </div>
        )}

        {/* Production Queue - All Jobs (Active + Pending) */}
        {viewMode === 'production' && effectiveProdTab === 'queue' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {activeFilter === 'overdue' && 'Overdue Orders'}
                {activeFilter === '3-days' && 'Jobs Due in 3 Days'}
                {activeFilter === 'logo-setups' && 'Jobs Awaiting Logo Approval'}
                {!activeFilter && 'Production Queue'}
              </h2>
              {!activeFilter && (overdueOrders.length > 0 || jobsDueToday.length > 0) && (
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-destructive font-medium">{overdueOrders.length} overdue</span>
                  {overdueOrders.length > 0 && jobsDueToday.length > 0 && <span className="mx-1">•</span>}
                  {jobsDueToday.length > 0 && <span className="text-amber-600 font-medium">{jobsDueToday.length} due today</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {bulkCompleteItems.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setBulkCompleteOpen(true)}
                  data-testid="button-complete-selected"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete {bulkCompleteItems.length} Item{bulkCompleteItems.length !== 1 ? 's' : ''}
                </Button>
              )}
              {selectedJobIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selectedJobs = jobs.filter(j => selectedJobIds.has(j.id));
                    selectedJobs.forEach((job, index) => {
                      setTimeout(() => {
                        setWorksheetJob(job);
                        setTimeout(() => {
                          window.print();
                        }, 100);
                      }, index * 500);
                    });
                  }}
                  data-testid="button-print-selected"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print {selectedJobIds.size} Worksheet{selectedJobIds.size > 1 ? 's' : ''}
                </Button>
              )}
              {selectedJobIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={bulkDeleteJobsMutation.isPending}
                  onClick={() => {
                    const ids = Array.from(selectedJobIds);
                    if (window.confirm(`Permanently delete ${ids.length} selected job${ids.length !== 1 ? 's' : ''}? This removes each job and all its line items, schedule, files and chat. This cannot be undone.`)) {
                      bulkDeleteJobsMutation.mutate(ids);
                    }
                  }}
                  data-testid="button-delete-selected"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {bulkDeleteJobsMutation.isPending
                    ? "Deleting…"
                    : `Delete ${selectedJobIds.size} Selected`}
                </Button>
              )}
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="w-[150px] h-9" data-testid="select-filter-machine">
                  <SelectValue placeholder="All machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All machines</SelectItem>
                  {dbMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                <SelectTrigger className="w-[150px] h-9" data-testid="select-filter-operator">
                  <SelectValue placeholder="All operators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operators</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(machineFilter !== "all" || operatorFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setMachineFilter("all"); setOperatorFilter("all"); }}
                  data-testid="button-clear-machine-operator-filter"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-sort-order">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    Sort: {sortOrder === 'date' ? 'Date' : sortOrder === 'customer' ? 'Customer' : 'Job #'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortOrder('date')} data-testid="menu-sort-date">
                    {sortOrder === 'date' && <CheckCircle className="h-4 w-4 mr-2" />}
                    {sortOrder !== 'date' && <span className="w-4 mr-2" />}
                    Sort by Date
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder('customer')} data-testid="menu-sort-customer">
                    {sortOrder === 'customer' && <CheckCircle className="h-4 w-4 mr-2" />}
                    {sortOrder !== 'customer' && <span className="w-4 mr-2" />}
                    Sort by Customer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder('jobNumber')} data-testid="menu-sort-job-number">
                    {sortOrder === 'jobNumber' && <CheckCircle className="h-4 w-4 mr-2" />}
                    {sortOrder !== 'jobNumber' && <span className="w-4 mr-2" />}
                    Sort by Job #
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3" data-testid="cards-production-queue-mobile">
                {displayedJobs.map((job) => {
                  const customer = customers.find(c => c.id === job.customerId);
                  if (!customer) return null;
                  
                  const isOverdue = job.requiredDispatchDate && isPast(startOfDay(new Date(job.requiredDispatchDate)));
                  const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));
                  
                  return (
                    <Card 
                      key={job.id} 
                      className={`hover-elevate ${getCustomerColorClasses(customer.id)}`}
                    >
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-sm truncate"><DemoText>{job.jobName}</DemoText></h3>
                            <p className="text-xs text-muted-foreground truncate"><DemoText>{customer.name}</DemoText></p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" data-testid={`button-menu-${job.id}`} className="relative">
                                <MoreVertical className="h-4 w-4" />
                                {!!(unreadByJobId[job.id] && unreadByJobId[job.id] > 0) && (
                                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setLocation(`/messages?jobId=${job.id}`)} data-testid={`menu-messages-${job.id}`}>
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Messages{!!(unreadByJobId[job.id] && unreadByJobId[job.id] > 0) ? ` (${unreadByJobId[job.id]} unread)` : ""}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(job.id)}>
                                Edit Job
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setWorksheetJob(job)}
                                data-testid={`menu-print-${job.id}`}
                              >
                                <Printer className="h-4 w-4 mr-2" />
                                Print Worksheet
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to delete this job: ${job.jobName}?`)) {
                                    handleDelete(job.id);
                                  }
                                }}
                                className="text-destructive"
                              >
                                Delete Job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Job #:</span>
                            <span className="ml-1 font-medium">{job.jobNumber}</span>
                          </div>
                          {job.poNumber && (
                            <div>
                              <span className="text-muted-foreground">PO #:</span>
                              <span className="ml-1 font-medium">{job.poNumber}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Qty:</span>
                            <span className="ml-1 font-medium">{job.quantity}</span>
                          </div>
                          {job.requiredDispatchDate && (
                            <div>
                              <span className="text-muted-foreground">Due:</span>
                              <span className={`ml-1 font-medium ${isOverdue ? 'text-destructive' : isDueToday ? 'text-amber-600' : ''}`}>
                                {format(new Date(job.requiredDispatchDate), 'dd/MM/yyyy')}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {job.lineItems && job.lineItems.length > 0 ? (
                          <div className="pt-2 border-t space-y-1">
                            {job.lineItems.filter(lineItemMatchesFilter).map((lineItem, idx) => (
                              <div key={lineItem.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">
                                  Line {idx + 1}: {lineItem.quantity} items
                                </span>
                                <span className="font-medium text-right">
                                  {lineItem.machineId ? getMachineName(lineItem.machineId) : 'Not assigned'}
                                  {getOperatorName(lineItem) && (
                                    <span className="block text-muted-foreground font-normal">
                                      {getOperatorName(lineItem)}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="pt-2 border-t">
                            <span className="text-amber-600 text-xs">Needs line items - edit to add</span>
                          </div>
                        )}
                        
                        {/* Error indicator for mobile */}
                        <div className="pt-2 border-t flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Errors:</span>
                          <JobErrorsDialog
                            jobId={job.id}
                            jobName={job.jobName}
                            users={users}
                            staff={staff}
                            trigger={
                              (errorsByJobId[job.id] || []).length > 0 ? (
                                <JobErrorBadge errors={errorsByJobId[job.id] || []} />
                              ) : (
                                <Button variant="ghost" size="sm" className="h-6 text-xs">
                                  + Add
                                </Button>
                              )
                            }
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
              
              {/* Desktop Table View */}
              <div className="hidden md:block border rounded-md overflow-hidden" data-testid="table-production-queue">
                <div className="overflow-auto max-h-[calc(100vh-260px)] [&>div]:overflow-visible">
                  <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-20 [&_th]:bg-muted">
                    <TableRow className="text-xs text-muted-foreground uppercase tracking-wider">
                      <TableHead className="py-3 px-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={displayedJobs.length > 0 && displayedJobs.every(j => selectedJobIds.has(j.id))}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setSelectedJobIds(new Set(displayedJobs.map(j => j.id)));
                            } else {
                              setSelectedJobIds(new Set());
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-muted-foreground cursor-pointer"
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead 
                        className="py-3 px-3 cursor-pointer hover-elevate select-none" 
                        onClick={() => setSortOrder('customer')}
                        data-testid="header-customer"
                      >
                        <div className="flex items-center gap-1">
                          Customer
                          {sortOrder === 'customer' && <ArrowUpDown className="h-3 w-3" />}
                        </div>
                      </TableHead>
                      <TableHead className="py-3 px-3">Job</TableHead>
                      <TableHead 
                        className="py-3 px-3 cursor-pointer hover-elevate select-none" 
                        onClick={() => setSortOrder('jobNumber')}
                        data-testid="header-job-number"
                      >
                        <div className="flex items-center gap-1">
                          Job #
                          {sortOrder === 'jobNumber' && <ArrowUpDown className="h-3 w-3" />}
                        </div>
                      </TableHead>
                      <TableHead className="py-3 px-3">PO #</TableHead>
                      <TableHead className="py-3 px-3">Qty</TableHead>
                      <TableHead className="py-3 px-3">Machine</TableHead>
                      <TableHead className="py-3 px-3">Staff</TableHead>
                      <TableHead className="py-3 px-3">Production</TableHead>
                      {canViewPrices(currentUser?.role) && (
                        <TableHead className="py-3 px-3">Price</TableHead>
                      )}
                      <TableHead 
                        className="py-3 px-3 cursor-pointer hover-elevate select-none" 
                        onClick={() => setSortOrder('date')}
                        data-testid="header-date-required"
                      >
                        <div className="flex items-center gap-1">
                          Date Required
                          {sortOrder === 'date' && <ArrowUpDown className="h-3 w-3" />}
                        </div>
                      </TableHead>
                      <TableHead className="py-3 px-3">Submitted</TableHead>
                      <TableHead className="py-3 px-3">Status</TableHead>
                      <TableHead className="py-3 px-3">Actions</TableHead>
                      <TableHead className="py-3 px-3">Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedJobs.flatMap((job) => {
                      const customer = customers.find(c => c.id === job.customerId);
                      if (!customer) return [];
                      
                      // Check if all line items have logo approved
                      const allLogosApproved = job.lineItems && job.lineItems.length > 0 
                        ? job.lineItems.every(item => item.logoApproved === true)
                        : false;
                      
                      // Get errors for this job
                      const jobErrors = errorsByJobId[job.id] || [];
                      
                      // If no line items, show a summary row for the job with edit capability
                      if (!job.lineItems || job.lineItems.length === 0) {
                        const isOverdue = job.requiredDispatchDate && isPast(startOfDay(new Date(job.requiredDispatchDate))) && !isToday(new Date(job.requiredDispatchDate));
                        const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));
                        const colorClass = getCustomerColorClasses(job.customerId);
                        
                        return (
                          <TableRow 
                            key={job.id} 
                            className={`${colorClass} ${isOverdue ? 'bg-red-50 dark:bg-red-950/30' : isDueToday ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}
                            data-testid={`row-job-no-items-${job.id}`}
                          >
                            <TableCell className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={selectedJobIds.has(job.id)}
                                onChange={() => {
                                  const newSelected = new Set(selectedJobIds);
                                  if (newSelected.has(job.id)) {
                                    newSelected.delete(job.id);
                                  } else {
                                    newSelected.add(job.id);
                                  }
                                  setSelectedJobIds(newSelected);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              <DemoText className="font-medium">{job.customerName}</DemoText>
                            </TableCell>
                            <TableCell className="py-2 px-3 font-medium"><DemoText>{job.jobName}</DemoText></TableCell>
                            <TableCell className="py-2 px-3">
                              <span className="text-xs font-mono">
                                {job.jobNumber || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="py-2 px-3">{job.poNumber || '-'}</TableCell>
                            <TableCell className="py-2 px-3 text-center">{job.quantity || 0}</TableCell>
                            <TableCell className="py-2 px-3 text-center">-</TableCell>
                            <TableCell className="py-2 px-3 text-center">-</TableCell>
                            {canViewPrices(currentUser?.role) && <TableCell className="py-2 px-3">-</TableCell>}
                            <TableCell className="py-2 px-3">
                              {job.goodsReceived 
                                ? format(new Date(job.goodsReceived), 'dd/MM/yy') 
                                : <span className="text-amber-600">Awaiting</span>}
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              {job.requiredDispatchDate 
                                ? format(new Date(job.requiredDispatchDate), 'dd/MM/yy')
                                : '-'}
                            </TableCell>
                            <TableCell className="py-2 px-3 whitespace-nowrap">
                              {job.submittedAt ? (
                                <div className="flex flex-col">
                                  <span className="text-xs font-mono">{format(new Date(job.submittedAt), 'd MMM yy')}</span>
                                  <span className="text-[10px] text-muted-foreground">{format(new Date(job.submittedAt), 'HH:mm')}</span>
                                </div>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              <span className="text-amber-600 text-xs">Needs line items</span>
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 relative"
                                  onClick={() => setLocation(`/messages?jobId=${job.id}`)}
                                  data-testid={`button-messages-${job.id}`}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  {!!(unreadByJobId[job.id] && unreadByJobId[job.id] > 0) && (
                                    <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
                                  )}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-actions-${job.id}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEdit(job.id)} data-testid={`menu-edit-${job.id}`}>
                                      Edit Job
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete this job: ${job.jobName}?`)) {
                                          deleteJobMutation.mutate(job.id);
                                        }
                                      }}
                                      className="text-destructive"
                                      data-testid={`menu-delete-${job.id}`}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              <JobErrorsDialog
                                jobId={job.id}
                                jobName={job.jobName}
                                users={users}
                                staff={staff}
                                trigger={
                                  <Button variant="ghost" size="sm" className="h-6 text-xs opacity-50 hover:opacity-100">
                                    +
                                  </Button>
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      }
                      
                      // Render a row for each line item that matches the active
                      // machine/operator filter (so only matching rows show).
                      return job.lineItems.filter(lineItemMatchesFilter).map((lineItem, index) => (
                        <LineItemRow
                          key={lineItem.id}
                          jobId={job.id}
                          jobNumber={job.jobNumber}
                          customerId={job.customerId}
                          customerName={job.customerName}
                          jobName={job.jobName}
                          poNumber={job.poNumber}
                          totalJobQuantity={job.quantity}
                          lineItemCount={job.lineItems!.length}
                          lineItemIndex={index}
                          lineItem={lineItem}
                          goodsReceived={job.goodsReceived ? new Date(job.goodsReceived) : null}
                          requiredDispatchDate={job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : null}
                          submittedAt={job.submittedAt ? new Date(job.submittedAt) : null}
                          completedOnTime={job.completedOnTime}
                          notes={job.notes}
                          allLogosApproved={allLogosApproved}
                          customer={customer}
                          showPrices={canViewPrices(currentUser?.role)}
                          isSelected={selectedJobIds.has(job.id)}
                          onToggleSelect={(jobId) => {
                            const newSelected = new Set(selectedJobIds);
                            if (newSelected.has(jobId)) {
                              newSelected.delete(jobId);
                            } else {
                              newSelected.add(jobId);
                            }
                            setSelectedJobIds(newSelected);
                          }}
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
                          onOpenMessages={() => setLocation(`/messages?jobId=${job.id}`)}
                          hasUnreadMessages={!!(unreadByJobId[job.id] && unreadByJobId[job.id] > 0)}
                          operatorName={getOperatorName(lineItem)}
                          onRecordProduction={(li) => {
                            setRecordingProductionItem({ lineItem: li, jobName: job.jobName });
                          }}
                          errorsSlot={
                            <JobErrorsDialog
                              jobId={job.id}
                              jobName={job.jobName}
                              users={users}
                              staff={staff}
                              trigger={
                                jobErrors.length > 0 ? (
                                  <JobErrorBadge errors={jobErrors} />
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-6 text-xs opacity-50 hover:opacity-100">
                                    +
                                  </Button>
                                )
                              }
                            />
                          }
                        />
                      ));
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            </>
          )}
        </div>
        )}

        {/* Logo Set-Up Queue - shown when viewMode is 'setups' */}
        {viewMode === 'setups' && (
          <div className="mb-6" data-testid="section-logo-setups">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Embroidery Set-Up Queue
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredLogoSetups.length} of {pendingLogoSetups.length} pending set-ups
                </p>
              </div>
              <LogoSetupDialog
                trigger={
                  <Button variant="outline" size="sm" data-testid="button-add-logo-setup">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Set-Up
                  </Button>
                }
                customers={activeCustomers}
              />
            </div>
            {filteredLogoSetups.length > 0 ? (
              <div className="space-y-2">
                {filteredLogoSetups.map((setup) => {
                    const customer = customers.find(c => c.id === setup.customerId);
                    return (
                      <div
                        key={setup.id}
                        className="flex items-center justify-between bg-card border rounded-md p-4"
                        data-testid={`logo-setup-${setup.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <DemoText className="font-medium">{customer?.name || "Unknown Customer"}</DemoText>
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
                            Approve (£12)
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
            ) : (
              <div className="border rounded-md p-8 text-center text-muted-foreground">
                {searchTerm && pendingLogoSetups.length > 0 
                  ? `No set-ups match "${searchTerm}"`
                  : "No pending set-ups"}
              </div>
            )}

            {/* Completed Set-ups collapsible section */}
            <div className="mt-6">
              <button
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCompletedSetups(v => !v)}
                data-testid="button-toggle-completed-setups"
              >
                {showCompletedSetups ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Completed Set-ups ({completedLogoSetups.length})
              </button>

              {showCompletedSetups && (
                <div className="mt-3 space-y-2">
                  {completedLogoSetups.length === 0 ? (
                    <div className="border rounded-md p-6 text-center text-muted-foreground text-sm">
                      No completed set-ups yet
                    </div>
                  ) : (
                    completedLogoSetups.map((setup) => {
                      const customer = customers.find(c => c.id === setup.customerId);
                      return (
                        <div
                          key={setup.id}
                          className="flex items-center justify-between bg-muted/40 border rounded-md p-4"
                          data-testid={`completed-setup-${setup.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <DemoText className="font-medium">{customer?.name || "Unknown Customer"}</DemoText>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-sm">{setup.jobName}</span>
                            </div>
                            {setup.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{setup.notes}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Invoiced {setup.invoicedAt ? format(new Date(setup.invoicedAt), "MMM d, yyyy") : "—"}
                              {setup.invoiceReference && <span className="ml-2 font-mono">{setup.invoiceReference}</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground border rounded px-2 py-1">Invoiced £12</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Completed Orders Section - shown when viewMode is 'completed' */}
        {viewMode === 'completed' && (
          <div className="mb-6" data-testid="section-completed-orders">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Completed Orders
                </h2>
                <p className="text-xs text-muted-foreground">
                  {filteredCompletedJobs.length} of {allCompletedJobs.length} orders
                  {awaitingDespatchCount > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-500" data-testid="text-awaiting-despatch-count">
                      · {awaitingDespatchCount} awaiting despatch
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="border rounded-md">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="py-1 px-2">Customer</TableHead>
                    <TableHead className="py-1 px-2 w-[60px]">Job #</TableHead>
                    <TableHead className="py-1 px-2">Job Name</TableHead>
                    <TableHead className="py-1 px-2 w-[50px] text-right">Qty</TableHead>
                    <TableHead className="py-1 px-2 w-[80px]">Dispatched</TableHead>
                    <TableHead className="py-1 px-2 w-[100px]">Tracking</TableHead>
                    <TableHead className="py-1 px-2 w-[60px]">Files</TableHead>
                    <TableHead className="py-1 px-2 w-[70px]">Errors</TableHead>
                    <TableHead className="py-1 px-2 w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCompletedJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4 text-muted-foreground text-sm">
                        {searchTerm ? `No completed orders match "${searchTerm}"` : "No completed orders yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedCompletedJobs.map((job) => {
                      const totalQty = job.lineItems?.reduce((sum, li) => sum + li.quantity, 0) || job.quantity;
                      const completedTimes = (job.lineItems ?? [])
                        .map(li => li.completedAt ? new Date(li.completedAt).getTime() : null)
                        .filter((t): t is number => t !== null && !isNaN(t));
                      const completedDate = completedTimes.length ? new Date(Math.max(...completedTimes)) : null;
                      
                      return (
                        <TableRow 
                          key={job.id} 
                          className="h-8 hover-elevate"
                          data-testid={`row-completed-job-${job.id}`}
                        >
                          <TableCell className="py-1 px-2 font-medium truncate max-w-[150px]">
                            <DemoText>{job.customerName}</DemoText>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-muted-foreground">
                            #{job.jobNumber}
                          </TableCell>
                          <TableCell className="py-1 px-2 max-w-[220px]">
                            <div className="flex items-center gap-1">
                              <span className="truncate">
                                <DemoText>{job.jobName}</DemoText>
                                {job.poNumber && <span className="text-muted-foreground ml-1">({job.poNumber})</span>}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0"
                                onClick={() => handleEdit(job.id)}
                                data-testid={`button-edit-completed-${job.id}`}
                                title="Edit job"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">{totalQty}</TableCell>
                          <TableCell className="py-1 px-2 text-xs text-muted-foreground">
                            {completedDate ? format(completedDate, 'dd MMM') : '-'}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {job.dhlTrackingNumber ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2 font-mono"
                                onClick={() => {
                                  const fullJob = jobs.find(j => j.id === job.id);
                                  if (fullJob) setEditingTrackingJob(fullJob);
                                }}
                                data-testid={`button-edit-tracking-${job.id}`}
                                title={job.dhlTrackingNumber}
                              >
                                <Truck className="h-3 w-3 mr-1" />
                                {job.dhlTrackingNumber.slice(-8)}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  const fullJob = jobs.find(j => j.id === job.id);
                                  if (fullJob) {
                                    setDpdJustBooked(false);
                                    setDpdBatchJobs([]);
                                    setDpdBookingJob(fullJob);
                                  }
                                }}
                                data-testid={`button-book-dpd-${job.id}`}
                              >
                                <Truck className="h-3 w-3 mr-1" />
                                Book DPD
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => setFilesDialogJob({ id: job.id, jobName: job.jobName, jobNumber: job.jobNumber })}
                              data-testid={`button-files-completed-${job.id}`}
                            >
                              <Paperclip className="h-3 w-3 mr-1" />
                              Files
                            </Button>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <JobErrorsDialog
                              jobId={job.id}
                              jobName={job.jobName}
                              users={users}
                              staff={staff}
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/jobs/${job.id}`, { credentials: 'include' });
                                  if (response.ok) {
                                    const fullJob = await response.json();
                                    setWorksheetJob(fullJob);
                                  }
                                } catch (error) {
                                  console.error('Failed to fetch job for worksheet:', error);
                                }
                              }}
                              data-testid={`button-worksheet-completed-${job.id}`}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Sheet
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <JobEditDialog
          open={editingJob !== null}
          onOpenChange={(open) => !open && setEditingJob(null)}
          job={editingJob ? {
            ...editingJob,
            goodsReceived: editingJob.goodsReceived ? new Date(editingJob.goodsReceived) : null,
            requiredDispatchDate: editingJob.requiredDispatchDate ? new Date(editingJob.requiredDispatchDate) : null,
          } : null}
          customers={activeCustomers}
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

        <EditTrackingDialog
          open={editingTrackingJob !== null}
          onOpenChange={(open) => !open && setEditingTrackingJob(null)}
          currentTrackingNumber={editingTrackingJob?.dhlTrackingNumber}
          jobName={editingTrackingJob?.jobName}
          isPending={updateJobMutation.isPending}
          onSubmit={(data) => {
            if (editingTrackingJob) {
              updateJobMutation.mutate({
                id: editingTrackingJob.id,
                data: { dhlTrackingNumber: data.dhlTrackingNumber || null }
              }, {
                onSuccess: () => {
                  setEditingTrackingJob(null);
                  toast({
                    title: "Success",
                    description: "Tracking number updated",
                  });
                }
              });
            }
          }}
        />

        {recordingProductionItem && (
          <RecordProductionDialog
            open={recordingProductionItem !== null}
            onOpenChange={(open) => !open && setRecordingProductionItem(null)}
            lineItem={recordingProductionItem.lineItem}
            jobName={recordingProductionItem.jobName}
            currentUserId={currentUser?.id}
          />
        )}

        <BulkCompleteDialog
          open={bulkCompleteOpen}
          onOpenChange={setBulkCompleteOpen}
          items={bulkCompleteItems}
          staff={staff}
          onSuccess={() => {
            const justCompleted = jobsWithCustomers.filter((j) => selectedJobIds.has(j.id));
            setSelectedJobIds(new Set());
            const needingShipping = justCompleted
              .filter((j) => !j.dhlTrackingNumber)
              .map((j) => ({ id: j.id, jobName: j.jobName, jobNumber: j.jobNumber, customerId: j.customerId }));
            if (needingShipping.length > 0) {
              setDpdShipPrompt(needingShipping);
            }
          }}
        />

        <AlertDialog open={dpdShipPrompt !== null} onOpenChange={(open) => { if (!open) setDpdShipPrompt(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ship now or hold for consolidation?</AlertDialogTitle>
              <AlertDialogDescription>
                {dpdShipPrompt?.length === 1
                  ? "This order is complete. Book DPD now, or hold it to ship together with the customer's other orders later?"
                  : `${dpdShipPrompt?.length ?? 0} orders are complete. Book DPD now, or hold them to ship together with other orders later?`}
                {" "}Held orders stay in the Completed section marked as awaiting despatch — use their Book DPD button whenever you're ready.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => setDpdShipPrompt(null)}
                data-testid="button-hold-despatch"
              >
                <Package className="h-4 w-4 mr-2" />
                Hold — awaiting despatch
              </Button>
              <Button
                onClick={() => {
                  const batch = dpdShipPrompt ?? [];
                  setDpdShipPrompt(null);
                  if (batch.length > 0) {
                    const firstJob = jobs.find((j) => j.id === batch[0].id);
                    if (firstJob) {
                      setDpdBatchJobs(batch);
                      setDpdJustBooked(false);
                      setDpdBookingJob(firstJob);
                    }
                  }
                }}
                data-testid="button-ship-now"
              >
                <Truck className="h-4 w-4 mr-2" />
                Book DPD now
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <JobFilesDialog
          job={filesDialogJob}
          onClose={() => setFilesDialogJob(null)}
        />

        {dpdBookingJob && (() => {
          const customer = customers.find(c => c.id === dpdBookingJob.customerId);
          const otherJobs = allCompletedJobs.filter(j =>
            j.customerId === dpdBookingJob.customerId &&
            j.id !== dpdBookingJob.id &&
            !j.dhlTrackingNumber &&
            j.invoiceStatus === 'ready'
          );
          const batchSameCustomer = dpdBatchJobs.filter(b =>
            b.customerId === dpdBookingJob.customerId &&
            b.id !== dpdBookingJob.id &&
            !otherJobs.some(j => j.id === b.id)
          );
          const combinedOtherJobs = [
            ...otherJobs.map(j => ({ id: j.id, jobName: j.jobName, jobNumber: j.jobNumber })),
            ...batchSameCustomer.map(b => ({ id: b.id, jobName: b.jobName, jobNumber: b.jobNumber })),
          ];
          const advanceToNextBatchJob = () => {
            // Remove this customer's jobs from the batch, then open the next customer's booking (if any)
            const remaining = dpdBatchJobs.filter(b => b.customerId !== dpdBookingJob.customerId);
            setDpdBatchJobs(remaining);
            if (remaining.length > 0) {
              const nextJob = jobs.find(j => j.id === remaining[0].id);
              setDpdBookingJob(nextJob ?? null);
            } else {
              setDpdBookingJob(null);
            }
          };
          return (
            <DpdBookingDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) {
                  if (dpdJustBooked) {
                    // Booked & closed the print screen — move on to the next customer in the batch
                    setDpdJustBooked(false);
                    advanceToNextBatchJob();
                  } else {
                    // Cancelled — stop the batch flow entirely
                    setDpdBookingJob(null);
                    setDpdBatchJobs([]);
                  }
                }
              }}
              jobId={dpdBookingJob.id}
              jobReference={dpdBookingJob.poNumber || dpdBookingJob.jobName}
              prefillName={customer?.name}
              prefillAddress={customer?.address ?? undefined}
              prefillPhone={customer?.telephone ?? undefined}
              prefillEmail={customer?.email ?? undefined}
              otherJobs={combinedOtherJobs}
              onSuccess={() => setDpdJustBooked(true)}
            />
          );
        })()}
      </div>
    </div>
  );
}

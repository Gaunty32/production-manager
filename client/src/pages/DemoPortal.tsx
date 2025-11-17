import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Clock, CheckCircle2, AlertCircle, Circle, CircleCheck, CircleX, Search, ArrowUpDown, Plus, FileText } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadMagnetModal } from "@/components/LeadMagnetModal";

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

export default function DemoPortal() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "jobName" | "quantity">("date");

  const { data: jobs = [], isLoading: isLoadingJobs, isError, error } = useQuery<Job[]>({
    queryKey: ["/api/demo/customer/jobs"],
  });

  // Debug logging
  console.log('=== DEMO PORTAL DEBUG ===');
  console.log('Jobs Count:', jobs?.length);
  console.log('Is Loading:', isLoadingJobs);
  console.log('Is Error:', isError);
  console.log('Error:', error instanceof Error ? error.message : error);
  console.log('First Job:', jobs?.[0]);
  console.log('========================');

  const handleDemoAction = () => {
    toast({
      title: "Demo Mode",
      description: "Sign up for a free account to access this feature",
      variant: "default",
    });
  };

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
          const aQty = a.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || a.quantity;
          const bQty = b.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || b.quantity;
          return bQty - aQty;
        
        case "date":
        default:
          if (!a.requiredDispatchDate && !b.requiredDispatchDate) return 0;
          if (!a.requiredDispatchDate) return 1;
          if (!b.requiredDispatchDate) return -1;
          return new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
      }
    });

  const inProgressCount = jobs.filter(j => !j.completed).length;
  const completedCount = jobs.filter(j => j.completed).length;

  const getStatusBadge = (job: Job) => {
    if (job.completed) {
      return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" data-testid={`badge-status-${job.id}`}>Completed</Badge>;
    }
    if (job.status === "production") {
      return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" data-testid={`badge-status-${job.id}`}>In Production</Badge>;
    }
    return <Badge variant="secondary" data-testid={`badge-status-${job.id}`}>{job.status}</Badge>;
  };

  const getGoodsReceivedIcon = (goodsReceived: string | null) => {
    if (goodsReceived) {
      return <CircleCheck className="h-4 w-4 text-green-600 dark:text-green-400" />;
    }
    return <CircleX className="h-4 w-4 text-red-600 dark:text-red-400" />;
  };

  const getLogoApprovalIcon = (logoApproved: boolean) => {
    if (logoApproved) {
      return <CircleCheck className="h-4 w-4 text-green-600 dark:text-green-400" />;
    }
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <LeadMagnetModal delaySeconds={10} />
      
      {/* Demo Banner */}
      <div className="bg-primary text-primary-foreground py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <Package className="h-5 w-5" />
          <span className="font-semibold">Demo Customer Portal</span>
          <span className="text-primary-foreground/80">• View-only demonstration</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-demo-portal">Customer Portal Demo</h1>
              <p className="text-muted-foreground mt-1">
                Track your orders in real-time with our production management system
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDemoAction}
                data-testid="button-submit-job"
              >
                <Plus className="h-4 w-4 mr-2" />
                Submit New Job
              </Button>
              <Button
                variant="outline"
                onClick={handleDemoAction}
                data-testid="button-pending-submissions"
              >
                <FileText className="h-4 w-4 mr-2" />
                Pending Submissions
              </Button>
            </div>
          </div>
        </div>

        {/* Error State - Staff users can't access demo */}
        {isError && (
          <Card className="mb-6 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Access Restricted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Staff users cannot access the demo portal. Please log out to view the public demo, or visit the main production queue instead.
              </p>
              <div className="mt-4">
                <Button variant="outline" onClick={() => window.location.href = '/logout'}>
                  Log Out
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoadingJobs && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Clock className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold">Loading demo data...</p>
                <p className="text-sm text-muted-foreground mt-2">Fetching sample orders from our production system</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-orders">{jobs.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Production</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-in-production">{inProgressCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-completed">{completedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search orders, PO numbers, descriptions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-sort">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Production Date</SelectItem>
                    <SelectItem value="jobName">Job Name (A-Z)</SelectItem>
                    <SelectItem value="quantity">Quantity (Largest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)} className="mb-6">
          <TabsList className="grid w-full md:w-auto md:inline-grid grid-cols-3">
            <TabsTrigger value="in_progress" data-testid="tab-in-progress">
              In Progress ({inProgressCount})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({completedCount})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All ({jobs.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Jobs Table - Desktop */}
        <div className="hidden md:block">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Goods In</TableHead>
                  <TableHead className="text-center">Logo</TableHead>
                  <TableHead>Production Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingJobs ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "No orders match your search" : "No orders found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => {
                    const lineItems = job.lineItems || [];
                    
                    return lineItems.map((item, index) => {
                      const isOverdue = job.requiredDispatchDate && isPast(new Date(job.requiredDispatchDate)) && !isToday(new Date(job.requiredDispatchDate));
                      const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));
                      
                      return (
                        <TableRow
                          key={`${job.id}-${item.id}`}
                          className={
                            isOverdue && !job.completed
                              ? "bg-red-50 dark:bg-red-950/20"
                              : isDueToday && !job.completed
                              ? "bg-amber-50 dark:bg-amber-950/20"
                              : ""
                          }
                          data-testid={`row-job-${job.id}-item-${index}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-job-name-${job.id}-${index}`}>
                            {index === 0 ? job.jobName : ""}
                          </TableCell>
                          <TableCell data-testid={`text-job-type-${job.id}-${index}`}>{item.jobType}</TableCell>
                          <TableCell className="font-mono" data-testid={`text-quantity-${job.id}-${index}`}>{item.quantity}</TableCell>
                          <TableCell className="max-w-xs truncate" data-testid={`text-description-${job.id}-${index}`}>
                            {item.description || "-"}
                          </TableCell>
                          <TableCell className="text-center" data-testid={`icon-goods-received-${job.id}-${index}`}>
                            {getGoodsReceivedIcon(job.goodsReceived)}
                          </TableCell>
                          <TableCell className="text-center" data-testid={`icon-logo-approved-${job.id}-${index}`}>
                            {getLogoApprovalIcon(item.logoApproved)}
                          </TableCell>
                          <TableCell data-testid={`text-dispatch-date-${job.id}-${index}`}>
                            {job.requiredDispatchDate ? (
                              <span className={isOverdue && !job.completed ? "text-red-600 dark:text-red-400 font-semibold" : isDueToday && !job.completed ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                                {format(new Date(job.requiredDispatchDate), "dd/MM/yyyy")}
                              </span>
                            ) : (
                              "TBA"
                            )}
                          </TableCell>
                          <TableCell data-testid={`badge-job-status-${job.id}-${index}`}>
                            {getStatusBadge(job)}
                          </TableCell>
                          <TableCell className="font-mono text-sm" data-testid={`text-po-number-${job.id}-${index}`}>
                            {index === 0 ? (job.poNumber || "-") : ""}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-muted-foreground" data-testid={`text-notes-${job.id}-${index}`}>
                            {index === 0 ? (job.notes || "") : ""}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Jobs Cards - Mobile */}
        <div className="md:hidden space-y-4">
          {isLoadingJobs ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading orders...
              </CardContent>
            </Card>
          ) : filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {searchTerm ? "No orders match your search" : "No orders found"}
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => {
              const lineItems = job.lineItems || [];
              const isOverdue = job.requiredDispatchDate && isPast(new Date(job.requiredDispatchDate)) && !isToday(new Date(job.requiredDispatchDate));
              const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));
              
              return (
                <Card
                  key={job.id}
                  className={
                    isOverdue && !job.completed
                      ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                      : isDueToday && !job.completed
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                      : ""
                  }
                  data-testid={`card-job-${job.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg" data-testid={`text-mobile-job-name-${job.id}`}>
                          {job.jobName}
                        </CardTitle>
                        {job.poNumber && (
                          <p className="text-sm text-muted-foreground font-mono mt-1" data-testid={`text-mobile-po-${job.id}`}>
                            PO: {job.poNumber}
                          </p>
                        )}
                      </div>
                      {getStatusBadge(job)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Production Date:</span>
                      <span className={`font-medium ${isOverdue && !job.completed ? "text-red-600 dark:text-red-400" : isDueToday && !job.completed ? "text-amber-600 dark:text-amber-400" : ""}`} data-testid={`text-mobile-dispatch-${job.id}`}>
                        {job.requiredDispatchDate ? format(new Date(job.requiredDispatchDate), "dd/MM/yyyy") : "TBA"}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Goods In:</span>
                        {getGoodsReceivedIcon(job.goodsReceived)}
                      </div>
                    </div>

                    {lineItems.length > 0 && (
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-sm font-medium">Line Items:</p>
                        {lineItems.map((item, index) => (
                          <div key={item.id} className="flex items-start gap-2 text-sm bg-muted/50 p-2 rounded" data-testid={`mobile-line-item-${job.id}-${index}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.jobType}</span>
                                <span className="text-muted-foreground">×</span>
                                <span className="font-mono">{item.quantity}</span>
                                {getLogoApprovalIcon(item.logoApproved)}
                              </div>
                              {item.description && (
                                <p className="text-muted-foreground text-xs mt-1">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {job.notes && (
                      <div className="border-t pt-3">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Notes:</span> {job.notes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

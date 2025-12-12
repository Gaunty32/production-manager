import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FileText, Calendar, Package, Link as LinkIcon, AlertCircle, Truck, Palette, Search, Pencil } from "lucide-react";
import { format } from "date-fns";
import { calculateJobPrice, formatPrice, calculateShippingCost } from "@shared/pricing";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { canViewPrices, type Job, type Customer, type LogoSetup } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LineItem {
  id: string;
  jobId: string;
  jobType: string;
  quantity: number;
  description: string | null;
  stitchCount: number;
  logoApproved: boolean;
  completed: boolean;
}

interface EditShippingState {
  jobId: string;
  dhlTrackingNumber: string;
  packageCount: number | undefined;
  packageType: "boxes" | "bags" | undefined;
}

interface EditLineItemsState {
  jobId: string;
  jobName: string;
  lineItems: LineItem[];
}

export default function InvoicingQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null);
  const [connectingXero, setConnectingXero] = useState(false);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [manualShippingCosts, setManualShippingCosts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [editingShipping, setEditingShipping] = useState<EditShippingState | null>(null);
  const [editingLineItems, setEditingLineItems] = useState<EditLineItemsState | null>(null);
  const [editedLineItems, setEditedLineItems] = useState<Record<string, { stitchCount: number }>>({});

  const updateLineItemMutation = useMutation({
    mutationFn: async (data: { lineItemId: string; stitchCount: number }) => {
      return apiRequest("PATCH", `/api/job-line-items/${data.lineItemId}`, { stitchCount: data.stitchCount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-line-items"] });
    },
    onError: (error) => {
      toast({ title: "Update Failed", description: error instanceof Error ? error.message : "Failed to update line item", variant: "destructive" });
    },
  });

  const handleSaveLineItems = async () => {
    if (!editingLineItems) return;
    
    try {
      const updates = Object.entries(editedLineItems).map(([lineItemId, data]) => 
        updateLineItemMutation.mutateAsync({ lineItemId, stitchCount: data.stitchCount })
      );
      await Promise.all(updates);
      toast({ title: "Line Items Updated", description: "Line items have been updated successfully." });
      setEditingLineItems(null);
      setEditedLineItems({});
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const updateShippingMutation = useMutation({
    mutationFn: async (data: { jobId: string; dhlTrackingNumber?: string; packageCount?: number; packageType?: string }) => {
      const { jobId, ...updates } = data;
      const shippingCostResult = updates.packageType && updates.packageCount 
        ? calculateShippingCost(updates.packageType as "boxes" | "bags", updates.packageCount)
        : undefined;
      const shippingCost = shippingCostResult?.cost !== undefined 
        ? (typeof shippingCostResult.cost === 'number' ? shippingCostResult.cost.toString() : shippingCostResult.cost)
        : undefined;
      return apiRequest("PATCH", `/api/jobs/${jobId}`, { ...updates, shippingCost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Shipping Updated", description: "Shipping information has been updated successfully." });
      setEditingShipping(null);
    },
    onError: (error) => {
      toast({ title: "Update Failed", description: error instanceof Error ? error.message : "Failed to update shipping information", variant: "destructive" });
    },
  });
  
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allLineItems = [] } = useQuery<LineItem[]>({
    queryKey: ["/api/job-line-items"],
  });

  const { data: logoSetups = [] } = useQuery<LogoSetup[]>({
    queryKey: ["/api/logo-setups"],
  });

  useEffect(() => {
    console.log("All line items loaded:", allLineItems);
  }, [allLineItems]);

  const { data: xeroStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/xero/auth/status"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('xero') === 'connected') {
      toast({
        title: "Xero Connected",
        description: "Successfully connected to Xero. You can now create invoices.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xero/auth/status"] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('xero') === 'error') {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Xero. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  // Filter jobs ready for invoicing
  const readyJobs = jobs.filter(job => job.invoiceStatus === 'ready');

  // Group jobs by customer
  const jobsByCustomer = readyJobs.reduce((acc, job) => {
    if (!acc[job.customerId]) {
      acc[job.customerId] = [];
    }
    acc[job.customerId].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  // Filter customers by search term and sort alphabetically
  const filteredJobsByCustomer = Object.entries(jobsByCustomer)
    .reduce((acc, [customerId, customerJobs]) => {
      const customer = customers.find(c => c.id === customerId);
      if (customer && customer.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        acc[customerId] = customerJobs;
      }
      return acc;
    }, {} as Record<string, Job[]>);
  
  // Sort customer IDs alphabetically by customer name
  const sortedCustomerIds = Object.keys(filteredJobsByCustomer).sort((a, b) => {
    const customerA = customers.find(c => c.id === a);
    const customerB = customers.find(c => c.id === b);
    return (customerA?.name || '').localeCompare(customerB?.name || '');
  });

  const toggleJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const toggleAllJobsForCustomer = (customerId: string) => {
    const customerJobs = jobsByCustomer[customerId] || [];
    const allSelected = customerJobs.every(job => selectedJobs.has(job.id));
    
    const newSelected = new Set(selectedJobs);
    customerJobs.forEach(job => {
      if (allSelected) {
        newSelected.delete(job.id);
      } else {
        newSelected.add(job.id);
      }
    });
    setSelectedJobs(newSelected);
  };

  const getJobLineItems = (jobId: string) => {
    return allLineItems.filter(item => item.jobId === jobId);
  };

  const getCustomerApprovedLogos = (customerId: string) => {
    return logoSetups.filter(ls => ls.customerId === customerId && ls.approved && ls.approvedAt);
  };

  const needsManualPrice = (lineItem: LineItem) => {
    return lineItem.quantity >= 1000 || lineItem.stitchCount >= 50000;
  };

  const getJobPrice = (job: Job) => {
    const customer = customers.find(c => c.id === job.customerId);
    if (!customer) {
      console.log(`No customer found for job ${job.id}`);
      return null;
    }

    const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
    if (!pricingTable) {
      console.log(`No pricing table for customer ${customer.name}`);
      return null;
    }

    const lineItems = getJobLineItems(job.id);
    console.log(`Job ${job.jobName}: Found ${lineItems.length} line items`, lineItems);
    
    if (lineItems.length === 0) {
      console.log(`No line items found for job ${job.id}`);
      return null;
    }
    
    try {
      console.log(`Calling calculateJobPrice with:`, { lineItems, pricingTable });
      const result = calculateJobPrice(lineItems, pricingTable);
      console.log(`Price calculation result for ${job.jobName}:`, result);
      return result?.totalPrice || null;
    } catch (error) {
      console.error(`Failed to calculate job price for ${job.jobName}:`, error);
      console.error(`Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack',
        lineItems,
        pricingTable
      });
      return null;
    }
  };

  const getTotalPrice = (customerJobs: Job[]): number | "POA" | "TBA" | null => {
    const selectedCustomerJobs = customerJobs.filter(job => selectedJobs.has(job.id));
    if (selectedCustomerJobs.length === 0) return null;
    
    let total = 0;
    let hasPOA = false;
    let hasTBA = false;

    selectedCustomerJobs.forEach(job => {
      const price = getJobPrice(job);
      if (price === "POA") {
        hasPOA = true;
      } else if (typeof price === 'number') {
        total += price;
      }
      
      // Add shipping cost if available
      if (job.shippingCost) {
        if (job.shippingCost === "TBA") {
          hasTBA = true;
        } else {
          const shippingCost = parseFloat(job.shippingCost);
          if (!isNaN(shippingCost)) {
            total += shippingCost;
          }
        }
      }
    });

    // Add approved logo setup charges (£10 each) if any jobs are selected for this customer
    if (selectedCustomerJobs.length > 0) {
      const customerId = selectedCustomerJobs[0].customerId;
      const approvedLogos = getCustomerApprovedLogos(customerId);
      total += approvedLogos.length * 10;
    }

    // If any item is TBA or POA, return that
    if (hasTBA) return "TBA";
    if (hasPOA) return "POA";
    
    return total;
  };

  // Calculate total value of all draft invoices (excluding shipping)
  const totalDraftInvoiceValue = (() => {
    let total = 0;
    
    readyJobs.forEach(job => {
      const price = getJobPrice(job);
      if (typeof price === 'number') {
        total += price;
      }
    });

    // Add all approved logo setups
    const allApprovedLogos = logoSetups.filter(ls => ls.approved);
    total += allApprovedLogos.length * 10;

    return total;
  })();

  const handleConnectXero = async () => {
    setConnectingXero(true);
    try {
      const response = await fetch("/api/xero/auth/connect");
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("Failed to get authorization URL");
      }
    } catch (error) {
      console.error("Error connecting to Xero:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to initiate Xero connection. Please try again.",
        variant: "destructive",
      });
      setConnectingXero(false);
    }
  };

  const handleDisconnectXero = async () => {
    try {
      const response = await apiRequest("POST", "/api/xero/auth/disconnect");
      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/xero/auth/status"] });
        toast({
          title: "Disconnected",
          description: "Successfully disconnected from Xero",
        });
      }
    } catch (error) {
      console.error("Error disconnecting from Xero:", error);
      toast({
        title: "Disconnection Failed",
        description: "Failed to disconnect from Xero. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateInvoice = async (customerId: string) => {
    const customerJobs = jobsByCustomer[customerId] || [];
    const selectedCustomerJobs = customerJobs.filter(job => selectedJobs.has(job.id));
    
    if (selectedCustomerJobs.length === 0) {
      return;
    }

    // Check if any selected job has line items that need manual pricing
    const lineItemsNeedingPrices: string[] = [];
    for (const job of selectedCustomerJobs) {
      const lineItems = getJobLineItems(job.id);
      lineItems.forEach(item => {
        if (needsManualPrice(item) && !manualPrices[item.id]) {
          lineItemsNeedingPrices.push(item.id);
        }
      });
    }

    if (lineItemsNeedingPrices.length > 0) {
      toast({
        title: "Manual Prices Required",
        description: "Please enter manual prices for all items with 1000+ units or 50,000+ stitches",
        variant: "destructive",
      });
      return;
    }

    // Check if any selected job has TBA shipping that needs manual cost
    const jobsNeedingShippingCosts: string[] = [];
    for (const job of selectedCustomerJobs) {
      if (job.shippingCost === "TBA" && !manualShippingCosts[job.id]) {
        jobsNeedingShippingCosts.push(job.id);
      }
    }

    if (jobsNeedingShippingCosts.length > 0) {
      toast({
        title: "Manual Shipping Costs Required",
        description: "Please enter shipping costs for all orders with TBA shipping",
        variant: "destructive",
      });
      return;
    }

    setCreatingInvoice(customerId);
    
    try {
      const jobIds = selectedCustomerJobs.map(job => job.id);
      
      // Build manual prices object, converting strings to numbers
      const manualPricesForAPI: Record<string, number> = {};
      Object.entries(manualPrices).forEach(([lineItemId, price]) => {
        if (price) {
          manualPricesForAPI[lineItemId] = parseFloat(price);
        }
      });
      
      // Build manual shipping costs object, converting strings to numbers
      const manualShippingForAPI: Record<string, number> = {};
      Object.entries(manualShippingCosts).forEach(([jobId, cost]) => {
        if (cost) {
          manualShippingForAPI[jobId] = parseFloat(cost);
        }
      });
      
      const response = await apiRequest("POST", "/api/xero/consolidated-invoice", {
        jobIds,
        customerId,
        manualPrices: Object.keys(manualPricesForAPI).length > 0 ? manualPricesForAPI : undefined,
        manualShippingCosts: Object.keys(manualShippingForAPI).length > 0 ? manualShippingForAPI : undefined,
      }) as unknown as { success: boolean; invoiceId: string; invoiceNumber: string | null; jobsInvoiced: number };

      toast({
        title: "Invoice Created",
        description: `Successfully created invoice for ${selectedCustomerJobs.length} ${selectedCustomerJobs.length === 1 ? 'order' : 'orders'}. Reference: ${response.invoiceNumber || response.invoiceId}`,
      });

      // Clear selected jobs for this customer
      const newSelected = new Set(selectedJobs);
      selectedCustomerJobs.forEach(job => newSelected.delete(job.id));
      setSelectedJobs(newSelected);

      // Clear manual prices and shipping costs for this customer's jobs
      const newManualPrices = { ...manualPrices };
      const newManualShipping = { ...manualShippingCosts };
      for (const job of selectedCustomerJobs) {
        const lineItems = getJobLineItems(job.id);
        lineItems.forEach(item => {
          delete newManualPrices[item.id];
        });
        delete newManualShipping[job.id];
      }
      setManualPrices(newManualPrices);
      setManualShippingCosts(newManualShipping);

      // Refresh jobs list
      await queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast({
        title: "Invoice Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create invoice in Xero",
        variant: "destructive",
      });
    } finally {
      setCreatingInvoice(null);
    }
  };

  const isLoading = jobsLoading || customersLoading;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Draft Invoicing Queue</h1>
              <p className="text-muted-foreground mt-2">
                Review and consolidate completed orders by customer for invoice generation
              </p>
            </div>
            {xeroStatus && (
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-2">
                  {xeroStatus.connected ? (
                    <>
                      <Badge variant="outline" className="gap-1.5" data-testid="badge-xero-connected">
                        <LinkIcon className="h-3.5 w-3.5" />
                        Xero Connected
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDisconnectXero}
                        data-testid="button-disconnect-xero"
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleConnectXero}
                      disabled={connectingXero}
                      data-testid="button-connect-xero"
                    >
                      {connectingXero ? "Connecting..." : "Connect to Xero"}
                    </Button>
                  )}
                </div>
                {readyJobs.length > 0 && user && canViewPrices(user.role) && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Draft Value (excl. shipping)</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-draft-value">
                      £{totalDraftInvoiceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {xeroStatus && !xeroStatus.connected && (
          <Alert className="mb-6" data-testid="alert-xero-not-connected">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect to Xero to create invoices directly from completed orders.
            </AlertDescription>
          </Alert>
        )}

        {Object.keys(jobsByCustomer).length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-customer-search"
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : Object.keys(jobsByCustomer).length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No completed jobs ready for invoicing</p>
                <p className="text-sm mt-2">Jobs will appear here once marked as complete</p>
              </div>
            </CardContent>
          </Card>
        ) : Object.keys(filteredJobsByCustomer).length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No customers found matching "{searchTerm}"</p>
                <p className="text-sm mt-2">Try a different search term</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {sortedCustomerIds.map((customerId) => {
              const customerJobs = filteredJobsByCustomer[customerId];
              const customer = customers.find(c => c.id === customerId);
              if (!customer) return null;

              const allSelected = customerJobs.every(job => selectedJobs.has(job.id));
              const someSelected = customerJobs.some(job => selectedJobs.has(job.id));
              const totalPrice = getTotalPrice(customerJobs);
              const selectedCount = customerJobs.filter(job => selectedJobs.has(job.id)).length;

              return (
                <Card key={customerId} data-testid={`invoice-group-${customerId}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleAllJobsForCustomer(customerId)}
                          data-testid={`checkbox-select-all-${customerId}`}
                        />
                        <div className="flex-1">
                          <CardTitle className="text-xl">{customer.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {customerJobs.length} {customerJobs.length === 1 ? 'order' : 'orders'} ready for invoicing
                            {selectedCount > 0 && ` • ${selectedCount} selected`}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {canViewPrices(user?.role) && (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Selected Total</p>
                            <p className="text-2xl font-bold">
                              {selectedCount > 0 && totalPrice !== null 
                                ? (typeof totalPrice === 'number' ? formatPrice(totalPrice) : totalPrice)
                                : "-"}
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={() => handleCreateInvoice(customerId)}
                          disabled={selectedCount === 0 || creatingInvoice === customerId}
                          data-testid={`button-create-invoice-${customerId}`}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {creatingInvoice === customerId ? "Creating..." : "Create Invoice"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {customerJobs.map(job => {
                        const price = getJobPrice(job);
                        const lineItems = getJobLineItems(job.id);
                        
                        // Find other jobs in the same consolidated shipment
                        const consolidatedJobs = job.consolidatedShipmentId 
                          ? customerJobs.filter(j => j.consolidatedShipmentId === job.consolidatedShipmentId && j.id !== job.id)
                          : [];
                        
                        return (
                          <div
                            key={job.id}
                            className={`flex items-start gap-3 p-4 rounded-lg border ${
                              selectedJobs.has(job.id) ? 'bg-accent/50 border-accent' : ''
                            } ${job.consolidatedShipmentId ? 'border-l-4 border-l-primary/50' : ''} hover-elevate active-elevate-2`}
                            data-testid={`job-invoice-${job.id}`}
                          >
                            <Checkbox
                              checked={selectedJobs.has(job.id)}
                              onCheckedChange={() => toggleJob(job.id)}
                              data-testid={`checkbox-job-${job.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold">{job.jobName}</h4>
                                  {job.poNumber && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      PO: {job.poNumber}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                    {job.requiredDispatchDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>{format(new Date(job.requiredDispatchDate), 'MMM d, yyyy')}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1">
                                      <Package className="h-3 w-3" />
                                      <span>{lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}</span>
                                    </div>
                                  </div>
                                  {job.shippingMethod && (
                                    <div className="flex flex-col gap-1 mt-2 text-sm">
                                      <div className="flex items-center gap-2">
                                        <Truck className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">
                                          {job.shippingMethod === 'customer_collection' && 'Customer Collection'}
                                          {job.shippingMethod === 'consolidated' && 'Consolidated Back to Customer'}
                                          {job.shippingMethod === 'direct_delivery' && 'Direct Delivery'}
                                        </span>
                                        {job.dhlTrackingNumber && (
                                          <Badge variant="outline" className="ml-1">
                                            Tracking: {job.dhlTrackingNumber}
                                          </Badge>
                                        )}
                                        {(job.shippingMethod === 'consolidated' || job.shippingMethod === 'direct_delivery') && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 ml-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingShipping({
                                                jobId: job.id,
                                                dhlTrackingNumber: job.dhlTrackingNumber || "",
                                                packageCount: job.packageCount || undefined,
                                                packageType: job.packageType as "boxes" | "bags" | undefined,
                                              });
                                            }}
                                            data-testid={`button-edit-shipping-${job.id}`}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                      {consolidatedJobs.length > 0 && (
                                        <div className="flex items-center gap-2 ml-5">
                                          <span className="text-muted-foreground">
                                            Consolidated with: {consolidatedJobs.map(cj => cj.jobName).join(', ')}
                                          </span>
                                        </div>
                                      )}
                                      {job.packageCount && job.packageType && (
                                        <div className="flex items-center gap-2 ml-5">
                                          <Package className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-muted-foreground">
                                            {job.packageCount} {job.packageType === 'boxes' ? (job.packageCount === 1 ? 'Box' : 'Boxes') : (job.packageCount === 1 ? 'Bag' : 'Bags')}
                                          </span>
                                          {job.shippingCost === 'TBA' ? (
                                            <div className="flex items-center gap-2 ml-2">
                                              <Badge variant="secondary">Shipping: TBA</Badge>
                                              <span className="text-sm text-muted-foreground">£</span>
                                              <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="Enter cost"
                                                value={manualShippingCosts[job.id] || ''}
                                                onChange={(e) => setManualShippingCosts({
                                                  ...manualShippingCosts,
                                                  [job.id]: e.target.value
                                                })}
                                                className="w-24 h-7"
                                                data-testid={`input-shipping-cost-${job.id}`}
                                              />
                                            </div>
                                          ) : job.shippingCost ? (
                                            <Badge variant="secondary" className="ml-2">
                                              Shipping: {formatPrice(parseFloat(job.shippingCost))}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Manual price inputs for line items needing them */}
                                  {lineItems.some(item => needsManualPrice(item)) && (
                                    <div className="mt-4 space-y-2">
                                      <p className="text-sm font-medium text-muted-foreground">Manual Pricing Required:</p>
                                      {lineItems.filter(item => needsManualPrice(item)).map(item => (
                                        <div key={item.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                                          <div className="flex-1">
                                            <p className="text-sm font-medium">
                                              {item.description || `${item.quantity} units @ ${item.stitchCount.toLocaleString()} stitches`}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {item.quantity >= 1000 ? `${item.quantity.toLocaleString()} units (1000+)` : ''}
                                              {item.quantity >= 1000 && item.stitchCount >= 50000 ? ' • ' : ''}
                                              {item.stitchCount >= 50000 ? `${item.stitchCount.toLocaleString()} stitches (50,000+)` : ''}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">£</span>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              placeholder="Unit price"
                                              value={manualPrices[item.id] || ''}
                                              onChange={(e) => setManualPrices(prev => ({
                                                ...prev,
                                                [item.id]: e.target.value
                                              }))}
                                              className="w-24"
                                              data-testid={`input-manual-price-${item.id}`}
                                            />
                                            <span className="text-sm text-muted-foreground">per unit</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {canViewPrices(user?.role) && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingLineItems({
                                          jobId: job.id,
                                          jobName: job.jobName,
                                          lineItems: lineItems,
                                        });
                                        setEditedLineItems({});
                                      }}
                                      data-testid={`button-edit-line-items-${job.id}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Badge variant="secondary" className="text-base">
                                      {price !== null ? formatPrice(price) : "-"}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Approved Logo Setups */}
                      {(() => {
                        const approvedLogos = getCustomerApprovedLogos(customerId);
                        if (approvedLogos.length === 0) return null;
                        
                        return (
                          <div className="mt-6 pt-6 border-t">
                            <div className="flex items-center gap-2 mb-3">
                              <Palette className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-sm">Approved Logo Set-Ups</h4>
                              <Badge variant="outline" className="ml-auto">
                                Will be added to invoice
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {approvedLogos.map((logo) => (
                                <div
                                  key={logo.id}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
                                  data-testid={`logo-setup-${logo.id}`}
                                >
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{logo.jobName}</p>
                                    {logo.notes && (
                                      <p className="text-xs text-muted-foreground mt-1">{logo.notes}</p>
                                    )}
                                    {logo.approvedAt && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Approved: {format(new Date(logo.approvedAt), 'MMM d, yyyy')}
                                      </p>
                                    )}
                                  </div>
                                  {canViewPrices(user?.role) && (
                                    <Badge variant="secondary" className="text-base shrink-0">
                                      £10.00
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Shipping Dialog */}
      <Dialog open={!!editingShipping} onOpenChange={(open) => !open && setEditingShipping(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Shipping Information</DialogTitle>
            <DialogDescription>
              Update tracking number and package details for this order.
            </DialogDescription>
          </DialogHeader>
          {editingShipping && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tracking">DHL Tracking Number</Label>
                <Input
                  id="tracking"
                  value={editingShipping.dhlTrackingNumber}
                  onChange={(e) => setEditingShipping({ ...editingShipping, dhlTrackingNumber: e.target.value })}
                  placeholder="Enter tracking number"
                  data-testid="input-edit-tracking"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="packageCount">Package Count</Label>
                  <Input
                    id="packageCount"
                    type="number"
                    min="1"
                    value={editingShipping.packageCount || ""}
                    onChange={(e) => setEditingShipping({ ...editingShipping, packageCount: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Number of packages"
                    data-testid="input-edit-package-count"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="packageType">Package Type</Label>
                  <Select
                    value={editingShipping.packageType || ""}
                    onValueChange={(value) => setEditingShipping({ ...editingShipping, packageType: value as "boxes" | "bags" })}
                  >
                    <SelectTrigger data-testid="select-edit-package-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="bags">Bags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editingShipping.packageType && editingShipping.packageCount && (() => {
                const result = calculateShippingCost(editingShipping.packageType, editingShipping.packageCount);
                const displayCost = result.cost === "TBA" ? "TBA" : formatPrice(result.cost);
                return (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      Shipping cost will be updated to: <span className="font-medium text-foreground">{displayCost}</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShipping(null)} data-testid="button-cancel-edit-shipping">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingShipping) {
                  updateShippingMutation.mutate({
                    jobId: editingShipping.jobId,
                    dhlTrackingNumber: editingShipping.dhlTrackingNumber || undefined,
                    packageCount: editingShipping.packageCount,
                    packageType: editingShipping.packageType,
                  });
                }
              }}
              disabled={updateShippingMutation.isPending}
              data-testid="button-save-shipping"
            >
              {updateShippingMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Line Items Dialog */}
      <Dialog open={!!editingLineItems} onOpenChange={(open) => !open && setEditingLineItems(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Line Items</DialogTitle>
            <DialogDescription>
              Update line item details for "{editingLineItems?.jobName}". For Print jobs, set the print size.
            </DialogDescription>
          </DialogHeader>
          {editingLineItems && (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {editingLineItems.lineItems.map((item) => {
                const isPrintJob = item.jobType === "Print" || item.jobType === "print";
                const currentStitchCount = editedLineItems[item.id]?.stitchCount ?? item.stitchCount;
                
                return (
                  <div key={item.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.description || `Line Item ${item.id.slice(0, 8)}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.jobType} • {item.quantity} units
                        </p>
                      </div>
                      <Badge variant="secondary">{item.jobType}</Badge>
                    </div>
                    
                    {isPrintJob ? (
                      <div className="space-y-2">
                        <Label>Print Size</Label>
                        <Select
                          value={currentStitchCount?.toString() || ""}
                          onValueChange={(value) => {
                            setEditedLineItems({
                              ...editedLineItems,
                              [item.id]: { stitchCount: parseInt(value) }
                            });
                          }}
                        >
                          <SelectTrigger data-testid={`select-print-size-${item.id}`}>
                            <SelectValue placeholder="Select print size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">A6</SelectItem>
                            <SelectItem value="2">A5</SelectItem>
                            <SelectItem value="3">A4</SelectItem>
                            <SelectItem value="4">A3</SelectItem>
                          </SelectContent>
                        </Select>
                        {(!currentStitchCount || currentStitchCount < 1 || currentStitchCount > 4) && (
                          <p className="text-xs text-destructive">Print size is required for price calculation</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Stitch Count</Label>
                        <Input
                          type="number"
                          min="0"
                          value={currentStitchCount || ""}
                          onChange={(e) => {
                            setEditedLineItems({
                              ...editedLineItems,
                              [item.id]: { stitchCount: parseInt(e.target.value) || 0 }
                            });
                          }}
                          placeholder="Enter stitch count"
                          data-testid={`input-stitch-count-${item.id}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLineItems(null)} data-testid="button-cancel-edit-line-items">
              Cancel
            </Button>
            <Button
              onClick={handleSaveLineItems}
              disabled={updateLineItemMutation.isPending || Object.keys(editedLineItems).length === 0}
              data-testid="button-save-line-items"
            >
              {updateLineItemMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

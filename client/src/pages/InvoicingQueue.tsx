import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FileText, Calendar, Package, Link as LinkIcon, AlertCircle, Truck, Palette } from "lucide-react";
import { format } from "date-fns";
import { calculateJobPrice, formatPrice } from "@shared/pricing";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { canViewPrices, type Job, type Customer, type LogoSetup } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function InvoicingQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null);
  const [connectingXero, setConnectingXero] = useState(false);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  
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
    return logoSetups.filter(ls => ls.customerId === customerId && ls.approved);
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
      
      const response = await apiRequest("POST", "/api/xero/consolidated-invoice", {
        jobIds,
        customerId,
        manualPrices: Object.keys(manualPricesForAPI).length > 0 ? manualPricesForAPI : undefined,
      }) as unknown as { success: boolean; invoiceId: string; invoiceNumber: string | null; jobsInvoiced: number };

      toast({
        title: "Invoice Created",
        description: `Successfully created invoice for ${selectedCustomerJobs.length} ${selectedCustomerJobs.length === 1 ? 'order' : 'orders'}. Reference: ${response.invoiceNumber || response.invoiceId}`,
      });

      // Clear selected jobs for this customer
      const newSelected = new Set(selectedJobs);
      selectedCustomerJobs.forEach(job => newSelected.delete(job.id));
      setSelectedJobs(newSelected);

      // Clear manual prices for this customer's jobs
      const newManualPrices = { ...manualPrices };
      for (const job of selectedCustomerJobs) {
        const lineItems = getJobLineItems(job.id);
        lineItems.forEach(item => {
          delete newManualPrices[item.id];
        });
      }
      setManualPrices(newManualPrices);

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
              <div className="flex items-center gap-2">
                {xeroStatus.connected ? (
                  <Badge variant="outline" className="gap-1.5" data-testid="badge-xero-connected">
                    <LinkIcon className="h-3.5 w-3.5" />
                    Xero Connected
                  </Badge>
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
        ) : (
          <div className="space-y-6">
            {Object.entries(jobsByCustomer).map(([customerId, customerJobs]) => {
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
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      <span>{format(new Date(job.requiredDispatchDate), 'MMM d, yyyy')}</span>
                                    </div>
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
                                          {job.shippingCost && (
                                            <Badge variant="secondary" className="ml-2">
                                              Shipping: {job.shippingCost === 'TBA' ? 'TBA' : formatPrice(parseFloat(job.shippingCost))}
                                            </Badge>
                                          )}
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
                                  <div className="text-right shrink-0">
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
    </div>
  );
}

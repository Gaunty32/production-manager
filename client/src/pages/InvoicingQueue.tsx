import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FileText, Calendar, Package, Link as LinkIcon, AlertCircle, Truck, Palette, Search, Pencil } from "lucide-react";
import { format } from "date-fns";
import { calculateJobPrice, formatPrice, calculateShippingCost, CODE_TO_PRINT_SIZE } from "@shared/pricing";
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
  customerId: string;
  dhlTrackingNumber: string;
  packageCount: number | undefined;
  packageType: "boxes" | "bags" | undefined;
  consolidateWithJobIds: string[];
}

interface MergeShippingState {
  customerId: string;
  shippingJobs: Job[];
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
  const [mergingShipping, setMergingShipping] = useState<MergeShippingState | null>(null);
  const [mergePackageCount, setMergePackageCount] = useState<number | undefined>(undefined);
  const [mergePackageType, setMergePackageType] = useState<"boxes" | "bags">("boxes");

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
    mutationFn: async (data: { jobId: string; dhlTrackingNumber?: string; packageCount?: number; packageType?: string; shippingMethod?: string; consolidatedJobIds?: string[] }) => {
      const { jobId, consolidatedJobIds, ...updates } = data;
      if (consolidatedJobIds && consolidatedJobIds.length > 0) {
        return apiRequest("PATCH", `/api/jobs/${jobId}`, { ...updates, consolidatedJobIds });
      }
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

  const mergeShippingMutation = useMutation({
    mutationFn: async (data: { primaryJobId: string; otherJobIds: string[]; packageCount: number; packageType: string }) => {
      return apiRequest("PATCH", `/api/jobs/${data.primaryJobId}`, {
        shippingMethod: "consolidated",
        consolidatedJobIds: data.otherJobIds,
        packageCount: data.packageCount,
        packageType: data.packageType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Shipping merged", description: "All shipping charges have been consolidated into one line." });
      setMergingShipping(null);
      setMergePackageCount(undefined);
    },
    onError: (error) => {
      toast({ title: "Merge failed", description: error instanceof Error ? error.message : "Failed to merge shipping charges", variant: "destructive" });
    },
  });
  
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: customersData = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  // Only show active customers in selection dropdowns
  const customers = customersData.filter(c => c.active !== false);

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

  // Get customers with only approved logo setups (no jobs)
  const approvedLogoSetups = logoSetups.filter(ls => ls.approved && ls.approvedAt);
  const customersWithOnlyLogoSetups = approvedLogoSetups
    .map(ls => ls.customerId)
    .filter(customerId => !jobsByCustomer[customerId]);
  const uniqueLogoOnlyCustomers = Array.from(new Set(customersWithOnlyLogoSetups));

  // Merge customers with jobs and customers with only logo setups
  const allInvoiceableCustomers = { ...jobsByCustomer };
  uniqueLogoOnlyCustomers.forEach(customerId => {
    if (!allInvoiceableCustomers[customerId]) {
      allInvoiceableCustomers[customerId] = []; // Empty jobs array, but has logo setups
    }
  });

  // Filter customers by search term and sort alphabetically
  const filteredJobsByCustomer = Object.entries(allInvoiceableCustomers)
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

  const buildInvoicePreviewLines = (customerJobs: Job[], customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return [];
    
    const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
    const previewLines: Array<{ description: string; quantity: number; unitPrice: number | string; itemCode: string }> = [];
    
    const selectedCustomerJobs = customerJobs.filter(job => selectedJobs.has(job.id));
    
    const sortedJobs = [...selectedCustomerJobs].sort((a, b) => {
      const dateA = a.goodsReceived ? new Date(a.goodsReceived).getTime() : 0;
      const dateB = b.goodsReceived ? new Date(b.goodsReceived).getTime() : 0;
      return dateA - dateB;
    });
    
    const shipmentLastIndex = new Map<string, number>();
    for (let i = 0; i < sortedJobs.length; i++) {
      const shipmentKey = sortedJobs[i].consolidatedShipmentId || `single-${sortedJobs[i].id}`;
      shipmentLastIndex.set(shipmentKey, i);
    }
    
    const shipmentJobsMap = new Map<string, Job[]>();
    
    for (let i = 0; i < sortedJobs.length; i++) {
      const job = sortedJobs[i];
      const shipmentKey = job.consolidatedShipmentId || `single-${job.id}`;
      
      if (!shipmentJobsMap.has(shipmentKey)) {
        shipmentJobsMap.set(shipmentKey, []);
      }
      shipmentJobsMap.get(shipmentKey)!.push(job);
      
      const jobLineItems = getJobLineItems(job.id);
      
      let priceResult: any = null;
      try {
        priceResult = pricingTable ? calculateJobPrice(jobLineItems, pricingTable) : { totalPrice: 0, lineItemPrices: jobLineItems.map(() => ({ unitPrice: 0, totalPrice: 0 })) };
      } catch {
        priceResult = null;
      }
      
      jobLineItems.forEach((lineItem, index) => {
        let unitPrice: number | string;
        
        if (manualPrices[lineItem.id]) {
          unitPrice = parseFloat(manualPrices[lineItem.id]);
        } else if (priceResult && priceResult.totalPrice !== "POA") {
          const lineItemPrice = priceResult.lineItemPrices[index];
          unitPrice = typeof lineItemPrice === 'number' ? lineItemPrice : (lineItemPrice?.unitPrice ?? 0);
        } else {
          unitPrice = "POA";
        }
        
        const jobTypeLower = lineItem.jobType?.toLowerCase() || '';
        let itemCode = "Emb";
        let description = lineItem.description || '';
        
        if (jobTypeLower === "print") {
          itemCode = "DTF";
          const printSize = CODE_TO_PRINT_SIZE[lineItem.stitchCount as keyof typeof CODE_TO_PRINT_SIZE];
          const positionPart = description ? `, ${description}` : '';
          if (printSize) {
            description = `${job.jobName}${positionPart}, ${printSize} Print`;
          } else {
            description = `${job.jobName}${positionPart}`;
          }
          if (job.poNumber) {
            description += ` (PO: ${job.poNumber})`;
          }
        } else if (jobTypeLower === "bagging") {
          itemCode = "BAG";
          description = description || job.jobName;
          if (job.poNumber) {
            description += ` (PO: ${job.poNumber})`;
          }
        } else if (jobTypeLower === "other") {
          itemCode = "-";
          description = description || job.jobName;
          if (job.poNumber) {
            description += ` (PO: ${job.poNumber})`;
          }
        } else {
          description = `${job.jobName}, ${lineItem.stitchCount.toLocaleString()} Stitches`;
          if (job.poNumber) {
            description += ` (PO: ${job.poNumber})`;
          }
        }
        
        previewLines.push({ description, quantity: lineItem.quantity, unitPrice, itemCode });
      });
      
      if (shipmentLastIndex.get(shipmentKey) === i) {
        const shipmentJobs = shipmentJobsMap.get(shipmentKey)!;
        let totalShippingCost = 0;
        let shippingMethod = '';
        let hasShipping = false;
        
        for (const sJob of shipmentJobs) {
          let shippingCost: number | null = null;
          
          if (sJob.shippingCost === "TBA") {
            if (manualShippingCosts[sJob.id]) {
              shippingCost = Number(manualShippingCosts[sJob.id]);
            }
          } else if (sJob.shippingCost) {
            shippingCost = parseFloat(sJob.shippingCost);
          }
          
          if (shippingCost !== null && !isNaN(shippingCost) && shippingCost > 0) {
            totalShippingCost += shippingCost;
            hasShipping = true;
            if (!shippingMethod) shippingMethod = sJob.shippingMethod || '';
          }
        }
        
        if (hasShipping && totalShippingCost > 0) {
          const isConsolidated = shipmentJobs.length > 1;
          const jobDetails = shipmentJobs.map(j => j.poNumber ? `${j.jobName} (PO: ${j.poNumber})` : j.jobName).join(', ');
          
          let packageInfo = '';
          {
            const packageCounts: Record<string, number> = {};
            for (const sJob of shipmentJobs) {
              if (sJob.packageCount && sJob.packageType) {
                const t = sJob.packageType.toLowerCase();
                packageCounts[t] = (packageCounts[t] || 0) + sJob.packageCount;
              }
            }
            if (Object.keys(packageCounts).length > 0) {
              const pluralMap: Record<string, string> = { 'box': 'boxes', 'boxes': 'boxes', 'bag': 'bags', 'bags': 'bags', 'pallet': 'pallets', 'pallets': 'pallets', 'package': 'packages', 'packages': 'packages' };
              const singularMap: Record<string, string> = { 'boxes': 'box', 'bags': 'bag', 'pallets': 'pallet', 'packages': 'package' };
              const parts = Object.entries(packageCounts).map(([type, count]) => {
                const singular = singularMap[type] || type;
                const plural = pluralMap[type] || pluralMap[singular] || type + 's';
                return `${count} ${count > 1 ? plural : singular}`;
              });
              packageInfo = ` (${parts.join(', ')})`;
            }
          }
          
          const methodLabel = shippingMethod === 'customer_collection' ? 'Customer Collection' : shippingMethod === 'consolidated' ? 'Consolidated Back to Customer' : 'Direct Delivery';
          
          previewLines.push({
            description: `Shipping${isConsolidated ? ' (Consolidated)' : ''} - ${methodLabel}${packageInfo} - ${jobDetails}`,
            quantity: 1,
            unitPrice: totalShippingCost,
            itemCode: "Carriage",
          });
        }
        
        shipmentJobsMap.delete(shipmentKey);
      }
    }
    
    const customerLogos = getCustomerApprovedLogos(customerId);
    for (const logo of customerLogos) {
      previewLines.push({
        description: `Logo Set-Up - ${logo.jobName}`,
        quantity: 1,
        unitPrice: 10,
        itemCode: "-",
      });
    }
    
    return previewLines;
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
    const customerLogoSetups = getCustomerApprovedLogos(customerId);
    // Can invoice logo setups only when no jobs are selected but customer has approved logo setups
    const invoicingLogoSetupsOnly = selectedCustomerJobs.length === 0 && customerLogoSetups.length > 0;
    
    if (selectedCustomerJobs.length === 0 && customerLogoSetups.length === 0) {
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

    // Check if any selected job has TBA shipping that needs manual cost.
    // For consolidated shipment groups, only require ONE cost entry per group.
    const jobsNeedingShippingCosts: string[] = [];
    const checkedConsolidatedGroups = new Set<string>();
    for (const job of selectedCustomerJobs) {
      if (job.shippingCost === "TBA") {
        if (job.consolidatedShipmentId) {
          // First TBA job encountered in this consolidated group is the representative
          if (!checkedConsolidatedGroups.has(job.consolidatedShipmentId)) {
            checkedConsolidatedGroups.add(job.consolidatedShipmentId);
            if (!manualShippingCosts[job.id]) {
              jobsNeedingShippingCosts.push(job.id);
            }
          }
          // Subsequent jobs in same group: skip (covered by representative)
        } else {
          // Non-consolidated — requires its own cost
          if (!manualShippingCosts[job.id]) {
            jobsNeedingShippingCosts.push(job.id);
          }
        }
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
      
      // For logo-only invoices, skip manual prices and shipping entirely
      let manualPricesForAPI: Record<string, number> = {};
      let manualShippingForAPI: Record<string, number> = {};
      
      if (!invoicingLogoSetupsOnly) {
        // Build manual prices object, filtering to only include line items from selected jobs
        const selectedJobLineItemIds = new Set<string>();
        selectedCustomerJobs.forEach(job => {
          getJobLineItems(job.id).forEach(item => selectedJobLineItemIds.add(item.id));
        });
        
        Object.entries(manualPrices).forEach(([lineItemId, price]) => {
          if (price && selectedJobLineItemIds.has(lineItemId)) {
            manualPricesForAPI[lineItemId] = parseFloat(price);
          }
        });
        
        // Build manual shipping costs object, filtering to only include selected jobs
        Object.entries(manualShippingCosts).forEach(([jobId, cost]) => {
          if (cost && jobIds.includes(jobId)) {
            manualShippingForAPI[jobId] = parseFloat(cost);
          }
        });
      }
      
      const response = await apiRequest("POST", "/api/xero/consolidated-invoice", {
        jobIds,
        customerId,
        logoSetupsOnly: invoicingLogoSetupsOnly,
        manualPrices: Object.keys(manualPricesForAPI).length > 0 ? manualPricesForAPI : undefined,
        manualShippingCosts: Object.keys(manualShippingForAPI).length > 0 ? manualShippingForAPI : undefined,
      }) as unknown as { success: boolean; invoiceId: string; invoiceNumber: string | null; jobsInvoiced: number; logoSetupsInvoiced?: number };

      const invoiceDescription = invoicingLogoSetupsOnly 
        ? `Successfully created invoice for ${customerLogoSetups.length} logo set-up${customerLogoSetups.length > 1 ? 's' : ''}.`
        : `Successfully created invoice for ${selectedCustomerJobs.length} ${selectedCustomerJobs.length === 1 ? 'order' : 'orders'}.`;
      
      toast({
        title: "Invoice Created",
        description: `${invoiceDescription} Reference: ${response.invoiceNumber || response.invoiceId}`,
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

      // Refresh jobs list and logo setups
      await queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/logo-setups"] });
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
        ) : Object.keys(allInvoiceableCustomers).length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No completed jobs or approved logo setups ready for invoicing</p>
                <p className="text-sm mt-2">Jobs and approved logo setups will appear here</p>
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

              const customerLogoSetups = getCustomerApprovedLogos(customerId);
              const allSelected = customerJobs.length > 0 ? customerJobs.every(job => selectedJobs.has(job.id)) : false;
              const someSelected = customerJobs.some(job => selectedJobs.has(job.id));
              const totalPrice = getTotalPrice(customerJobs);
              const selectedCount = customerJobs.filter(job => selectedJobs.has(job.id)).length;
              const logoSetupTotal = customerLogoSetups.length * 10;
              // Customer can invoice logo setups when no jobs are selected (either because they have no jobs, or because they deselected all)
              const canInvoiceLogoSetupsOnly = selectedCount === 0 && customerLogoSetups.length > 0;
              const hasOnlyLogoSetups = customerJobs.length === 0 && customerLogoSetups.length > 0;

              return (
                <Card key={customerId} data-testid={`invoice-group-${customerId}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {customerJobs.length > 0 && (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleAllJobsForCustomer(customerId)}
                            data-testid={`checkbox-select-all-${customerId}`}
                          />
                        )}
                        <div className="flex-1">
                          <CardTitle className="text-xl">{customer.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {hasOnlyLogoSetups ? (
                              <>{customerLogoSetups.length} approved logo {customerLogoSetups.length === 1 ? 'set-up' : 'set-ups'} ready for invoicing</>
                            ) : (
                              <>
                                {customerJobs.length} {customerJobs.length === 1 ? 'order' : 'orders'} ready for invoicing
                                {selectedCount > 0 && ` • ${selectedCount} selected`}
                                {customerLogoSetups.length > 0 && ` • ${customerLogoSetups.length} logo set-up${customerLogoSetups.length > 1 ? 's' : ''}`}
                                {canInvoiceLogoSetupsOnly && selectedCount === 0 && ` (select jobs or invoice logo set-ups only)`}
                              </>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {canViewPrices(user?.role) && (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              {canInvoiceLogoSetupsOnly ? "Logo Set-up Total" : "Selected Total"}
                            </p>
                            <p className="text-2xl font-bold">
                              {canInvoiceLogoSetupsOnly 
                                ? formatPrice(logoSetupTotal)
                                : (selectedCount > 0 && totalPrice !== null 
                                    ? (typeof totalPrice === 'number' ? formatPrice(totalPrice) : totalPrice)
                                    : "-")}
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={() => handleCreateInvoice(customerId)}
                          disabled={(selectedCount === 0 && !canInvoiceLogoSetupsOnly) || creatingInvoice === customerId}
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
                      {(() => {
                        // Pre-compute which job is the TBA shipping representative for each consolidated group.
                        // Only the first TBA job in a group gets the input; others show a "covered" note.
                        const consolidatedTbaRepresentative = new Map<string, string>(); // shipmentId -> jobId
                        for (const j of customerJobs) {
                          if (j.consolidatedShipmentId && j.shippingCost === 'TBA') {
                            if (!consolidatedTbaRepresentative.has(j.consolidatedShipmentId)) {
                              consolidatedTbaRepresentative.set(j.consolidatedShipmentId, j.id);
                            }
                          }
                        }
                        return customerJobs.map(job => {
                        const price = getJobPrice(job);
                        const lineItems = getJobLineItems(job.id);
                        
                        // Is this job the one that should show the TBA shipping input for its consolidated group?
                        const isShippingRepresentative = !job.consolidatedShipmentId || 
                          job.shippingCost !== 'TBA' ||
                          consolidatedTbaRepresentative.get(job.consolidatedShipmentId) === job.id;
                        
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
                                                customerId: job.customerId,
                                                dhlTrackingNumber: job.dhlTrackingNumber || "",
                                                packageCount: job.packageCount || undefined,
                                                packageType: job.packageType as "boxes" | "bags" | undefined,
                                                consolidateWithJobIds: consolidatedJobs.map(cj => cj.id),
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
                                          {job.shippingCost === 'TBA' && isShippingRepresentative ? (
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
                                          ) : job.shippingCost === 'TBA' && !isShippingRepresentative ? (
                                            <Badge variant="outline" className="ml-2 text-muted-foreground">Shipping: see above</Badge>
                                          ) : job.shippingCost ? (
                                            <Badge variant="secondary" className="ml-2">
                                              Shipping: {formatPrice(parseFloat(job.shippingCost))}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      )}
                                      {/* TBA shipping without package info - only show input for the representative */}
                                      {job.shippingCost === 'TBA' && !(job.packageCount && job.packageType) && isShippingRepresentative && (
                                        <div className="flex items-center gap-2 ml-5">
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
                                      )}
                                      {job.shippingCost === 'TBA' && !(job.packageCount && job.packageType) && !isShippingRepresentative && (
                                        <div className="flex items-center gap-2 ml-5">
                                          <Badge variant="outline" className="text-muted-foreground">Shipping: see above</Badge>
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
                      }); })()}

                      {/* Approved Logo Setups */}
                      {(() => {
                        const approvedLogos = getCustomerApprovedLogos(customerId);
                        if (approvedLogos.length === 0) return null;
                        
                        return (
                          <div className={customerJobs.length > 0 ? "mt-6 pt-6 border-t" : ""}>
                            <div className="flex items-center gap-2 mb-3">
                              <Palette className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-sm">Approved Logo Set-Ups</h4>
                              <Badge variant="outline" className="ml-auto">
                                {customerJobs.length > 0 ? "Will be added to invoice" : "Ready for invoicing"}
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

                      {/* Invoice Line Preview */}
                      {(() => {
                        const hasSelectedJobs = customerJobs.some(job => selectedJobs.has(job.id));
                        const hasLogoSetups = getCustomerApprovedLogos(customerId).length > 0;
                        if (!hasSelectedJobs && !hasLogoSetups) return null;
                        
                        const previewLines = buildInvoicePreviewLines(customerJobs, customerId);
                        if (previewLines.length === 0) return null;
                        
                        const previewTotal = previewLines.reduce((sum, line) => {
                          if (typeof line.unitPrice === 'number') {
                            return sum + (line.unitPrice * line.quantity);
                          }
                          return sum;
                        }, 0);
                        const hasPOA = previewLines.some(line => line.unitPrice === "POA");
                        
                        const carriageLines = previewLines.filter(l => l.itemCode === "Carriage");
                        const jobsWithShipping = customerJobs.filter(j =>
                          selectedJobs.has(j.id) && j.shippingCost && j.shippingCost !== "TBA" && parseFloat(j.shippingCost) > 0
                        );

                        return (
                          <div className="mt-6 pt-6 border-t">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <FileText className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold text-sm">Xero Invoice Preview</h4>
                              <Badge variant="outline" className="ml-auto">
                                {previewLines.length} {previewLines.length === 1 ? 'line' : 'lines'}
                              </Badge>
                              {carriageLines.length > 1 && jobsWithShipping.length > 1 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => {
                                    setMergePackageCount(undefined);
                                    setMergePackageType("boxes");
                                    setMergingShipping({ customerId, shippingJobs: jobsWithShipping });
                                  }}
                                  data-testid={`button-merge-shipping-${customerId}`}
                                >
                                  <Truck className="h-3 w-3 mr-1" />
                                  Merge {carriageLines.length} shipping charges
                                </Button>
                              )}
                            </div>
                            <div className="rounded-lg border overflow-hidden">
                              <table className="w-full text-sm" data-testid={`table-invoice-preview-${customerId}`}>
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left p-2 font-medium text-muted-foreground">Item Code</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Description</th>
                                    <th className="text-right p-2 font-medium text-muted-foreground">Qty</th>
                                    <th className="text-right p-2 font-medium text-muted-foreground">Unit Price</th>
                                    <th className="text-right p-2 font-medium text-muted-foreground">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewLines.map((line, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="p-2">
                                        <Badge variant="outline" className="text-xs">{line.itemCode}</Badge>
                                      </td>
                                      <td className="p-2 text-foreground">{line.description}</td>
                                      <td className="p-2 text-right text-muted-foreground">{line.quantity}</td>
                                      <td className="p-2 text-right text-muted-foreground">
                                        {typeof line.unitPrice === 'number' ? `£${line.unitPrice.toFixed(2)}` : line.unitPrice}
                                      </td>
                                      <td className="p-2 text-right font-medium">
                                        {typeof line.unitPrice === 'number' ? `£${(line.unitPrice * line.quantity).toFixed(2)}` : line.unitPrice}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t bg-muted/30">
                                    <td colSpan={4} className="p-2 text-right font-semibold">Subtotal (excl. VAT)</td>
                                    <td className="p-2 text-right font-bold">
                                      {hasPOA ? "POA" : `£${previewTotal.toFixed(2)}`}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
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

      {/* Merge Shipping Dialog */}
      <Dialog open={!!mergingShipping} onOpenChange={(open) => !open && setMergingShipping(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Shipping Charges</DialogTitle>
            <DialogDescription>
              Combine all separate shipping charges into one consolidated line. Set the total package count for the combined shipment.
            </DialogDescription>
          </DialogHeader>
          {mergingShipping && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Jobs being consolidated ({mergingShipping.shippingJobs.length})</Label>
                <div className="space-y-1 rounded-md border p-2 text-sm">
                  {mergingShipping.shippingJobs.map((j, i) => (
                    <div key={j.id} className="flex items-center justify-between py-1">
                      <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                        {j.jobName}{i === 0 ? " (primary)" : ""}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {j.shippingCost ? formatPrice(parseFloat(j.shippingCost)) : "-"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">The first job keeps the shipping charge; others are set to £0.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="merge-package-count">Total Package Count</Label>
                  <Input
                    id="merge-package-count"
                    type="number"
                    min="1"
                    value={mergePackageCount || ""}
                    onChange={(e) => setMergePackageCount(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g. 2"
                    data-testid="input-merge-package-count"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merge-package-type">Package Type</Label>
                  <Select value={mergePackageType} onValueChange={(v) => setMergePackageType(v as "boxes" | "bags")}>
                    <SelectTrigger data-testid="select-merge-package-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="bags">Bags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {mergePackageCount && mergePackageType && (() => {
                const result = calculateShippingCost(mergePackageType, mergePackageCount);
                const displayCost = result.cost === "TBA" ? "TBA" : formatPrice(result.cost);
                return (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      New single shipping charge: <span className="font-medium text-foreground">{displayCost}</span>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergingShipping(null)}>Cancel</Button>
            <Button
              disabled={!mergePackageCount || mergeShippingMutation.isPending}
              onClick={() => {
                if (mergingShipping && mergePackageCount) {
                  const [primary, ...others] = mergingShipping.shippingJobs;
                  mergeShippingMutation.mutate({
                    primaryJobId: primary.id,
                    otherJobIds: others.map(j => j.id),
                    packageCount: mergePackageCount,
                    packageType: mergePackageType,
                  });
                }
              }}
              data-testid="button-confirm-merge-shipping"
            >
              {mergeShippingMutation.isPending ? "Merging..." : "Merge shipping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Shipping Dialog */}
      <Dialog open={!!editingShipping} onOpenChange={(open) => !open && setEditingShipping(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Shipping Information</DialogTitle>
            <DialogDescription>
              Update tracking number and package details. You can also consolidate multiple jobs onto one shipping charge.
            </DialogDescription>
          </DialogHeader>
          {editingShipping && (() => {
            const otherCustomerJobs = jobs.filter(j =>
              j.customerId === editingShipping.customerId &&
              j.id !== editingShipping.jobId &&
              (j.invoiceStatus === 'ready' || j.invoiceStatus === 'draft')
            );
            return (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tracking">DPD Local Tracking Number</Label>
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
                  const result = calculateShippingCost(editingShipping.packageType!, editingShipping.packageCount!);
                  const displayCost = result.cost === "TBA" ? "TBA" : formatPrice(result.cost);
                  return (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm text-muted-foreground">
                        Shipping cost will be updated to: <span className="font-medium text-foreground">{displayCost}</span>
                      </p>
                    </div>
                  );
                })()}
                {otherCustomerJobs.length > 0 && (
                  <div className="space-y-2">
                    <Label>Consolidate shipping with other jobs</Label>
                    <p className="text-xs text-muted-foreground">Select jobs that were shipped in the same parcel. They will share this shipping charge — their individual charges will be removed.</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                      {otherCustomerJobs.map(j => (
                        <div key={j.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`consolidate-${j.id}`}
                            checked={editingShipping.consolidateWithJobIds.includes(j.id)}
                            onCheckedChange={(checked) => {
                              setEditingShipping({
                                ...editingShipping,
                                consolidateWithJobIds: checked
                                  ? [...editingShipping.consolidateWithJobIds, j.id]
                                  : editingShipping.consolidateWithJobIds.filter(id => id !== j.id),
                              });
                            }}
                            data-testid={`checkbox-consolidate-${j.id}`}
                          />
                          <label htmlFor={`consolidate-${j.id}`} className="text-sm cursor-pointer flex-1">
                            {j.jobName}
                            {j.shippingCost && j.shippingCost !== 'TBA' && (
                              <span className="text-muted-foreground ml-1">(current: {formatPrice(parseFloat(j.shippingCost))})</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    {editingShipping.consolidateWithJobIds.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Shipping charges on the {editingShipping.consolidateWithJobIds.length} selected job{editingShipping.consolidateWithJobIds.length > 1 ? 's' : ''} will be replaced by this single consolidated charge.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShipping(null)} data-testid="button-cancel-edit-shipping">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingShipping) {
                  if (editingShipping.consolidateWithJobIds.length > 0) {
                    updateShippingMutation.mutate({
                      jobId: editingShipping.jobId,
                      shippingMethod: "consolidated",
                      dhlTrackingNumber: editingShipping.dhlTrackingNumber || undefined,
                      packageCount: editingShipping.packageCount,
                      packageType: editingShipping.packageType,
                      consolidatedJobIds: editingShipping.consolidateWithJobIds,
                    });
                  } else {
                    updateShippingMutation.mutate({
                      jobId: editingShipping.jobId,
                      dhlTrackingNumber: editingShipping.dhlTrackingNumber || undefined,
                      packageCount: editingShipping.packageCount,
                      packageType: editingShipping.packageType,
                    });
                  }
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

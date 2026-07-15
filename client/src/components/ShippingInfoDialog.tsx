import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck, Package, Coins, PackageCheck } from "lucide-react";
import { calculateShippingCost, formatPrice } from "@shared/pricing";
import type { Job } from "@shared/schema";
import { DpdBookingDialog } from "@/components/DpdBookingDialog";

const shippingSchema = z.object({
  shippingMethod: z.enum(["customer_collection", "consolidated", "direct_delivery"], {
    required_error: "Please select a shipping method",
  }),
  dhlTrackingNumber: z.string().optional(),
  packageCount: z.coerce.number().int().min(1).optional(),
  packageType: z.enum(["boxes", "bags"]).optional(),
  consolidatedJobIds: z.array(z.string()).optional(),
}).refine((data) => {
  if (data.shippingMethod === "consolidated" || data.shippingMethod === "direct_delivery") {
    return data.dhlTrackingNumber && data.dhlTrackingNumber.trim().length > 0;
  }
  return true;
}, {
  message: "DPD Local tracking number is required for this shipping method",
  path: ["dhlTrackingNumber"],
}).refine((data) => {
  if (data.shippingMethod === "consolidated" || data.shippingMethod === "direct_delivery") {
    return data.packageCount && data.packageCount > 0;
  }
  return true;
}, {
  message: "Package count is required for this shipping method",
  path: ["packageCount"],
}).refine((data) => {
  if (data.shippingMethod === "consolidated" || data.shippingMethod === "direct_delivery") {
    return data.packageType && (data.packageType === "boxes" || data.packageType === "bags");
  }
  return true;
}, {
  message: "Package type is required for this shipping method",
  path: ["packageType"],
}).refine((data) => {
  // Enforce bag quantity = 1 restriction
  if (data.packageType === "bags" && data.packageCount && data.packageCount > 1) {
    return false;
  }
  return true;
}, {
  message: "Only 1 bag is allowed for bag shipments",
  path: ["packageCount"],
});

type ShippingFormData = z.infer<typeof shippingSchema>;

interface ShippingInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ShippingFormData) => void;
  // Complete the order WITHOUT shipping details — used when the customer has
  // another order still in production and this one will ship with it later.
  onHold?: () => Promise<void> | void;
  isPending?: boolean;
  currentJobId: string;
  customerId: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export function ShippingInfoDialog({
  open,
  onOpenChange,
  onSubmit,
  onHold,
  isPending = false,
  currentJobId,
  customerId,
  customerName,
  customerAddress,
  customerPhone,
  customerEmail,
}: ShippingInfoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedConsolidatedJobs, setSelectedConsolidatedJobs] = useState<string[]>([]);
  const [selectedExistingShipment, setSelectedExistingShipment] = useState<string | null>(null);
  const [showDpdDialog, setShowDpdDialog] = useState(false);

  const form = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
    defaultValues: {
      shippingMethod: undefined,
      dhlTrackingNumber: "",
      packageCount: undefined,
      packageType: undefined,
      consolidatedJobIds: [],
    },
  });

  const selectedMethod = form.watch("shippingMethod");
  const packageType = form.watch("packageType");
  const packageCount = form.watch("packageCount");
  const needsTracking = selectedMethod === "consolidated" || selectedMethod === "direct_delivery";

  // Fetch completed jobs for the same customer (excluding the current job)
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    enabled: open && selectedMethod === "consolidated",
  });

  // Find existing consolidated shipments for this customer
  const existingShipments = useMemo(() => {
    if (selectedMethod !== "consolidated") return [];
    
    const shipmentsMap = new Map<string, Job>();
    jobs.forEach(job => {
      if (
        job.customerId === customerId &&
        job.consolidatedShipmentId &&
        job.invoiceStatus !== "invoiced" &&
        job.id !== currentJobId
        // Allow joining shipments even if tracking info hasn't been added yet
      ) {
        // Group by the physical parcel (tracking number) so multiple jobs going
        // out in the same shipment appear as ONE option. Fall back to the
        // shipment ID when no tracking number has been added yet.
        const shipmentKey = job.dhlTrackingNumber?.trim() || job.consolidatedShipmentId;
        if (!shipmentsMap.has(shipmentKey)) {
          shipmentsMap.set(shipmentKey, job);
        }
      }
    });
    return Array.from(shipmentsMap.values());
  }, [jobs, customerId, currentJobId, selectedMethod]);

  // Filter to only show completed jobs for this customer (excluding current job)
  const availableJobsForConsolidation = useMemo(() => {
    if (selectedMethod !== "consolidated") return [];
    return jobs.filter(job => 
      job.customerId === customerId && 
      job.id !== currentJobId &&
      job.completed &&
      job.invoiceStatus !== "invoiced" && // Don't show already invoiced jobs
      !job.consolidatedShipmentId // Don't show jobs already in a consolidated shipment
    );
  }, [jobs, customerId, currentJobId, selectedMethod]);

  // Auto-populate form fields when an existing shipment is selected
  const selectedShipmentJob = useMemo(() => {
    if (!selectedExistingShipment) return null;
    return existingShipments.find(job => job.consolidatedShipmentId === selectedExistingShipment);
  }, [selectedExistingShipment, existingShipments]);

  // Update form when existing shipment is selected
  useEffect(() => {
    if (selectedShipmentJob) {
      form.setValue("dhlTrackingNumber", selectedShipmentJob.dhlTrackingNumber || "");
      form.setValue("packageCount", selectedShipmentJob.packageCount || undefined);
      form.setValue("packageType", selectedShipmentJob.packageType as "boxes" | "bags" || undefined);
    }
  }, [selectedShipmentJob, form]);

  // Calculate shipping cost when package type and count are selected
  // No cost when joining existing shipment
  const shippingCost = useMemo(() => {
    if (selectedExistingShipment) return null; // No cost for joining existing shipment
    if (!packageType || !packageCount) return null;
    return calculateShippingCost(packageType as "boxes" | "bags", packageCount);
  }, [packageType, packageCount, selectedExistingShipment]);

  const handleSubmit = async (data: ShippingFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Include selected consolidated job IDs in the submission
      await onSubmit({
        ...data,
        consolidatedJobIds: selectedMethod === "consolidated" ? selectedConsolidatedJobs : [],
        // Pass the existing shipment ID if joining one
        existingShipmentId: selectedExistingShipment || undefined,
      } as any);
      form.reset();
      setSelectedConsolidatedJobs([]);
      setSelectedExistingShipment(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedConsolidatedJobs(prev => 
      prev.includes(jobId) 
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  };

  const handleHold = async () => {
    if (!onHold || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onHold();
      form.reset();
      setSelectedConsolidatedJobs([]);
      setSelectedExistingShipment(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-shipping-info">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipping Information
          </DialogTitle>
          <DialogDescription>
            Select the shipping method and add tracking details before marking this order as complete.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="shippingMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shipping Method</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isPending || isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-shipping-method">
                        <SelectValue placeholder="Select shipping method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="customer_collection" data-testid="option-customer-collection">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Customer Collection
                        </div>
                      </SelectItem>
                      <SelectItem value="consolidated" data-testid="option-consolidated">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Consolidated Back to Customer
                        </div>
                      </SelectItem>
                      <SelectItem value="direct_delivery" data-testid="option-direct-delivery">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Direct Delivery
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show existing shipments option for consolidated method */}
            {selectedMethod === "consolidated" && existingShipments.length > 0 && (
              <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                <FormLabel>Join Existing Consolidated Shipment</FormLabel>
                <FormDescription className="text-xs">
                  Select an existing shipment to join (shipping details will be inherited)
                </FormDescription>
                <Select
                  value={selectedExistingShipment || "new"}
                  onValueChange={(value) => {
                    if (value === "new") {
                      setSelectedExistingShipment(null);
                      form.setValue("dhlTrackingNumber", "");
                      form.setValue("packageCount", undefined);
                      form.setValue("packageType", undefined);
                    } else {
                      setSelectedExistingShipment(value);
                    }
                  }}
                  disabled={isPending || isSubmitting}
                >
                  <SelectTrigger data-testid="select-existing-shipment">
                    <SelectValue placeholder="Select shipment" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[300px]">
                    <SelectItem value="new">Create New Shipment</SelectItem>
                    {existingShipments.map((shipment) => (
                      <SelectItem key={shipment.consolidatedShipmentId} value={shipment.consolidatedShipmentId!}>
                        <div className="flex flex-col">
                          <span className="font-medium">{shipment.jobName}</span>
                          <span className="text-xs text-muted-foreground">
                            Tracking: {shipment.dhlTrackingNumber} • {shipment.packageCount} {shipment.packageType}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsTracking && (
              <>
                <FormField
                  control={form.control}
                  name="dhlTrackingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>DPD Local Tracking Number</FormLabel>
                        {!selectedExistingShipment && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowDpdDialog(true)}
                            data-testid="button-book-dpd"
                          >
                            <Truck className="h-3.5 w-3.5 mr-1.5" />
                            Book with DPD
                          </Button>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter manually or use 'Book with DPD'"
                          disabled={isPending || isSubmitting || !!selectedExistingShipment}
                          data-testid="input-dpdlocal-tracking"
                          readOnly={!!selectedExistingShipment}
                        />
                      </FormControl>
                      {selectedExistingShipment && (
                        <FormDescription className="text-xs">
                          Inherited from existing shipment
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="packageType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Package Type</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            // Auto-set quantity to 1 for bags
                            if (value === "bags") {
                              form.setValue("packageCount", 1);
                            }
                          }}
                          value={field.value}
                          disabled={isPending || isSubmitting || !!selectedExistingShipment}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-package-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="boxes" data-testid="option-boxes">Boxes</SelectItem>
                            <SelectItem value="bags" data-testid="option-bags">Bags</SelectItem>
                          </SelectContent>
                        </Select>
                        {selectedExistingShipment && (
                          <FormDescription className="text-xs">
                            Inherited from existing shipment
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="packageCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of {form.watch("packageType") === "bags" ? "Bags" : "Boxes"}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="1"
                            max={form.watch("packageType") === "bags" ? 1 : undefined}
                            placeholder="Enter count"
                            disabled={isPending || isSubmitting || form.watch("packageType") === "bags" || !!selectedExistingShipment}
                            readOnly={!!selectedExistingShipment}
                            data-testid="input-package-count"
                          />
                        </FormControl>
                        {form.watch("packageType") === "bags" && !selectedExistingShipment && (
                          <FormDescription className="text-xs">
                            Bags are limited to 1 per shipment
                          </FormDescription>
                        )}
                        {selectedExistingShipment && (
                          <FormDescription className="text-xs">
                            Inherited from existing shipment
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Show consolidation options only for "consolidated" shipping method when creating new shipment */}
                {selectedMethod === "consolidated" && !selectedExistingShipment && availableJobsForConsolidation.length > 0 && (
                  <div className="space-y-3">
                    <FormLabel className="flex items-center gap-2">
                      <PackageCheck className="h-4 w-4" />
                      Select Jobs to Consolidate Together
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Choose other completed orders being shipped with this one
                    </FormDescription>
                    <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3 bg-muted/20">
                      {availableJobsForConsolidation.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-start gap-3 p-2 rounded hover-elevate border bg-card"
                          data-testid={`consolidate-job-${job.id}`}
                        >
                          <Checkbox
                            id={`job-${job.id}`}
                            checked={selectedConsolidatedJobs.includes(job.id)}
                            onCheckedChange={() => toggleJobSelection(job.id)}
                            disabled={isPending || isSubmitting}
                            data-testid={`checkbox-consolidate-${job.id}`}
                          />
                          <label
                            htmlFor={`job-${job.id}`}
                            className="flex-1 cursor-pointer text-sm leading-tight"
                          >
                            <div className="font-medium">{job.jobName}</div>
                            {job.poNumber && (
                              <div className="text-xs text-muted-foreground">PO: {job.poNumber}</div>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedConsolidatedJobs.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {selectedConsolidatedJobs.length} {selectedConsolidatedJobs.length === 1 ? "job" : "jobs"} selected
                      </div>
                    )}
                  </div>
                )}

                {shippingCost && (
                  <Alert className="mt-4">
                    <Coins className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span className="font-medium">Shipping Cost:</span>
                      <span className="text-lg font-semibold">
                        {typeof shippingCost.cost === "number" 
                          ? formatPrice(shippingCost.cost)
                          : shippingCost.cost}
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {onHold && (
              <p className="text-xs text-muted-foreground">
                Waiting on another order for this customer? Use "Hold — ship later" to mark
                this one complete without shipping details. It stays in the Completed section
                marked as awaiting despatch, ready to consolidate when the other order is done.
              </p>
            )}

            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending || isSubmitting}
                data-testid="button-cancel-shipping"
              >
                Cancel
              </Button>
              {onHold && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleHold}
                  disabled={isPending || isSubmitting}
                  data-testid="button-hold-shipping"
                >
                  <PackageCheck className="h-4 w-4 mr-2" />
                  {isSubmitting || isPending ? "Saving..." : "Hold — ship later"}
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending || isSubmitting}
                data-testid="button-submit-shipping"
              >
                {isSubmitting || isPending ? "Marking Complete..." : "Mark Complete"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <DpdBookingDialog
      open={showDpdDialog}
      onOpenChange={setShowDpdDialog}
      jobId={currentJobId}
      jobIds={selectedConsolidatedJobs.length > 0 ? [currentJobId, ...selectedConsolidatedJobs] : undefined}
      prefillName={customerName}
      prefillAddress={customerAddress}
      prefillPhone={customerPhone}
      prefillEmail={customerEmail}
      onSuccess={(trackingNumber) => {
        form.setValue("dhlTrackingNumber", trackingNumber);
        setShowDpdDialog(false);
      }}
    />
    </>
  );
}

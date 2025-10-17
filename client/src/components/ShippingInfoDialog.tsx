import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Truck, Package } from "lucide-react";

const shippingSchema = z.object({
  shippingMethod: z.enum(["customer_collection", "consolidated", "direct_delivery"], {
    required_error: "Please select a shipping method",
  }),
  dhlTrackingNumber: z.string().optional(),
  packageCount: z.coerce.number().int().min(1).optional(),
  packageType: z.enum(["boxes", "bags"]).optional(),
}).refine((data) => {
  if (data.shippingMethod === "consolidated" || data.shippingMethod === "direct_delivery") {
    return data.dhlTrackingNumber && data.dhlTrackingNumber.trim().length > 0;
  }
  return true;
}, {
  message: "DHL tracking number is required for this shipping method",
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
});

type ShippingFormData = z.infer<typeof shippingSchema>;

interface ShippingInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ShippingFormData) => void;
  isPending?: boolean;
}

export function ShippingInfoDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
}: ShippingInfoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
    defaultValues: {
      shippingMethod: undefined,
      dhlTrackingNumber: "",
      packageCount: undefined,
      packageType: undefined,
    },
  });

  const selectedMethod = form.watch("shippingMethod");
  const needsTracking = selectedMethod === "consolidated" || selectedMethod === "direct_delivery";

  const handleSubmit = async (data: ShippingFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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

            {needsTracking && (
              <>
                <FormField
                  control={form.control}
                  name="dhlTrackingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DHL Tracking Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter DHL tracking number"
                          disabled={isPending || isSubmitting}
                          data-testid="input-dhl-tracking"
                        />
                      </FormControl>
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
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isPending || isSubmitting}
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
                            placeholder="Enter count"
                            disabled={isPending || isSubmitting}
                            data-testid="input-package-count"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending || isSubmitting}
                data-testid="button-cancel-shipping"
              >
                Cancel
              </Button>
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
  );
}

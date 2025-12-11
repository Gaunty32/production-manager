import { useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";

const trackingSchema = z.object({
  dhlTrackingNumber: z.string().optional(),
});

type TrackingFormData = z.infer<typeof trackingSchema>;

interface EditTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TrackingFormData) => void;
  isPending?: boolean;
  currentTrackingNumber?: string | null;
  jobName?: string;
}

export function EditTrackingDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
  currentTrackingNumber,
  jobName,
}: EditTrackingDialogProps) {
  const form = useForm<TrackingFormData>({
    resolver: zodResolver(trackingSchema),
    defaultValues: {
      dhlTrackingNumber: currentTrackingNumber || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        dhlTrackingNumber: currentTrackingNumber || "",
      });
    }
  }, [open, currentTrackingNumber, form]);

  const handleSubmit = async (data: TrackingFormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid="dialog-edit-tracking">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Edit Tracking Number
          </DialogTitle>
          <DialogDescription>
            {jobName ? `Update tracking info for "${jobName}"` : "Update the DHL tracking number for this order."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                      disabled={isPending}
                      data-testid="input-edit-tracking"
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
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel-tracking"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-tracking"
              >
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

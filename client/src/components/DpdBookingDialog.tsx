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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Truck, CheckCircle2, Download, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

const bookingSchema = z.object({
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientStreet: z.string().min(1, "Street is required"),
  recipientHouseNo: z.string().optional(),
  recipientCity: z.string().min(1, "City is required"),
  recipientPostcode: z.string().min(1, "Postcode is required"),
  recipientCountry: z.string().default("GB"),
  recipientPhone: z.string().optional(),
  recipientEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  packageCount: z.coerce.number().int().min(1).max(50).default(1),
  packageWeightGrams: z.coerce.number().int().min(100).max(70000).default(1000),
  reference: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

interface DpdBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobIds?: string[];
  jobReference?: string;
  prefillName?: string;
  prefillAddress?: string;
  prefillPhone?: string;
  prefillEmail?: string;
  onSuccess?: (trackingNumber: string) => void;
}

function downloadLabel(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseAddressField(address: string | null | undefined): Partial<BookingFormData> {
  if (!address) return {};
  const lines = address.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  const postcode = lines.find(l => /^[A-Z]{1,2}\d/.test(l.toUpperCase())) || "";
  const city = lines.length >= 2 ? lines[lines.length - (postcode ? 2 : 1)] : "";
  const street = lines[0] || "";
  return { recipientStreet: street, recipientCity: city, recipientPostcode: postcode };
}

export function DpdBookingDialog({
  open,
  onOpenChange,
  jobId,
  jobIds,
  jobReference,
  prefillName,
  prefillAddress,
  prefillPhone,
  prefillEmail,
  onSuccess,
}: DpdBookingDialogProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<{ trackingNumber: string; labelPdfBase64: string } | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const addressDefaults = parseAddressField(prefillAddress);

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      recipientName: prefillName || "",
      recipientStreet: addressDefaults.recipientStreet || "",
      recipientHouseNo: "",
      recipientCity: addressDefaults.recipientCity || "",
      recipientPostcode: addressDefaults.recipientPostcode || "",
      recipientCountry: "GB",
      recipientPhone: prefillPhone || "",
      recipientEmail: prefillEmail || "",
      packageCount: 1,
      packageWeightGrams: 1000,
      reference: jobReference || "",
    },
  });

  async function handleBook(data: BookingFormData) {
    setIsBooking(true);
    try {
      const allJobIds = jobIds?.length ? jobIds : [jobId];
      const response = await apiRequest("POST", "/api/dpd/book-shipment", {
        ...data,
        jobId,
        jobIds: allJobIds,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Booking failed" }));
        throw new Error(err.error || "DPD booking failed");
      }

      const bookingResult = await response.json();
      setResult(bookingResult);

      // Invalidate jobs cache so tracking number shows up
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });

      toast({
        title: "Shipment booked",
        description: `Tracking: ${bookingResult.trackingNumber}`,
      });

      onSuccess?.(bookingResult.trackingNumber);
    } catch (e: any) {
      toast({
        title: "DPD booking failed",
        description: e.message || "Could not book the shipment. Check the address and try again.",
        variant: "destructive",
      });
    } finally {
      setIsBooking(false);
    }
  }

  function handleClose() {
    if (!isBooking) {
      setResult(null);
      form.reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto" data-testid="dialog-dpd-booking">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Book DPD Shipment
          </DialogTitle>
          <DialogDescription>
            Enter the delivery address to book through DPD. A label PDF will be generated automatically.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="space-y-2">
                <p className="font-medium text-green-700 dark:text-green-400">Shipment booked successfully</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tracking number:</span>
                  <Badge variant="outline" className="font-mono text-sm" data-testid="text-tracking-number">
                    {result.trackingNumber}
                  </Badge>
                </div>
              </AlertDescription>
            </Alert>

            {result.labelPdfBase64 && (
              <Button
                className="w-full"
                onClick={() => downloadLabel(result.labelPdfBase64, `dpd-label-${result.trackingNumber}.pdf`)}
                data-testid="button-download-label"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Shipping Label (PDF)
              </Button>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} data-testid="button-close-dpd">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleBook)} className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Delivery Address</h3>

                <FormField
                  control={form.control}
                  name="recipientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company / Recipient Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Acme Ltd" data-testid="input-recipient-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name="recipientStreet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. High Street" data-testid="input-street" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="recipientHouseNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>No.</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 12" data-testid="input-house-no" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="recipientCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Manchester" data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="recipientPostcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postcode</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. M1 1AB" data-testid="input-postcode" className="uppercase" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="recipientPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="07700 900000" data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="recipientEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email <span className="text-muted-foreground font-normal">(for notifications)</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="customer@example.com" data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Parcel Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="packageCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Parcels</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min="1" max="50" data-testid="input-package-count" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="packageWeightGrams"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight per Parcel (g)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min="100" max="70000" placeholder="1000" data-testid="input-weight" />
                        </FormControl>
                        <FormDescription className="text-xs">e.g. 1000 = 1kg</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. PO number or job name" data-testid="input-reference" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Booking will generate a real DPD shipment and tracking number. The label PDF will open for printing once confirmed.
                </AlertDescription>
              </Alert>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose} disabled={isBooking} data-testid="button-cancel-dpd">
                  Cancel
                </Button>
                <Button type="submit" disabled={isBooking} data-testid="button-confirm-dpd-booking">
                  {isBooking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4 mr-2" />
                      Book & Get Label
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

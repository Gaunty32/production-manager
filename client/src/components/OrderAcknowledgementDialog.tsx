import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Copy, Check, ExternalLink } from "lucide-react";

interface OrderAcknowledgementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  jobNumber?: number | null;
  customerName: string;
  submitterEmail?: string | null;
  stripePaymentLink?: string | null;
  creditAccount?: boolean;
}

export function OrderAcknowledgementDialog({
  open,
  onOpenChange,
  jobId,
  jobName,
  jobNumber,
  customerName,
  submitterEmail,
  stripePaymentLink,
  creditAccount = true,
}: OrderAcknowledgementDialogProps) {
  const { toast } = useToast();
  const [customerEmail, setCustomerEmail] = useState(submitterEmail || "");
  const [linkCopied, setLinkCopied] = useState(false);

  const orderRef = jobNumber || jobId.slice(0, 8).toUpperCase();
  const effectiveLink = stripePaymentLink || "https://buy.stripe.com/bIY16peJJ5j99Us144";

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/send-acknowledgement`, {
        customerEmail,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: `Order acknowledgement sent to ${customerEmail}`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send",
        description: error.message || "Could not send the acknowledgement email",
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(effectiveLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-order-acknowledgement">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Order Acknowledgement
          </DialogTitle>
          <DialogDescription>
            Send an order acknowledgement email with a PDF summary to the customer.
            Ref: {orderRef} — {jobName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer Email */}
          <div className="space-y-1.5">
            <Label htmlFor="ack-customer-email">Customer Email</Label>
            <Input
              id="ack-customer-email"
              type="email"
              placeholder="customer@example.com"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              data-testid="input-ack-customer-email"
            />
            {submitterEmail && (
              <p className="text-xs text-muted-foreground">
                Pre-filled with the email of the person who placed this order
              </p>
            )}
          </div>

          {/* Payment Link */}
          <div className="space-y-1.5">
            <Label>
              {creditAccount ? "Stripe Payment Link (Credit Account)" : "Stripe Payment Link"}
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground truncate">
                {effectiveLink}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                title="Copy payment link"
                data-testid="button-copy-payment-link"
              >
                {linkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                asChild
                title="Open payment link"
                data-testid="button-open-payment-link"
              >
                <a href={effectiveLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {creditAccount
                ? "This link is included in the email alongside BACS payment details."
                : "This link is the primary payment method shown in the email."}
            </p>
          </div>

          {/* Email preview summary */}
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Preview</p>
            <p className="text-sm font-medium">
              Subject: Order Acknowledgement – New Bank Details – Ref: {orderRef}
            </p>
            <p className="text-sm text-muted-foreground">
              To: {customerEmail || <span className="italic">no email entered</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Includes: order details, payment instructions
              {creditAccount ? " (card + BACS)" : " (card payment link)"}, and a PDF attachment.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-acknowledgement"
          >
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!customerEmail.trim() || sendMutation.isPending}
            data-testid="button-send-acknowledgement"
          >
            <Mail className="h-4 w-4 mr-2" />
            {sendMutation.isPending ? "Sending…" : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ShareDispatchConfirmation({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  async function prepareLink() {
    setLoading(true);
    try {
      const response = await apiRequest("POST", `/api/customer-portal/jobs/${jobId}/dispatch-confirmation`);
      const { path } = await response.json();
      // Use the actual portal origin: works on the live app and in development.
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/delivery-update/")) {
        throw new Error("Could not create a valid delivery link");
      }
      setLink(url.href);
      setOpen(true);
    } catch (error) {
      toast({ title: "Could not create link", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", description: "You can now forward this dispatch confirmation to your customer." });
    } catch {
      toast({ title: "Copy the link below", description: "Press and hold the link field, then choose Copy." });
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="mt-2 max-w-full whitespace-normal h-auto min-h-9 text-left"
        onClick={prepareLink} disabled={loading} data-testid={`button-share-dispatch-${jobId}`}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <Copy className="mr-2 h-4 w-4 shrink-0" />}
        Share dispatch confirmation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Share your dispatch confirmation</DialogTitle>
            <DialogDescription>
              A Merox-branded confirmation for your customer. This is not live DPD tracking and contains no DPD tracking link or collection details.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-3">
            <label htmlFor={`dispatch-link-${jobId}`} className="text-sm font-medium">Customer delivery link</label>
            <Input id={`dispatch-link-${jobId}`} value={link} readOnly onFocus={event => event.target.select()} data-testid="input-dispatch-share-link" />
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view the confirmation. It expires after 90 days.
              The web address still uses this portal&apos;s domain.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyLink} data-testid="button-copy-dispatch-link"><Copy className="mr-2 h-4 w-4" />Copy link</Button>
              <Button variant="outline" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer" data-testid="link-preview-dispatch">
                  <ExternalLink className="mr-2 h-4 w-4" />Preview
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AbodeTrackingImport({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const search = useSearch();
  useEffect(() => {
    const supplied = new URLSearchParams(search).get("trackingImport");
    if (supplied && supplied.length <= 12_000) {
      setText(supplied); setOpen(true);
    }
  }, [search]);
  const { toast } = useToast();
  const rows = text.trim() ? text.trim().split(/\r?\n/).map(line => line.trim().split(/[\s,;]+/)) : [];
  const valid = rows.length > 0 && rows.length <= 100 && rows.every(row =>
    row.length === 2 && /^[A-Za-z0-9-]{1,80}$/.test(row[0]) && /^\d{10}$/.test(row[1]));
  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Enter one order number and 10-digit DPD number per line");
      const response = await apiRequest("POST", "/api/abode/tracking/import", {
        entries: rows.map(([orderNumber, trackingNumber]) => ({ orderNumber, trackingNumber })),
      });
      return response.json();
    },
    onSuccess: result => {
      toast({ title: "Tracking saved", description: `${result.saved} order tracking numbers are now available to the customer.` });
      setOpen(false); setText(""); onSaved();
    },
    onError: error => toast({ title: "Tracking not saved", description: error.message, variant: "destructive" }),
  });
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Save existing tracking</Button>
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save existing DPD tracking</DialogTitle>
          <DialogDescription>Add numbers from existing labels or DPD Shipment Review. No label is required, no shipment is purchased and no email is sent. Existing despatch and delivery dates stay unchanged.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm font-medium">
          <span>Order number and DPD consignment number, one pair per line</span>
          <textarea className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-sm"
            value={text} onChange={event => setText(event.target.value)} disabled={save.isPending}
            placeholder="Order number  DPD number" autoComplete="off" />
        </label>
        {rows.length > 0 && <p className="text-sm" role="status">{valid ? `${rows.length} order(s) ready to save. Check each pair against DPD before confirming.` : "Each line needs an order number followed by a 10-digit DPD number."}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Confirm and save tracking"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

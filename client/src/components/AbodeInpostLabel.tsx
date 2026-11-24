import { useState } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AbodeFileDropZone } from "@/components/AbodeFileDropZone";
import { prepareAbodeDeliveryNote } from "@/lib/abodeDeliveryNoteUpload";

export function AbodeInpostLabel({ jobId, orderNumber, onChanged }: {
  jobId: string; orderNumber: string; onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = new URLSearchParams(useSearch());
  const [useSupplied, setUseSupplied] = useState(true);
  const suppliedKey = useSupplied && query.get("inpostOrder") === orderNumber ? query.get("inpostLabelKey") : null;
  return <details open={suppliedKey ? true : undefined} className="mt-3 rounded-md border border-stone-200 bg-white p-3">
    <summary className="cursor-pointer text-xs font-semibold">Already booked with InPost? Save its label</summary>
    <div className="mt-3 space-y-3 text-xs">
      <p>For order {orderNumber}. Check the recipient and address before saving. This records InPost instead of Royal Mail; it does not book or confirm despatch.</p>
      <AbodeFileDropZone label="Choose or drop the existing InPost label PDF" accept=".pdf,application/pdf" disabled={busy}
        onFiles={files => {
          setFile(null); setError(""); setUseSupplied(false);
          if (files.length !== 1 || files[0].size > 1024 * 1024) { setError("Choose one label PDF up to 1 MB."); return; }
          const next = files[0];
          void prepareAbodeDeliveryNote(next).catch(reason => setError(reason.message));
          setFile(next);
        }} />
      {file && <p className="break-all">{file.name}</p>}
      {suppliedKey && <p className="font-medium">The InPost PDF supplied in chat is ready to save.</p>}
      <label className="block space-y-1">
        <span>Full InPost tracking number (optional)</span>
        <Input value={tracking} onChange={event => setTracking(event.target.value)} disabled={busy} maxLength={80} />
        <span className="block text-stone-500">Leave blank if the number on the label is masked.</span>
      </label>
      <Button size="sm" className="min-h-10 w-full" disabled={(!file && !suppliedKey) || busy} onClick={async () => {
        if ((!file && !suppliedKey) || busy) return;
        setBusy(true); setError("");
        try {
          const pdf = file ? await prepareAbodeDeliveryNote(file) : null;
          const query = new URLSearchParams({ trackingNumber: tracking.trim() });
          const response = await fetch(`/api/abode/orders/${encodeURIComponent(jobId)}/inpost-label?${query}`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": pdf ? "application/pdf" : "application/json" },
            body: pdf || JSON.stringify({ objectKey: suppliedKey }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not save this label.");
          onChanged();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not save this label.");
        } finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save InPost label to this order"}</Button>
      {error && <p role="alert" className="text-rose-800">{error}</p>}
    </div>
  </details>;
}

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { uploadAbodeDeliveryNote } from "@/lib/abodeDeliveryNoteUpload";
import { useToast } from "@/hooks/use-toast";

export function AbodeOrderDeliveryNoteUpload({ baseUrl, jobId, orderNumber, isStaff, onChanged }: {
  baseUrl: string;
  jobId: string;
  orderNumber: string;
  isStaff: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const savedKey = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const save = async () => {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Use the same exact-order validation as the bulk uploader before writing
      // anything to storage. Selecting an order must never bypass filename checks.
      const response = await apiRequest("POST", `${baseUrl}/delivery-notes/preview`, { fileNames: [file.name] });
      const result = await response.json();
      if (result.files?.[0]?.status !== "matched" || result.files[0].jobId !== jobId) {
        throw new Error(`This filename does not match this order. Name the PDF dispatch-note-${orderNumber}.pdf and select it again.`);
      }
      if (result.files[0].existingCount > 0) {
        onChanged();
        throw new Error("This order already has a delivery note. Another upload is not needed.");
      }
      const objectKey = savedKey.current || await uploadAbodeDeliveryNote(file, { baseUrl, isStaff, jobId });
      savedKey.current = objectKey;
      const saved = await apiRequest("POST", `${baseUrl}/delivery-notes`, { objectKey, jobId, fileName: file.name });
      const savedResult = await saved.json();
      savedKey.current = null;
      setFile(null);
      if (input.current) input.current.value = "";
      toast({ title: savedResult.skipped ? "Delivery note already attached" : "Delivery note saved", description: savedResult.skipped ? "The existing PDF has been kept." : `The PDF is attached to order ${orderNumber}.` });
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The delivery note could not be saved. Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return <div className="mt-3 space-y-2">
    <input ref={input} className="sr-only" type="file" accept=".pdf,application/pdf"
      aria-label={`Choose delivery note for order ${orderNumber}`} disabled={busy}
      onChange={event => {
        const next = event.target.files?.[0];
        savedKey.current = null;
        setError("");
        setFile(null);
        if (!next) return;
        if (!/\.pdf$/i.test(next.name) || !next.size || next.size > 10 * 1024 * 1024) {
          setError("Choose a PDF delivery note up to 10 MB.");
          event.target.value = "";
          return;
        }
        setFile(next);
      }} />
    <Button type="button" size="sm" variant="outline" className="min-h-10 w-full sm:w-auto" disabled={busy}
      onClick={() => input.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Choose delivery note PDF</Button>
    <p className="break-words text-xs leading-5 text-stone-500">Name the file dispatch-note-{orderNumber}.pdf. Maximum 10 MB. One delivery note per order.</p>
    {file && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
      <span className="min-w-0 flex-1 break-all text-xs text-stone-700">{file.name}</span>
      <Button type="button" size="sm" className="min-h-10 w-full sm:w-auto" disabled={busy} onClick={() => void save()}>
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{busy ? "Uploading…" : error ? "Retry upload" : "Upload to this order"}
      </Button>
    </div>}
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs leading-5 text-rose-900">{error}</p>}
  </div>;
}

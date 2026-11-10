import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, FileText, ImagePlus, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { inspectAbodeReferenceFile, uploadAbodeReferenceFile } from "@/lib/abodeReferenceUpload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AbodeSamplePreview } from "@/components/AbodeSamplePreview";
import { stockingFontLabel } from "@shared/abode";

export type AbodeDigitalSample = {
  id: string;
  version: number;
  fileName: string;
  fileUrl: string;
  fileType: string;
  status: "pending_approval" | "amends_required" | "approved";
  customerNotes: string | null;
  decidedAt: string | null;
  createdAt: string;
};

type Props = {
  jobId: string;
  itemId: string;
  name: string;
  font: string;
  colour: string;
  thread: string;
  samples?: AbodeDigitalSample[];
  isStaff: boolean;
  canApprove: boolean;
  canUpload: boolean;
  onChanged: () => void;
};

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function readableDate(value: string | null) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: AbodeDigitalSample["status"]) {
  return status === "approved" ? "Approved" : status === "amends_required" ? "Changes requested" : "Awaiting customer approval";
}

export function AbodeStockingSample({ jobId, itemId, name, font, colour, thread, samples = [], isStaff, canApprove, canUpload, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectKeyRef = useRef<string | null>(null);
  const { toast } = useToast();
  const latest = samples[0];
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSample, setReviewSample] = useState<AbodeDigitalSample | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [decisionIntent, setDecisionIntent] = useState<"approved" | "amends_required">("approved");
  const [uploadError, setUploadError] = useState("");

  const uploadPath = `/api/abode/orders/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/samples/upload`;
  const saveSample = async () => {
    if (!selectedFile || uploading || !canUpload) return;
    setUploading(true);
    setUploadError("");
    try {
      let objectKey = objectKeyRef.current;
      if (!objectKey) {
        objectKey = await uploadAbodeReferenceFile(selectedFile, { fallbackUrl: uploadPath });
        objectKeyRef.current = objectKey;
      }
      await apiRequest("POST", `/api/abode/orders/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/samples`, {
        objectKey,
        fileName: selectedFile.name,
      });
      toast({ title: "Digital sample added", description: "The latest version is ready for customer review." });
      objectKeyRef.current = null;
      setSelectedFile(null);
      setRevisionOpen(false);
      if (inputRef.current) inputRef.current.value = "";
      onChanged();
    } catch (error) {
      setUploadError(friendlyError(error));
      toast({ title: "Sample upload failed", description: `${friendlyError(error)} The uploaded file is kept ready for a safe retry.`, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const chooseFile = async (file?: File) => {
    if (!file || !canUpload || uploading) return;
    setUploading(true);
    setSelectedFile(null);
    objectKeyRef.current = null;
    setUploadError("");
    try {
      await inspectAbodeReferenceFile(file);
    } catch (error) {
      toast({ title: "Cannot use this sample", description: friendlyError(error), variant: "destructive" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    } finally {
      setUploading(false);
    }
    setSelectedFile(file);
    objectKeyRef.current = null;
    setUploadError("");
    if (latest) setRevisionOpen(true);
    else void (async () => {
      setUploading(true);
      try {
        let objectKey = await uploadAbodeReferenceFile(file, { fallbackUrl: uploadPath });
        objectKeyRef.current = objectKey;
        await apiRequest("POST", `/api/abode/orders/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/samples`, { objectKey, fileName: file.name });
        toast({ title: "Digital sample added", description: "The latest version is ready for customer review." });
        objectKeyRef.current = null;
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = "";
        onChanged();
      } catch (error) {
        setUploadError(friendlyError(error));
        toast({ title: "Sample upload failed", description: `${friendlyError(error)} The uploaded file is kept ready for a safe retry.`, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    })();
  };

  const submitDecision = async (decision: "approved" | "amends_required") => {
    if (!reviewSample || !latest || latest.id !== reviewSample.id || latest.status !== "pending_approval" || !canApprove || isStaff || decisionPending || (decision === "approved" && !confirmed)) return;
    const trimmedNotes = notes.trim();
    if (decision === "amends_required" && !trimmedNotes) return;
    setDecisionPending(true);
    try {
      await apiRequest("POST", `/api/customer-portal/abode/orders/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/samples/${encodeURIComponent(reviewSample.id)}/decision`, {
        decision,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      toast({ title: decision === "approved" ? "Sample approved" : "Changes sent", description: decision === "approved" ? "This stocking is approved for production." : "Your notes have been sent to the production team." });
      setReviewOpen(false);
      setConfirmed(false);
      setNotes("");
      onChanged();
    } catch (error) {
      toast({ title: "Could not save your decision", description: friendlyError(error), variant: "destructive" });
    } finally {
      setDecisionPending(false);
    }
  };

  const statusClass = (status: AbodeDigitalSample["status"]) => status === "approved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : status === "amends_required" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-[#d6c3ae] bg-[#fbf8f3] text-[#71482e]";
  const openReview = (sample: AbodeDigitalSample, intent: "approved" | "amends_required") => {
    setConfirmed(false);
    setReviewSample(sample);
    setDecisionIntent(intent);
    setNotes("");
    setReviewOpen(true);
  };

  return (
    <section className="mt-3 rounded-xl border border-stone-200 bg-white p-3 sm:p-4" aria-label={`Digital sample approval for ${name || "stocking"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-stone-900">Digital sample approval</h4>
            {latest ? <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(latest.status)}`}>
              {latest.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : latest.status === "pending_approval" ? <Clock3 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {statusLabel(latest.status)}
            </span> : <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">No sample yet</span>}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-stone-600">
            {isStaff
              ? "A sample is reviewed for this individual stocking. Final production photos are added separately after completion."
              : "Please check this stocking’s name, font and colours before production. Each stocking has its own approval."}
          </p>
        </div>
        {isStaff && canUpload && (
          <>
            <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" aria-label={`Upload digital sample for ${name}`} disabled={uploading} onChange={(event) => chooseFile(event.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {uploading ? "Uploading…" : latest ? "Upload revision" : "Add sample"}
            </Button>
          </>
        )}
      </div>
      {isStaff && canUpload && selectedFile && !latest && uploadError && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"><span>{uploadError}</span><Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => void saveSample()}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Retry upload</Button></div>}

      {latest ? (
        <div className="mt-3 rounded-lg border border-stone-200 bg-[#fbfaf7] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {latest.fileType.toLowerCase().includes("pdf") || /\.pdf$/i.test(latest.fileName)
                ? <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#8a4e3d]" />
                : <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-[#8a4e3d]" />}
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-stone-800">Version {latest.version} · {latest.fileName}</p>
                <p className="mt-1 text-xs text-stone-500">{latest.status === "pending_approval" ? "Uploaded" : latest.status === "approved" ? "Approved" : "Decision recorded"} {readableDate(latest.decidedAt || latest.createdAt)}</p>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <AbodeSamplePreview sample={latest} name={name} />
            <p className="mt-2 text-xs text-stone-500">Hover to enlarge, or select the preview to inspect it on screen.</p>
          </div>
          {latest.customerNotes && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950"><span className="font-semibold">Customer notes: </span>{latest.customerNotes}</p>}
          {canApprove && !isStaff && latest.status === "pending_approval" && (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-stone-200 pt-3 sm:flex">
              <Button type="button" className="min-h-11" onClick={() => openReview(latest, "approved")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve sample</Button>
              <Button type="button" variant="outline" className="min-h-11 border-amber-300 text-amber-950 hover:bg-amber-50" onClick={() => openReview(latest, "amends_required")}><AlertCircle className="mr-1.5 h-4 w-4" />Reject sample</Button>
            </div>
          )}
          {isStaff && latest.status === "pending_approval" && <p className="mt-3 text-xs font-medium text-[#71482e]">Waiting for the customer to review this version. Staff cannot approve on their behalf.</p>}
          {!isStaff && !canApprove && latest.status === "pending_approval" && <p className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">This is a staff preview only. To approve or request changes, sign in through your customer account.</p>}
        </div>
      ) : <div className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-600">{canUpload ? "No digital sample has been uploaded for this stocking yet." : "The sample for this stocking will appear here when it is ready."}</div>}

      {samples.length > 1 && <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-stone-600 underline underline-offset-2">Earlier versions ({samples.length - 1})</summary>
        <ol className="mt-2 space-y-2">
          {samples.slice(1).map((sample) => <li key={sample.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-100 bg-stone-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="break-all text-xs font-medium text-stone-700">v{sample.version} · {sample.fileName}</p>
              <p className="mt-0.5 text-xs text-stone-500">{statusLabel(sample.status)} · {readableDate(sample.decidedAt || sample.createdAt)}</p>
              {sample.customerNotes && <p className="mt-1 break-words text-xs leading-4 text-amber-900">Customer notes: {sample.customerNotes}</p>}
            </div>
            <div className="w-full sm:w-56">
              <AbodeSamplePreview sample={sample} name={name} />
            </div>
          </li>)}
        </ol>
      </details>}

      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!decisionPending) setReviewOpen(open); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-stone-200 bg-[#fbfaf7]">
          <DialogHeader><DialogTitle>{decisionIntent === "approved" ? "Approve this stocking sample" : "Reject this stocking sample"}</DialogTitle><DialogDescription>Check the exact personalisation shown here. This decision applies only to this stocking, not the rest of the order.</DialogDescription></DialogHeader>
          {reviewSample && <p className="text-sm font-semibold">Digital sample version {reviewSample.version}</p>}
          {reviewSample && (latest?.id !== reviewSample.id || latest.status !== "pending_approval") && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">This review is no longer current. A newer version or decision is now on file. Close this review and check the latest sample before deciding.</p>}
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Approval details</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2"><dt className="text-xs text-stone-500">Name</dt><dd className="mt-0.5 break-words text-lg font-semibold">{name || "Name not provided"}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-stone-500">Font</dt><dd className="mt-0.5 break-words font-medium">{stockingFontLabel(font) || "—"}</dd></div>
              <div><dt className="text-xs text-stone-500">Stocking colour</dt><dd className="mt-0.5 font-medium">{colour || "—"}</dd></div>
              <div><dt className="text-xs text-stone-500">Thread colour</dt><dd className="mt-0.5 font-medium">{thread || "—"}</dd></div>
            </dl>
          </div>
          {reviewSample && <div className="rounded-lg border border-stone-200 bg-white p-2">
            <AbodeSamplePreview sample={reviewSample} name={name} />
            <p className="px-1 pb-1 pt-2 text-xs text-stone-500">Inspect the on-screen preview before confirming your decision.</p>
          </div>}
          {decisionIntent === "approved" && <label className="flex items-start gap-3 rounded-lg border border-[#d6c3ae] bg-[#fbf8f3] p-3 text-sm leading-5 text-stone-800">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#344e43]" />
            <span>I have reviewed the sample and the name, font and colours above are correct.</span>
          </label>}
          <label className="space-y-1.5 text-sm font-medium">
            Notes for the production team{decisionIntent === "amends_required" ? <span className="ml-1 text-amber-800">(required to reject)</span> : <span className="ml-1 font-normal text-stone-500">(optional)</span>}
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} required={decisionIntent === "amends_required"} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-[#344e43] focus-visible:ring-offset-1" placeholder={decisionIntent === "amends_required" ? "Describe what needs changing" : "Add a note (optional)"} />
          </label>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setReviewOpen(false)} disabled={decisionPending}>Back to sample</Button>
            <Button type="button" variant={decisionIntent === "approved" ? "default" : "outline"} className={`min-h-11 ${decisionIntent === "amends_required" ? "border-amber-300 text-amber-950 hover:bg-amber-50" : ""}`} onClick={() => void submitDecision(decisionIntent)} disabled={(decisionIntent === "approved" && !confirmed) || (decisionIntent === "amends_required" && !notes.trim()) || decisionPending || latest?.id !== reviewSample?.id || latest?.status !== "pending_approval"}>{decisionPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{decisionIntent === "approved" ? "Confirm approval" : "Reject sample"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revisionOpen} onOpenChange={(open) => { if (!uploading) setRevisionOpen(open); }}>
        <DialogContent className="border-stone-200 bg-[#fbfaf7]">
          <DialogHeader><DialogTitle>Upload a new sample version?</DialogTitle><DialogDescription>This stocking already has a sample. Uploading this file creates a new version and requires fresh customer approval, even if an earlier version was approved or had changes requested.</DialogDescription></DialogHeader>
          <p className="break-all rounded-lg bg-white p-3 text-sm font-medium">{selectedFile?.name}</p>
          {uploadError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{uploadError} The uploaded file is kept ready for retry.</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setRevisionOpen(false); setSelectedFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</Button><Button type="button" onClick={() => void saveSample()} disabled={!selectedFile || uploading}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Upload new version</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

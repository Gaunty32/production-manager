import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Printer, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { uploadAbodeDeliveryNote } from "@/lib/abodeDeliveryNoteUpload";
import { AbodeOrderDeliveryNoteUpload } from "@/components/AbodeOrderDeliveryNoteUpload";

export type AbodeDeliveryNote = {
  id: string;
  fileName: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: string;
};

type PreviewMatch = {
  fileName: string;
  orderNumber: string | null;
  jobId: string | null;
  status: "matched" | "not_found" | "invalid";
  existingCount: number;
};

type UploadState = "queued" | "uploading" | "success" | "error";
type UploadRow = PreviewMatch & { file: File; state: UploadState; message?: string; objectKey?: string };

interface AbodeDeliveryNotesProps {
  baseUrl: string;
  isStaff: boolean;
  onChanged: () => void;
}

interface AbodeOrderDeliveryNotesProps {
  notes?: AbodeDeliveryNote[];
  baseUrl: string;
  jobId: string;
  orderNumber: string;
  isStaff: boolean;
  onChanged: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 50;

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function addedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AbodeDeliveryNotes({ baseUrl, isStaff, onChanged }: AbodeDeliveryNotesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [matchAttempt, setMatchAttempt] = useState(0);
  const { toast } = useToast();

  const chooseFiles = (fileList: FileList | File[]) => {
    if (lock.current) return;
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    setPreviewError("");
    if (inputRef.current) inputRef.current.value = "";
    const invalid = incoming.find((file) => !/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf"));
    if (invalid) {
      setPreviewError(`${invalid.name} is not a PDF. Choose PDF files only.`);
      return;
    }
    const tooLarge = incoming.find((file) => !file.size || file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setPreviewError(`${tooLarge.name} is empty or over 10 MB. Each PDF must contain data and be 10 MB or smaller.`);
      return;
    }
    const identity = (file: File) => JSON.stringify([file.name, file.size, file.lastModified]);
    const seen = new Set(rows.map(row => identity(row.file)));
    const additions = incoming.filter(file => {
      const key = identity(file);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (rows.length + additions.length > MAX_FILES) {
      setPreviewError("Keep no more than 50 PDFs in the list. Your existing selection has been kept.");
      return;
    }
    if (!additions.length) return;
    setHasPreview(false);
    setRows(current => [...current, ...additions.map((file): UploadRow => ({
      file,
      fileName: file.name,
      orderNumber: null,
      jobId: null,
      status: "invalid",
      existingCount: 0,
      state: "queued",
    }))]);
  };

  // Match whenever the selected files change, not when match/upload metadata
  // changes. Cancel stale responses when another batch is added mid-request.
  const selectionKey = JSON.stringify(rows.map(row => [row.file.name, row.file.size, row.file.lastModified]));
  useEffect(() => {
    if (!rows.length) {
      setHasPreview(false);
      setIsPreviewing(false);
      return;
    }
    let cancelled = false;
    setIsPreviewing(true);
    setHasPreview(false);
    setPreviewError("");
    void (async () => { try {
      const response = await apiRequest("POST", `${baseUrl}/delivery-notes/preview`, {
        fileNames: rows.map((row) => row.file.name),
      });
      const result = await response.json() as { files: PreviewMatch[] };
      if (cancelled) return;
      if (!Array.isArray(result.files)) throw new Error("The preview response was not valid. Please try again.");
      const byName = new Map(result.files.map((item) => [item.fileName, item]));
      setRows((current) => current.map((row) => {
        const match = byName.get(row.file.name);
        return match
          ? { ...row, ...match, state: row.state === "success" ? "success" : "queued", message: row.state === "success" ? row.message : undefined }
          : { ...row, status: "invalid", orderNumber: null, jobId: null, state: "queued", message: "No match returned for this file." };
      }));
      setHasPreview(true);
    } catch (error) {
      if (cancelled) return;
      setPreviewError(friendlyError(error));
      toast({ title: "Could not match delivery notes", description: friendlyError(error), variant: "destructive" });
    } finally {
      if (!cancelled) setIsPreviewing(false);
    } })();
    return () => { cancelled = true; };
  }, [selectionKey, matchAttempt, baseUrl]);

  const uploadMatched = async () => {
    if (lock.current || isPreviewing || isUploading) return;
    const matched = rows.filter((row) => row.status === "matched" && row.jobId && !row.existingCount && row.state !== "success");
    if (!matched.length) return;
    lock.current = true;
    setIsUploading(true);
    let completed = 0;
    let skipped = 0;
    let failures = 0;
    const attachedOrders = new Set<string>();
    for (const row of matched) {
      if (attachedOrders.has(row.jobId!)) {
        skipped++;
        setRows(current => current.map(item => item.file === row.file ? { ...item, existingCount: 1, state: "queued" } : item));
        continue;
      }
      setRows((current) => current.map((item) => item.file === row.file ? { ...item, state: "uploading", message: undefined } : item));
      try {
        let objectKey = row.objectKey;
        if (!objectKey) {
          const key = await uploadAbodeDeliveryNote(row.file, { baseUrl, isStaff, jobId: row.jobId! });
          objectKey = key;
          setRows((current) => current.map((item) => item.file === row.file ? { ...item, objectKey: key } : item));
        }
        const response = await apiRequest("POST", `${baseUrl}/delivery-notes`, {
          objectKey,
          fileName: row.file.name,
          jobId: row.jobId,
        });
        const result = await response.json();
        attachedOrders.add(row.jobId!);
        if (result.skipped) skipped++;
        else completed++;
        setRows((current) => current.map((item) => item.file === row.file
          ? result.skipped ? { ...item, state: "queued", existingCount: 1 } : { ...item, state: "success", message: "Saved to the order." }
          : item.jobId === row.jobId ? { ...item, existingCount: 1 } : item));
      } catch (error) {
        failures++;
        setRows((current) => current.map((item) => item.file === row.file ? { ...item, state: "error", message: friendlyError(error) } : item));
      }
    }
    lock.current = false;
    setIsUploading(false);
    onChanged();
    if (failures) {
      toast({
        title: `${completed} saved · ${failures} failed`,
        description: "Review each file below. Use Upload matched to retry failed PDFs.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Delivery notes processed", description: `${completed} PDF${completed === 1 ? "" : "s"} saved.${skipped ? ` ${skipped} skipped because the order already has a note.` : ""}` });
    }
  };

  const matchedCount = new Set(rows.filter((row) => row.status === "matched" && row.jobId && !row.existingCount && row.state !== "success").map(row => row.jobId)).size;

  return (
    <section className="mb-6 rounded-2xl border border-stone-200 bg-white shadow-sm" aria-labelledby="delivery-notes-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-4 py-4 md:px-5">
        <div className="flex gap-3">
          <div className="rounded-xl bg-[#f3e7df] p-3 text-[#8a4e3d]"><FileText className="h-5 w-5" /></div>
          <div>
            <h2 id="delivery-notes-title" className="font-semibold">Customer-supplied delivery notes</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-stone-600">
              {isStaff ? "Add the original PDF to the matching parcel. The order number is read from the filename." : "Upload the original note you would like enclosed with your parcel."}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          aria-label="Choose customer delivery note PDFs"
          disabled={isUploading}
          onChange={(event) => event.target.files && chooseFiles(event.target.files)}
        />
        <button
          type="button"
          className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#344e43] focus-visible:ring-offset-2 ${isDragging ? "border-[#344e43] bg-emerald-50" : "border-stone-300 bg-stone-50 hover:border-[#344e43] hover:bg-stone-100"}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            chooseFiles(event.dataTransfer.files);
          }}
          disabled={isUploading}
        >
          <Upload aria-hidden="true" className="h-5 w-5 text-[#344e43]" />
          <span className="text-sm font-semibold">{isDragging ? "Drop delivery-note PDFs here" : "Choose or drop one or more delivery-note PDFs"}</span>
          <span className="text-xs text-stone-500">Matches automatically · add more in another drop · up to 10 MB each · maximum 50 files</span>
        </button>
        <p className="mt-3 text-xs leading-5 text-stone-500">Import the orders first, then name each PDF dispatch-note-ORDERNUMBER.pdf, for example dispatch-note-12345678.pdf. Original PDFs are kept unchanged, including every page.</p>

        {previewError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{previewError}</p>}

        {rows.length > 0 && <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">{rows.length} PDF{rows.length === 1 ? "" : "s"} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isPreviewing || isUploading} onClick={() => setMatchAttempt(value => value + 1)}>
                {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {isPreviewing ? "Matching…" : hasPreview ? "Check matches again" : "Retry matching"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={isUploading} onClick={() => { setRows([]); setPreviewError(""); }}>Clear list</Button>
              <Button type="button" size="sm" disabled={!matchedCount || !hasPreview || isPreviewing || isUploading} onClick={() => void uploadMatched()}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {isUploading ? "Uploading…" : `Upload matched (${matchedCount})`}
              </Button>
            </div>
          </div>
          {hasPreview && rows.some((row) => row.status === "matched" && row.existingCount > 0) && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              Orders that already have a delivery note are skipped. Each order needs only one delivery note.
            </p>
          )}
          {hasPreview && rows.some((row) => row.status === "not_found" || row.status === "invalid") && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              Unmatched or invalid filenames will not be uploaded. Check the order number in the filename before trying again.
            </p>
          )}
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto" aria-label="Delivery note match results">
            {rows.map((row, index) => (
              <li key={`${row.file.name}-${index}`} className={`rounded-lg border px-3 py-2.5 ${row.status === "matched" ? "border-stone-200 bg-[#fbfaf7]" : hasPreview ? "border-amber-200 bg-amber-50/70" : "border-stone-200 bg-stone-50"}`}>
                <div className="flex min-w-0 items-start gap-2">
                  {row.state === "uploading" || (isPreviewing && !hasPreview)
                    ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#8a4e3d]" />
                    : row.state === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    : row.status === "matched" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#344e43]" />
                    : hasPreview ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium text-stone-800">{row.file.name}</p>
                    <p className={`mt-0.5 text-xs leading-5 ${row.state === "error" || row.status !== "matched" && hasPreview ? "text-amber-900" : "text-stone-500"}`}>
                      {!hasPreview ? isPreviewing ? "Matching automatically…" : "Waiting for matching — use Retry matching if needed" : row.status === "matched"
                        ? `Matched to order ${row.orderNumber ?? "—"}${row.existingCount && row.state !== "success" ? " · Already attached — skipped" : ""}`
                        : row.status === "not_found" ? "No order found for this filename"
                        : row.message ?? "Filename could not be matched"}
                      {row.state === "uploading" && " · Uploading"}
                      {row.state === "success" && ` · ${row.message}`}
                      {row.state === "error" && ` · Upload failed: ${row.message}`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {rows.some((row) => row.state === "success") && !isUploading && (
            <p role="status" className="mt-3 text-xs text-stone-600">Successful uploads are saved and will not be repeated. Use Upload matched to retry any failed PDFs.</p>
          )}
        </div>}
      </div>
    </section>
  );
}

export function AbodeOrderDeliveryNotes({ notes = [], baseUrl, jobId, orderNumber, isStaff, onChanged }: AbodeOrderDeliveryNotesProps) {
  return (
    <section className="border-t border-stone-100 px-4 py-3 md:px-5" aria-label="Customer-supplied delivery notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-stone-800">Delivery note</h4>
        {notes.length > 0 && <span className="text-xs text-stone-500">PDF attached</span>}
      </div>
      <p className={`mt-1 text-xs ${notes.length ? "text-stone-500" : "text-amber-900"}`}>{notes.length ? "Check the saved PDF using Open. To print all pages, choose Print in the PDF viewer." : "No delivery note is saved to this order yet. Upload the original PDF here."}</p>
      <ul className="mt-2 space-y-2">
        {notes.slice(0, 1).map((note) => (
          <li key={note.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-[#f8f6f2] px-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#8a4e3d]" />
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-stone-800">{note.fileName}</p>
                <p className="mt-0.5 text-xs text-stone-500">Added {addedDate(note.createdAt)}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-3 text-sm font-medium text-[#344e43]">
              <a className="inline-flex min-h-9 items-center gap-1 underline underline-offset-2" href={note.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${note.fileName} in a new tab`}>
                <ExternalLink className="h-3.5 w-3.5" />Open
              </a>
              <a className="inline-flex min-h-9 items-center gap-1 underline underline-offset-2" href={note.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${note.fileName} to print`}>
                <Printer className="h-3.5 w-3.5" />Print
              </a>
            </div>
          </li>
        ))}
      </ul>
      {!notes.length && <AbodeOrderDeliveryNoteUpload baseUrl={baseUrl} jobId={jobId} orderNumber={orderNumber} isStaff={isStaff} onChanged={onChanged} />}
    </section>
  );
}


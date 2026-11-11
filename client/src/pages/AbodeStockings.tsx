import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertCircle, ArrowDownToLine, Check, CheckCircle2, Clock3, ExternalLink, FileSpreadsheet, Loader2, PackageCheck, RefreshCw, Search, Send, ShieldAlert, Truck, Upload, Printer } from "lucide-react";
import { getDpdTrackingUrl } from "@shared/dpd-tracking";
import { stockingFontLabel } from "@shared/abode";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AbodeFinishedPhotos, type AbodeFinishedPhoto } from "@/components/AbodeFinishedPhotos";
import { AbodeOrderDeliveryNotes, type AbodeDeliveryNote } from "@/components/AbodeDeliveryNotes";
import { uploadAbodeDeliveryNote } from "@/lib/abodeDeliveryNoteUpload";

type StockingItem = {
  id: string;
  quantity: number;
  completed: boolean;
  description: string;
  stockingDetails: { colour: string; font: string; thread: string; name: string };
  agreedUnitPrice: number | null;
};
type StockingOrder = {
  id: string;
  jobNumber: number;
  poNumber: string;
  orderNumber: string;
  jobName: string;
  completed: boolean;
  invoiceStatus: string;
  dhlTrackingNumber: string | null;
  shippingCost: string | null;
  dispatchEmailQueuedAt: string | null;
  recipient: { name: string; line1: string; line2: string; town: string; county: string; postcode: string };
  shippingRoute: "dpd" | "royal_mail";
  shipmentState: "unbooked" | "booking" | "booked" | "review";
  labelAvailable: boolean;
  bookedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  trackingStatus: string | null;
  trackingCheckedAt: string | null;
  trackingError: string | null;
  items: StockingItem[];
  finishedPhotos?: AbodeFinishedPhoto[];
  deliveryNotes?: AbodeDeliveryNote[];
};
type StockingsData = {
  enabled: boolean;
  customer: { id: string; name: string; logoUrl: string | null };
  completedCount: number;
  currentRate: number;
  trackingConfigured: boolean;
  orders: StockingOrder[];
};
type PreviewData = {
  orders: { orderNumber: string; recipient: StockingOrder["recipient"]; shippingRoute: string; items: { colour: string; font: string; thread: string; name: string }[]; existing: boolean; detailsChanged: boolean }[];
  stockingCount: number;
  orderCount: number;
};
type LabelResult = { jobId: string; orderNumber: string; status: "booked" | "review" | "error" | "royal_mail"; error?: string; warning?: boolean; trackingNumber?: string | null; labelHtml?: string };
type ImportResult = { created: number; skipped: number; flaggedOrders: { orderNumber: string; detailsChanged: boolean }[]; labelResults: LabelResult[] };
type NoteRow = { file: File; status: "queued" | "matching" | "matched" | "unmatched" | "skipped" | "uploading" | "saved" | "error"; jobId?: string; message?: string; progress?: string; objectKey?: string };
type BookingRecovery = { jobId?: string; orderNumber?: string; trackingNumber: string; warning: string; labelHtml?: string };
type RowRecord = Record<string, string>;

const STAFF_URL = "/api/abode";
const CUSTOMER_URL = "/api/customer-portal/abode";
const MONEY = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function downloadBookedLabel(labelHtml: string, fileName: string) {
  const escaped = labelHtml.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const blob = new Blob([`<!doctype html><title>Booked DPD label</title><iframe title="DPD label" sandbox="allow-same-origin allow-modals" style="width:100%;height:95vh;border:0" srcdoc="${escaped}"></iframe>`], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function AbodeStockings() {
  const isCustomer = window.location.pathname === "/customer/stockings";
  const baseUrl = isCustomer ? CUSTOMER_URL : STAFF_URL;
  const queryKey = [baseUrl];
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [rows, setRows] = useState<RowRecord[] | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [flaggedOrders, setFlaggedOrders] = useState<{ orderNumber: string; detailsChanged: boolean }[]>([]);
  const [filter, setFilter] = useState<"all" | "in-work" | "ready" | "dispatched" | "delivered">("all");
  const [search, setSearch] = useState("");
  const [activeOrder, setActiveOrder] = useState<StockingOrder | null>(null);
  const [dialog, setDialog] = useState<"complete" | "royal-mail" | "recover" | "dispatch" | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [existingShipmentId, setExistingShipmentId] = useState("");
  const [bookingRecovery, setBookingRecovery] = useState<BookingRecovery[]>([]);
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [noteRows, setNoteRows] = useState<NoteRow[]>([]);
  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const noteProcessingLock = useRef(false);
  const [labelResults, setLabelResults] = useState<LabelResult[]>([]);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [view, setView] = useState<"cards" | "list">("cards");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<StockingsData>({
    queryKey,
    enabled: true,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/job-line-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs"] });
  };
  const previewMutation = useMutation({
    mutationFn: async (importRows: RowRecord[]) => {
      const response = await apiRequest("POST", `${baseUrl}/imports/preview`, { rows: importRows });
      return response.json() as Promise<PreviewData>;
    },
    onSuccess: setPreview,
    onError: (err) => toast({ title: "Could not preview sheet", description: friendlyError(err), variant: "destructive" }),
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `${baseUrl}/imports`, { rows });
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (result) => {
      toast({ title: "Order sheet processed", description: `${result.created} new orders · ${result.skipped} repeats skipped` });
      setFlaggedOrders(result.flaggedOrders);
      setLabelResults(result.labelResults ?? []);
      setRows(null); setPreview(null); setSelectedFile("");
      if (fileRef.current) fileRef.current.value = "";
      setImportConfirmOpen(false);
      setBookingRecovery(current => [
        ...current,
        ...(result.labelResults ?? [])
          .filter(label => Boolean(label.warning && label.trackingNumber) || label.status === "review" && Boolean(label.trackingNumber))
          .map(label => ({
            jobId: label.jobId,
            orderNumber: label.orderNumber,
            trackingNumber: label.trackingNumber!,
            warning: label.error || "DPD booking needs recovery. Do not book again.",
            labelHtml: label.labelHtml,
          })),
      ]);
      void processImportNotes();
      refresh();
    },
    onError: (err) => toast({ title: "Import failed", description: friendlyError(err), variant: "destructive" }),
  });
  const operationMutation = useMutation({
    mutationFn: async ({ order, action, payload }: { order: StockingOrder; action: string; payload: Record<string, unknown> }) => {
      const response = await apiRequest("POST", `${STAFF_URL}/orders/${encodeURIComponent(order.id)}/${action}`, payload);
      return response.json();
    },
    onSuccess: (result) => {
      if (result.warning) {
        setBookingRecovery(current => [...current, result]);
        toast({ title: "Keep this booked shipment", description: result.warning, variant: "destructive" });
      } else {
      toast({ title: "Order updated", description: "The latest status is now reflected below." });
      }
      setDialog(null); setActiveOrder(null); setTrackingNumber("");
      refresh();
    },
    onError: (err) => {
      refresh();
      toast({ title: "Could not update order", description: friendlyError(err), variant: "destructive" });
    },
  });

  const isStaff = !isCustomer;
  const orders = data?.orders ?? [];
  const existingBookingQuery = new URLSearchParams(window.location.search);
  const existingBookingOrder = orders.find(order => order.orderNumber === existingBookingQuery.get("existingDpdOrder"));
  const linkedShipmentId = Number(existingBookingQuery.get("existingDpdShipment"));
  const linkedTracking = existingBookingQuery.get("existingDpdTracking") || "";
  const canSyncLinkedBooking = isStaff && existingBookingOrder && ["booking", "review"].includes(existingBookingOrder.shipmentState)
    && Number.isSafeInteger(linkedShipmentId) && linkedShipmentId > 0 && /^[A-Za-z0-9 -]{5,80}$/.test(linkedTracking);
  const totalStockings = orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0);
  const inWorkCount = orders.filter((order) => !order.completed).length;
  const readyCount = orders.filter((order) => order.completed && !order.dispatchedAt).length;
  const dispatchedCount = orders.filter((order) => Boolean(order.dispatchedAt)).length;
  const shownOrders = useMemo(() => orders.filter((order) => {
    const status = order.deliveredAt ? "delivered" : order.dispatchedAt ? "dispatched" : order.completed ? "ready" : "in-work";
    if (filter !== "all" && filter !== status && !(filter === "dispatched" && status === "delivered")) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || [order.jobNumber, order.poNumber, order.jobName, order.orderNumber, order.dhlTrackingNumber, order.dispatchedAt, order.deliveredAt, order.trackingStatus, ...order.items.map((item) => item.stockingDetails.name)].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
  }), [orders, filter, search]);

  async function processImportNotes() {
    if (noteProcessingLock.current || !noteFiles.length) return;
    noteProcessingLock.current = true;
    setIsProcessingNotes(true);
    const pending = [...noteFiles];
    const identity = (file: File) => JSON.stringify([file.name, file.size, file.lastModified]);
    const previous = new Map(noteRows.map(row => [identity(row.file), row]));
    const putRow = (row: NoteRow) => setNoteRows(current => {
      const key = identity(row.file);
      const index = current.findIndex(existing => identity(existing.file) === key);
      if (index < 0) return [...current, row];
      return current.map((existing, i) => i === index ? row : existing);
    });
    try {
      pending.forEach(file => {
        const old = previous.get(identity(file));
        putRow({ file, status: old?.status ?? "queued", jobId: old?.jobId, objectKey: old?.objectKey, message: old?.message, progress: "Matching order…" });
      });
      const response = await apiRequest("POST", `${baseUrl}/delivery-notes/preview`, { fileNames: pending.map(file => file.name) });
      const preview = await response.json() as { files: { fileName: string; jobId: string | null; status: string; existingCount: number }[] };
      const retained = new Set(pending.map(identity));
      for (const file of pending) {
        const old = previous.get(identity(file));
        const match = preview.files?.find(entry => entry.fileName === file.name);
        if (!match || match.status !== "matched" || !match.jobId) {
          putRow({ file, status: "unmatched", message: "No matching imported order.", progress: undefined });
          continue;
        }
        if (match.existingCount > 0) {
          putRow({ file, status: "skipped", jobId: match.jobId, message: "Order already has a delivery note.", progress: undefined });
          retained.delete(identity(file));
          continue;
        }
        let currentObjectKey = old?.objectKey;
        try {
          putRow({ file, status: old?.status ?? "queued", jobId: match.jobId, objectKey: currentObjectKey, message: old?.message, progress: "Checking PDF…" });
          const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
          if (new TextDecoder().decode(signature) !== "%PDF-") throw new Error("File content is not a valid PDF.");
          if (!currentObjectKey) {
            putRow({ file, status: old?.status ?? "queued", jobId: match.jobId, message: old?.message, progress: "Uploading PDF…" });
            currentObjectKey = await uploadAbodeDeliveryNote(file, { baseUrl, isStaff, jobId: match.jobId });
            putRow({ file, status: old?.status ?? "queued", jobId: match.jobId, objectKey: currentObjectKey, message: old?.message, progress: "Saving attachment…" });
          }
          const attachResponse = await apiRequest("POST", `${baseUrl}/delivery-notes`, { objectKey: currentObjectKey, fileName: file.name, jobId: match.jobId });
          const attachResult = await attachResponse.json() as { skipped?: boolean };
          if (attachResult.skipped) {
            putRow({ file, status: "skipped", jobId: match.jobId, objectKey: currentObjectKey, message: "Order already has a delivery note.", progress: undefined });
          } else {
            putRow({ file, status: "saved", jobId: match.jobId, objectKey: currentObjectKey, message: "Saved to order.", progress: undefined });
          }
          retained.delete(identity(file));
        } catch (error) {
          putRow({ file, status: "error", jobId: match.jobId, objectKey: currentObjectKey, message: friendlyError(error), progress: undefined });
        }
      }
      setNoteFiles(current => current.filter(file => retained.has(identity(file))));
      refresh();
    } catch (error) {
      pending.forEach(file => {
        const old = previous.get(identity(file));
        putRow({ file, status: "error", jobId: old?.jobId, objectKey: old?.objectKey, message: friendlyError(error), progress: undefined });
      });
    } finally {
      noteProcessingLock.current = false;
      setIsProcessingNotes(false);
    }
  }

  function addNoteFiles(list: FileList | File[]) {
    if (noteProcessingLock.current || isProcessingNotes || importMutation.isPending) return;
    const incoming = Array.from(list);
    const valid = incoming.filter(file => {
      if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf") || !file.size || file.size > 10 * 1024 * 1024) {
        toast({ title: "Delivery note not added", description: `${file.name}: choose a valid PDF no larger than 10 MB.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    const next = [...noteFiles];
    const seen = new Set(next.map(file => JSON.stringify([file.name, file.size, file.lastModified])));
    for (const file of valid) {
      const key = JSON.stringify([file.name, file.size, file.lastModified]);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
    }
    if (next.length > 50) {
      toast({ title: "Delivery note limit reached", description: "Select no more than 50 PDFs across this import and retry queue.", variant: "destructive" });
      return;
    }
    setNoteFiles(next);
  }

  async function downloadRegister() {
    const safe = (value: unknown) => String(value ?? "").replace(/^[\s]*[=+\-@]/, "'$&");
    const rows = orders.map(order => ({
      "Order number": safe(order.orderNumber),
      "Personalisation names": safe(order.items.map(item => item.stockingDetails.name).join(", ")),
      Quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      Production: order.completed ? "Complete" : "In production",
      Label: order.labelAvailable ? "Available" : order.shipmentState === "review" ? "Review required" : order.shipmentState === "booking" ? "Booking" : "Not booked",
      Despatch: order.dispatchedAt ? "Dispatched" : "Not dispatched",
      "Despatch date": formatDate(order.dispatchedAt),
      Delivery: safe(order.trackingError ? "Tracking check failed" : order.deliveredAt ? "Delivered" : order.trackingStatus || "Not delivered"),
      "Delivered date": formatDate(order.deliveredAt),
      "Tracking number": safe(order.dhlTrackingNumber),
      "Tracking link": order.dhlTrackingNumber ? trackingUrl(order) : "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { cellDates: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Stocking orders");
    XLSX.writeFile(workbook, "abode-stocking-orders.xlsx");
  }

  const trackingRefresh = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", `${baseUrl}/tracking/refresh`, {});
      return result.json() as Promise<{ configured: boolean; updated: number; errors: number }>;
    },
    onSuccess: result => {
      refresh();
      toast({ title: result.configured ? "Tracking refreshed" : "Tracking not connected", description: result.configured ? `${result.updated} orders updated${result.errors ? ` · ${result.errors} need attention` : ""}.` : "Confirmed delivery dates will appear once the DPD tracking connection is configured." });
    },
      onError: () => toast({ title: "Tracking refresh failed", description: "The carrier check could not be completed. Try again shortly.", variant: "destructive" }),
  });

  async function onFileChange(file?: File) {
    if (noteProcessingLock.current || isProcessingNotes) return;
    setPreview(null); setRows(null); setSelectedFile("");
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast({ title: "Choose an Excel or CSV file", description: "Supported formats: .xlsx, .xls and .csv.", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File is too large", description: "Choose a file under 5 MB.", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json<RowRecord>(sheet, { defval: "", raw: false });
      if (sheetRows.length > 5000) throw new Error("This sheet has more than 5,000 rows. Split it into smaller files.");
      if (!sheetRows.length) throw new Error("No order rows were found in the first sheet.");
      setSelectedFile(file.name);
      setRows(sheetRows);
    } catch (err) {
      toast({ title: "File could not be read", description: friendlyError(err), variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const openDocument = (order: StockingOrder, kind: "label" | "delivery-note") => {
    const path = `${baseUrl}/orders/${encodeURIComponent(order.id)}/${kind}${kind === "label" ? "?format=pdf" : ""}`;
    window.open(path, "_blank", "noopener,noreferrer");
  };
  const trackingUrl = (order: StockingOrder) => order.shippingRoute === "royal_mail"
    ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(order.dhlTrackingNumber || "")}`
    : getDpdTrackingUrl({ dhlTrackingNumber: order.dhlTrackingNumber, deliveryAddressType: "custom", deliveryAddress: order.recipient.postcode });

  if (isLoading) return <div className="h-full overflow-y-auto bg-[#f6f4ef] p-4 md:p-8"><div className="mx-auto max-w-6xl animate-pulse space-y-5"><div className="h-8 w-52 rounded bg-stone-200" /><div className="h-36 rounded-2xl bg-stone-200" /><div className="h-24 rounded-xl bg-stone-200" /><div className="h-64 rounded-xl bg-stone-200" /></div></div>;
  if (isError) return <div className="h-full overflow-y-auto bg-[#f6f4ef] p-6"><div className="mx-auto mt-12 max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-700" /><h1 className="text-xl font-semibold text-stone-900">Stockings could not load</h1><p className="mt-2 text-sm text-stone-600">{friendlyError(error)}</p><Button className="mt-5" onClick={() => refetch()}>Try again</Button></div></div>;
  if (!data?.enabled) return <div className="h-full overflow-y-auto bg-[#f6f4ef] p-8"><div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-stone-500" /><h1 className="mt-3 text-xl font-semibold">Stockings are not enabled</h1><p className="mt-2 text-sm text-muted-foreground">This workspace does not have access to Abode stocking fulfilment.</p></div></div>;

  return (
    <div className="h-full overflow-y-auto bg-[#f6f4ef] text-stone-900">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 md:px-8 md:pt-8">
        {isCustomer && <a href="/customer/dashboard" className="mb-4 inline-block text-sm underline">Back to your dashboard</a>}
        {bookingRecovery.length > 0 && <div role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 break-words">
          <strong>Shipment already booked — do not book again</strong>
          <ul className="mt-2 space-y-3">{bookingRecovery.map((recovery, index) => <li key={`${recovery.jobId ?? recovery.orderNumber ?? "shipment"}-${recovery.trackingNumber}-${index}`} className="border-t border-red-200 pt-2">
            <p>{recovery.orderNumber ? `${recovery.orderNumber} · ` : ""}{recovery.warning}</p>
            <p className="mt-1 font-mono font-bold">Tracking: {recovery.trackingNumber}</p>
            {recovery.labelHtml && <Button className="mt-2" variant="outline" onClick={() => downloadBookedLabel(recovery.labelHtml!, `booked-label-${recovery.orderNumber ?? recovery.jobId ?? index}.html`)}>Save booked label</Button>}
          </li>)}</ul>
        </div>}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a4e3d]">Abode · seasonal fulfilment</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{isStaff ? "Stocking room" : "Your stockings"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{isStaff ? "One name at a time. Keep personalisation, packing and dispatch in step." : "Follow every personalised stocking from your sheet to its delivery."}</p>
          </div>
          <div className="flex items-center gap-3">
            {data.customer.logoUrl && <img src={data.customer.logoUrl} alt={`${data.customer.name} logo`} className="max-h-12 max-w-36 object-contain" />}
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh orders"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </header>
        {canSyncLinkedBooking && <div className="mb-5 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <p>Existing DPD booking for order <strong>{existingBookingOrder.orderNumber}</strong> · tracking <strong>{linkedTracking}</strong></p>
          <Button className="mt-3" disabled={operationMutation.isPending} onClick={() => operationMutation.mutate({
            order: existingBookingOrder, action: "recover", payload: { shipmentId: linkedShipmentId, trackingNumber: linkedTracking },
          })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save existing label and update order list</Button>
        </div>}
        {!data.trackingConfigured && <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">DPD tracking is not connected</p>
          <p className="mt-1">Confirmed delivery dates will appear after the tracking connection is configured. Labels and despatch dates remain separate.</p>
        </div>}
        {orders.some(order => order.trackingError) && <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Some tracking checks need attention</p>
          <p className="mt-1">The carrier has not confirmed delivery for every parcel. No estimated delivery date is shown as confirmed.</p>
        </div>}

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="Open orders" value={String(orders.length)} note={`${totalStockings} stockings`} />
          <Metric label="Outstanding" value={String(inWorkCount)} note="Production outstanding" />
          <Metric label="Labels ready" value={String(orders.filter(order => order.labelAvailable).length)} note="Can print before production is complete" />
          <Metric label="Awaiting delivery note" value={String(orders.filter(order => !order.dispatchedAt && !order.deliveryNotes?.length).length)} note="Undispatched orders missing a PDF" />
          <Metric label="Ready to dispatch" value={String(readyCount)} note="Production complete" />
          <Metric label="Dispatched" value={String(dispatchedCount)} note="Actual despatch recorded" />
          <Metric label="Delivered" value={String(orders.filter(order => Boolean(order.deliveredAt)).length)} note="Confirmed by tracking" />
        </section>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_310px]">
          <Card className="overflow-hidden border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-[#f3e7df] p-3 text-[#8a4e3d]"><FileSpreadsheet className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-semibold">Import order sheet</h2>
                    <p className="mt-1 text-sm text-stone-600">Preview the sheet and attach delivery notes in one import. Repeat orders are never booked again.</p>
                  </div>
                </div>
              </div>
              <label
                className={`mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition focus-within:ring-2 focus-within:ring-[#344e43] focus-within:ring-offset-2 ${isDraggingFile ? "border-[#344e43] bg-emerald-50" : "border-stone-300 bg-stone-50 hover:border-[#344e43] hover:bg-stone-100"}`}
                onDragEnter={(event) => {
                  event.preventDefault(); event.stopPropagation();
                  if (!event.dataTransfer.types.includes("Files")) return;
                  dragDepth.current += 1; setIsDraggingFile(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault(); event.stopPropagation();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDragLeave={(event) => {
                  event.preventDefault(); event.stopPropagation();
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (!dragDepth.current) setIsDraggingFile(false);
                }}
                onDrop={(event) => {
                  event.preventDefault(); event.stopPropagation();
                  dragDepth.current = 0; setIsDraggingFile(false);
                  if (noteProcessingLock.current || isProcessingNotes) return;
                  if (event.dataTransfer.files.length !== 1) {
                    toast({ title: "Drop one file at a time", description: "Choose one Excel or CSV order sheet.", variant: "destructive" });
                    return;
                  }
                  if (fileRef.current) fileRef.current.value = "";
                  void onFileChange(event.dataTransfer.files[0]);
                }}
              >
                <Upload aria-hidden="true" className="h-6 w-6 text-[#344e43]" />
                <span className="text-sm font-semibold">{isDraggingFile ? "Drop your order sheet here" : "Drag and drop your order sheet here"}</span>
                <span className="text-sm text-stone-600">or <span className="font-medium underline underline-offset-2">choose a file</span></span>
                <input ref={fileRef} aria-label="Choose an Excel or CSV order sheet" className="sr-only" type="file" accept=".xlsx,.xls,.csv" disabled={isProcessingNotes || importMutation.isPending} onChange={(event) => onFileChange(event.target.files?.[0])} />
              </label>
              <p className="mt-4 text-xs text-stone-500">Excel or CSV · first worksheet · maximum 5,000 rows / 5 MB</p>
              {selectedFile && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-3 text-sm"><span className="min-w-0 truncate font-medium">{selectedFile} <span className="font-normal text-stone-500">({rows?.length ?? 0} rows)</span></span><Button size="sm" onClick={() => !noteProcessingLock.current && rows && previewMutation.mutate(rows)} disabled={isProcessingNotes || importMutation.isPending || previewMutation.isPending || !rows}>{previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Preview sheet</Button></div>}
              <div className="mt-5 border-t border-stone-100 pt-4">
                <h3 className="text-sm font-semibold">Delivery note PDFs</h3>
                <p className="mt-1 text-xs leading-5 text-stone-600">Select PDFs now; after the order import, matching notes are attached automatically. Add multiple files before confirming.</p>
                <input className="sr-only" id="import-note-files" type="file" accept="application/pdf,.pdf" multiple disabled={isProcessingNotes || importMutation.isPending} onChange={event => { if (event.target.files) addNoteFiles(event.target.files); event.currentTarget.value = ""; }} />
                <label htmlFor="import-note-files" aria-disabled={isProcessingNotes || importMutation.isPending} className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium ${isProcessingNotes || importMutation.isPending ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-stone-50"}`}><Upload className="h-4 w-4" />Choose PDFs</label>
                {noteFiles.length > 0 && <ul className="mt-3 space-y-1 text-xs text-stone-700">{noteFiles.map((file, index) => <li className="flex items-start justify-between gap-2" key={`${file.name}-${index}`}><span className="break-all">{file.name} <span className="text-stone-500">({Math.ceil(file.size / 1024)} KB)</span></span><Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" disabled={isProcessingNotes || importMutation.isPending} onClick={() => { setNoteFiles(current => current.filter(item => item !== file)); setNoteRows(current => current.filter(row => row.file !== file)); }}>Remove</Button></li>)}</ul>}
                {noteRows.length > 0 && <div className="mt-3 space-y-1" aria-live="polite">{noteRows.map((row, index) => <p key={`${row.file.name}-${index}`} className={`break-words text-xs ${row.status === "error" || row.status === "unmatched" ? "text-rose-800" : "text-stone-600"}`}><span className="font-medium">{row.file.name}:</span> {row.progress ? `${row.progress} ` : ""}{row.message ?? row.status}</p>)}</div>}
                <p className="mt-2 text-xs text-stone-500">Retry matching and note uploads here without importing orders or purchasing labels.</p>
                {noteFiles.length > 0 && <Button size="sm" variant="outline" className="mt-3" disabled={isProcessingNotes || importMutation.isPending} onClick={() => void processImportNotes()}>{isProcessingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isProcessingNotes ? "Matching & saving…" : "Retry matching & notes"}</Button>}
              </div>
              {preview && <div className="mt-4 rounded-xl border border-[#d6c3ae] bg-[#fbf8f3] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold">{preview.orderCount} orders · {preview.stockingCount} stockings</p><p className="mt-1 text-xs text-stone-600">Repeat order numbers will not be imported or booked again. Existing jobs stay unchanged.</p></div>
                   <div className="flex gap-2"><Button variant="outline" size="sm" disabled={isProcessingNotes || importMutation.isPending} onClick={() => setPreview(null)}>Cancel</Button><Button size="sm" onClick={() => !noteProcessingLock.current && setImportConfirmOpen(true)} disabled={isProcessingNotes || importMutation.isPending}>Review confirmation</Button></div>
                </div>
                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                  {preview.orders.map((order, index) => <div key={`${order.orderNumber}-${index}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${order.existing ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}><span className="font-semibold">{order.orderNumber}</span><span className="text-stone-600">{order.items.length} personalisation lines · {order.shippingRoute.replace("_", " ")}</span><span className="max-w-full truncate text-stone-500">{order.recipient.name} · {order.recipient.postcode}</span>{order.existing && <span className="font-semibold text-amber-900">Already uploaded — check existing order{order.detailsChanged ? " · Details differ" : ""}</span>}</div>)}
                </div>
              </div>}
              {labelResults.length > 0 && <div role="status" className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h3 className="font-semibold">New-order label results</h3>
                <p className="mt-1 text-xs text-stone-600">Only newly created DPD orders were booked during import. Printing a label does not create another booking.</p>
                 <ul className="mt-3 space-y-2">{labelResults.map((result, index) => <li key={`${result.jobId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm">
                    <span><strong>{result.orderNumber}</strong> · {result.status === "booked" ? "Booked" : result.status === "royal_mail" ? "Royal Mail — book externally" : result.status === "review" ? "Needs booking review — check DPD before retrying" : "Booking failed — check DPD before retrying"}</span>
                   {result.status === "booked" && !result.warning && <Button size="sm" variant="outline" onClick={() => window.open(`${baseUrl}/orders/${encodeURIComponent(result.jobId)}/label?format=pdf`, "_blank", "noopener,noreferrer")}><Printer className="mr-1.5 h-4 w-4" />Label PDF</Button>}
                   {(Boolean(result.warning && result.trackingNumber) || result.status === "review" && Boolean(result.trackingNumber)) && <div className="w-full border-t border-amber-200 pt-2 text-xs text-amber-950"><p>Recovery tracking: <span className="font-mono font-semibold">{result.trackingNumber}</span> · Do not book again.</p>{result.labelHtml && <Button className="mt-2" size="sm" variant="outline" onClick={() => downloadBookedLabel(result.labelHtml!, `booked-label-${result.orderNumber || result.jobId}.html`)}>Save recovered label</Button>}</div>}
                </li>)}</ul>
              </div>}
              {flaggedOrders.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">{flaggedOrders.length} repeat order{flaggedOrders.length === 1 ? "" : "s"} — check existing jobs</p>
                <p className="mt-1">These order numbers were not imported again. No existing details were changed.</p>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {flaggedOrders.map(order => <li key={order.orderNumber} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{order.orderNumber}</span>
                    {order.detailsChanged && <span>Details differ from the existing order.</span>}
                    <button type="button" className="font-medium underline underline-offset-2" onClick={() => { setFilter("all"); setSearch(order.orderNumber); }}>Find existing order</button>
                  </li>)}
                </ul>
              </div>}
            </CardContent>
          </Card>
          <Card className="border-stone-200 bg-[#eee8de] shadow-none">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a4e3d]">Pricing guide</p>
              <p className="mt-3 text-2xl font-semibold">{MONEY(data.currentRate)} <span className="text-sm font-normal text-stone-600">current rate</span></p>
              <p className="mt-2 text-sm leading-5 text-stone-700">Estimated until production is complete. First 100 stockings £7 each, then £5 each.</p>
              <div className="mt-4 border-t border-stone-300 pt-3 text-xs leading-5 text-stone-600">Standard carriage {MONEY(5.5)} per order, excl. VAT. Final charges confirmed on completion.</div>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Order register</p><h2 className="mt-1 text-xl font-semibold">Stockings in motion</h2></div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button variant="outline" size="sm" onClick={() => trackingRefresh.mutate()} disabled={trackingRefresh.isPending}>{trackingRefresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh tracking</Button>
              <Button variant="outline" size="sm" onClick={() => void downloadRegister()}><ArrowDownToLine className="mr-2 h-4 w-4" />Download XLSX</Button>
              <Button variant="outline" size="sm" onClick={() => setView(view === "cards" ? "list" : "cards")}>{view === "cards" ? "Spreadsheet list" : "Order cards"}</Button>
              <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or name" className="bg-white pl-9" /></div>
            </div>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {(["all", "in-work", "ready", "dispatched", "delivered"] as const).map((key) => <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${filter === key ? "bg-[#344e43] text-white" : "border border-stone-300 bg-white text-stone-600 hover:bg-stone-100"}`}>{key === "all" ? "All orders" : key === "in-work" ? "In work" : key === "ready" ? "Ready for dispatch" : key === "delivered" ? "Delivered" : "Dispatched"}</button>)}
          </div>
          {view === "list" && <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-[#eee8de] text-[11px] uppercase tracking-wide text-stone-600"><tr>{["Order", "Personalisation / qty", "Production", "Label", "Despatch", "Despatch date", "Delivery", "Delivered date", "Tracking"].map(title => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead>
              <tbody>{shownOrders.map(order => <tr key={order.id} className="border-t border-stone-100 align-top">
                <td className="px-3 py-3 font-semibold">{order.orderNumber || `#${order.jobNumber}`}</td>
                <td className="max-w-64 px-3 py-3"><span className="block whitespace-pre-wrap">{order.items.map(item => `${item.stockingDetails.name || "Unnamed"} × ${item.quantity}`).join(", ") || "—"}</span></td>
                <td className="px-3 py-3">{order.completed ? "Complete" : "In production"}</td>
                <td className="px-3 py-3">{order.labelAvailable ? "Available" : order.shipmentState === "review" ? "Review" : order.shipmentState === "booking" ? "Booking" : "Not booked"}</td>
                <td className="px-3 py-3">{order.dispatchedAt ? "Dispatched" : "Not dispatched"}</td>
                <td className="px-3 py-3">{formatDate(order.dispatchedAt)}</td>
                <td className="px-3 py-3">{order.trackingError ? "Tracking check failed" : order.deliveredAt ? "Delivered" : order.trackingStatus || "Not confirmed"}</td>
                <td className="px-3 py-3">{formatDate(order.deliveredAt)}</td>
                <td className="px-3 py-3">{order.dhlTrackingNumber ? <a className="inline-flex items-center gap-1 break-all text-[#344e43] underline" href={trackingUrl(order)} target="_blank" rel="noreferrer">{order.dhlTrackingNumber}<ExternalLink className="h-3 w-3 shrink-0" /></a> : "—"}</td>
              </tr>)}</tbody>
            </table>
            {!shownOrders.length && <p className="p-6 text-center text-sm text-stone-500">{orders.length ? "No orders match this view." : "No orders to display yet."}</p>}
          </div>}
          {view === "cards" && (shownOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center"><PackageCheck className="mx-auto h-8 w-8 text-stone-400" /><h3 className="mt-3 font-semibold">{orders.length ? "No orders match this view" : "Your order register is clear"}</h3><p className="mt-1 text-sm text-stone-500">{orders.length ? "Try another filter or search term." : "Import an order sheet above to start tracking fulfilment."}</p></div> : <div className="space-y-3">
            {shownOrders.map((order) => {
              const state = order.deliveredAt ? "delivered" : order.dispatchedAt ? "dispatched" : order.completed ? "ready" : "in-work";
              const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
              const estimated = order.items.reduce((sum, item) => sum + item.quantity * (item.agreedUnitPrice ?? data.currentRate), 0);
              return <Card key={order.id} className="overflow-hidden border-stone-200 bg-white shadow-sm">
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-4 md:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{order.jobName || `Order ${order.jobNumber}`}</h3><StatusPill status={state} /><span className="text-xs text-stone-500">#{order.jobNumber}{order.poNumber ? ` · PO ${order.poNumber}` : ""}</span></div>
                      <p className="mt-1 text-sm text-stone-600">{count} personalised stocking{count === 1 ? "" : "s"} <span className="px-1 text-stone-300">/</span> estimated {MONEY(estimated)} + {MONEY(5.5)} carriage excl. VAT</p>
                    </div>
                    {isStaff && <div className="flex flex-wrap gap-2">
                      {!order.completed && <Button size="sm" onClick={() => { setActiveOrder(order); setDialog("complete"); }}><Check className="mr-1.5 h-4 w-4" />Complete work</Button>}
                      {!order.labelAvailable && !order.dhlTrackingNumber && order.shippingRoute === "dpd" && order.shipmentState === "unbooked" && <Button size="sm" disabled={operationMutation.isPending} onClick={() => operationMutation.mutate({ order, action: "book", payload: {} })}>{operationMutation.isPending && operationMutation.variables?.order.id === order.id && operationMutation.variables.action === "book" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Booking…</> : <><Truck className="mr-1.5 h-4 w-4" />Book DPD label</>}</Button>}
                      {order.completed && !order.dhlTrackingNumber && order.shippingRoute === "royal_mail" && <Button variant="outline" size="sm" onClick={() => { setActiveOrder(order); setDialog("royal-mail"); }}><Send className="mr-1.5 h-4 w-4" />Add tracking</Button>}
                      {(order.shipmentState === "review" || order.shipmentState === "booking") && <Button variant="outline" size="sm" onClick={() => { setActiveOrder(order); setTrackingNumber(""); setExistingShipmentId(""); setDialog("recover"); }}><Printer className="mr-1.5 h-4 w-4" />Get existing label</Button>}
                      {order.labelAvailable && !(order.shipmentState === "review" && !order.dhlTrackingNumber) && <Button variant="outline" size="sm" onClick={() => openDocument(order, "label")}><ArrowDownToLine className="mr-1.5 h-4 w-4" />Label PDF</Button>}
                      <Button size="sm" disabled={!order.completed || !order.deliveryNotes?.length || !order.dhlTrackingNumber || Boolean(order.dispatchedAt)} title={!order.completed ? "Complete production first" : !order.deliveryNotes?.length ? "Save the delivery note first" : !order.dhlTrackingNumber ? "Add tracking before despatch" : undefined} onClick={() => { setActiveOrder(order); setDialog("dispatch"); }}>Mark dispatched</Button>
                      </div>}
                      {!isStaff && Boolean(order.deliveryNotes?.length) && <Button variant="outline" size="sm" onClick={() => openDocument(order, "delivery-note")}><ArrowDownToLine className="mr-1.5 h-4 w-4" />Delivery note PDF</Button>}
                  </div>
                  <div className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_240px] md:px-5">
                    <div className="space-y-2">
                      {order.items.map((item) => <div key={item.id}>
                        <div className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-[#f8f6f2] p-3 sm:grid-cols-[minmax(120px,1fr)_repeat(3,minmax(90px,0.8fr))_auto]">
                        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Name on stocking</p><p className="mt-1 whitespace-pre-wrap break-words text-lg font-semibold leading-tight">{item.stockingDetails.name || "Name not provided"}</p><p className="mt-1 text-xs text-stone-500">{item.quantity} piece{item.quantity === 1 ? "" : "s"}</p></div>
                        <Spec label="Colour" value={item.stockingDetails.colour} />
                        <Spec label="Font" value={stockingFontLabel(item.stockingDetails.font)} />
                        <Spec label="Thread" value={item.stockingDetails.thread} />
                        <div className="col-span-2 self-start text-right sm:col-span-1"><span className={`inline-flex items-center gap-1 text-xs font-medium ${item.completed ? "text-emerald-800" : "text-stone-500"}`}>{item.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{item.completed ? "Done" : "In work"}</span></div>
                        </div>
                        <AbodeFinishedPhotos
                          jobId={order.id}
                          photos={order.finishedPhotos}
                          isStaff={isStaff}
                          lineItemId={item.id}
                          canUpload={isStaff && item.completed}
                          onChanged={refresh}
                        />
                      </div>)}
                    </div>
                    <div className="rounded-lg border border-stone-200 p-3">
                       {isStaff ? <><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Recipient</p><p className="mt-1 font-medium">{order.recipient.name}</p><p className="mt-1 text-sm leading-5 text-stone-600">{[order.recipient.line1, order.recipient.line2, order.recipient.town, order.recipient.county, order.recipient.postcode].filter(Boolean).join(", ")}</p></> : <><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Delivery</p>{order.dhlTrackingNumber ? <><a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#344e43] underline underline-offset-2" href={trackingUrl(order)} target="_blank" rel="noreferrer">Track parcel <ExternalLink className="h-3.5 w-3.5" /></a><p className="mt-1 break-all font-mono text-xs text-stone-600">{order.dhlTrackingNumber}</p><p className="mt-1 text-xs text-stone-600">Status: {order.trackingError ? "Tracking check failed" : order.deliveredAt ? "Delivered" : order.trackingStatus || "Awaiting carrier confirmation"}</p><p className="text-xs text-stone-600">Despatched {formatDate(order.dispatchedAt)} · Delivered {formatDate(order.deliveredAt)}</p>{order.trackingError && <p className="mt-1 text-xs text-amber-900">Latest tracking check did not complete. Refresh tracking to try again.</p>}</> : <p className="mt-2 text-sm text-stone-600">{order.dispatchedAt ? `Dispatched ${formatDate(order.dispatchedAt)}` : order.completed ? "Ready for dispatch" : "In production"}</p>}</>}
                       {isStaff && order.dhlTrackingNumber && <div className="mt-3 border-t border-stone-100 pt-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Parcel tracking</p><a href={trackingUrl(order)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-[#344e43] underline underline-offset-2">{order.dhlTrackingNumber}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a><p className="mt-1 text-xs text-stone-600">Despatch: {formatDate(order.dispatchedAt)} · Delivered: {formatDate(order.deliveredAt)}</p><p className="mt-1 text-xs text-stone-600">Tracking status: {order.deliveredAt ? "Delivered" : order.trackingStatus || "Awaiting carrier confirmation"}</p>{order.trackingError && <p className="mt-1 text-xs text-amber-900">Latest tracking check did not complete. Refresh to try again.</p>}</div>}
                      {isStaff && order.shippingRoute === "royal_mail" && !order.dhlTrackingNumber && <div className="mt-3 border-t border-stone-100 pt-3"><p className="text-xs text-stone-600">Royal Mail route: book externally, then save its tracking number here.</p><a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#344e43] underline" href="https://www.parcel2go.com/" target="_blank" rel="noreferrer">Open Parcel2Go <ExternalLink className="h-3 w-3" /></a></div>}
                      {isStaff && order.shipmentState === "booking" && <p className="mt-3 text-xs text-stone-600">Waiting for the booked label and tracking to be saved.</p>}
                      {isStaff && order.shipmentState === "review" && <div className="mt-3 rounded-md bg-rose-50 p-2 text-xs leading-5 text-rose-900">Booking needs review. Check the DPD portal before recording recovered tracking.</div>}
                      {isStaff && order.shippingCost != null && <p className="mt-3 border-t border-stone-100 pt-2 text-xs text-stone-500">Carriage recorded: {MONEY(Number(order.shippingCost))} ex. VAT</p>}
                    </div>
                  </div>
                  <AbodeFinishedPhotos
                    jobId={order.id}
                    photos={order.finishedPhotos}
                    isStaff={isStaff}
                    lineItemId={null}
                    canUpload={false}
                    onChanged={refresh}
                  />
                  <AbodeOrderDeliveryNotes notes={order.deliveryNotes} baseUrl={baseUrl} jobId={order.id} orderNumber={order.orderNumber} isStaff={isStaff} onChanged={refresh} />
                  {isStaff && Boolean(order.deliveryNotes?.length) && <div className="flex flex-wrap gap-2 border-t border-stone-100 px-4 py-3 md:px-5"><Button variant="ghost" size="sm" onClick={() => openDocument(order, "delivery-note")}><ArrowDownToLine className="mr-1.5 h-4 w-4" />Customer delivery note PDF</Button><span className="self-center text-xs text-stone-500">Uses the customer-supplied PDF</span></div>}
                </CardContent>
              </Card>;
            })}
          </div>)}
        </section>
      </div>

      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent><DialogHeader><DialogTitle>Confirm order import</DialogTitle><DialogDescription>This will add only new order numbers. Each new DPD-eligible order creates a real shipment booking using the agreed 4 kg Expresspak 5 Next Day default. Existing orders are not booked again. Printing a label does not create a second booking; despatch is recorded separately, and import does not send despatch emails.</DialogDescription></DialogHeader>
          {noteFiles.length > 0 && <p className="rounded-lg bg-[#f8f6f2] p-3 text-sm">{noteFiles.length} delivery-note PDF{noteFiles.length === 1 ? "" : "s"} will be matched and uploaded after import. Note upload failures can be retried without importing again.</p>}
          <DialogFooter><Button variant="outline" disabled={isProcessingNotes || importMutation.isPending} onClick={() => setImportConfirmOpen(false)}>Go back</Button><Button disabled={isProcessingNotes || importMutation.isPending} onClick={() => { if (!noteProcessingLock.current) importMutation.mutate(); }}>{importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm import and booking</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "complete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle>Confirm production is complete</DialogTitle><DialogDescription>This will mark every remaining stocking on <strong>{activeOrder?.jobName}</strong> as complete. Confirm the pieces have been checked and finished before proceeding.</DialogDescription></DialogHeader><div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mr-2 inline h-4 w-4" />This is a production confirmation, not a dispatch action.</div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Go back</Button><Button disabled={operationMutation.isPending} onClick={() => activeOrder && operationMutation.mutate({ order: activeOrder, action: "complete", payload: {} })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm completion</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={dialog === "dispatch"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle>Confirm actual despatch</DialogTitle><DialogDescription>This records that <strong>{activeOrder?.orderNumber || activeOrder?.jobName}</strong> has physically left fulfilment. Confirm production is complete, the delivery note is saved and tracking is present.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-950">A label alone is not despatch. Only continue after handing the parcel to the carrier.</div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={!activeOrder || !activeOrder.completed || !activeOrder.deliveryNotes?.length || !activeOrder.dhlTrackingNumber || operationMutation.isPending} onClick={() => activeOrder && operationMutation.mutate({ order: activeOrder, action: "dispatch", payload: {} })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm despatch</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "royal-mail" || dialog === "recover"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "recover" ? "Get existing DPD label" : "Save Royal Mail tracking"}</DialogTitle>
            <DialogDescription>{dialog === "recover" ? "Retrieve the label from the existing DPD shipment and save its tracking to this order." : "Book the parcel externally, then record the tracking number here."}</DialogDescription>
          </DialogHeader>
          {dialog === "recover" && <label className="space-y-2 text-sm font-medium">DPD shipment ID<Input value={existingShipmentId} onChange={event => setExistingShipmentId(event.target.value)} inputMode="numeric" autoComplete="off" /></label>}
          <label className="space-y-2 text-sm font-medium">Tracking number<Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} autoComplete="off" /></label>
          {dialog === "royal-mail" && <a className="inline-flex items-center gap-1 text-sm font-medium text-[#344e43] underline" href="https://www.parcel2go.com/" target="_blank" rel="noreferrer">Open Parcel2Go <ExternalLink className="h-3.5 w-3.5" /></a>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={!trackingNumber.trim() || operationMutation.isPending || (dialog === "recover" && (!Number.isSafeInteger(Number(existingShipmentId)) || Number(existingShipmentId) <= 0))}
              onClick={() => activeOrder && operationMutation.mutate({ order: activeOrder, action: dialog === "recover" ? "recover" : "royal-mail", payload: {
                trackingNumber: trackingNumber.trim(), ...(dialog === "recover" ? { shipmentId: Number(existingShipmentId) } : {}),
              } })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dialog === "recover" ? "Save label and tracking" : "Save tracking"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-stone-500">{note}</p></div>;
}
function ukDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
}
function formatDate(value: string | null) {
  return value ? ukDate(value) || "—" : "—";
}
function Spec({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p><p className="mt-1 break-words text-sm font-medium leading-5 text-stone-800">{value || "—"}</p></div>;
}
function StatusPill({ status }: { status: "in-work" | "ready" | "dispatched" | "delivered" }) {
  const config = status === "delivered" ? ["bg-emerald-100 text-emerald-900", "Delivered"] : status === "dispatched" ? ["bg-[#e5eee8] text-[#344e43]", "Dispatched"] : status === "ready" ? ["bg-[#f5e8d6] text-[#71482e]", "Ready for dispatch"] : ["bg-stone-100 text-stone-700", "In work"];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config[0]}`}>{config[1]}</span>;
}

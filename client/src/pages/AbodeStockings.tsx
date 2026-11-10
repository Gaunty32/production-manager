import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AlertCircle, ArrowDownToLine, Check, CheckCircle2, Clock3, ExternalLink, FileSpreadsheet, Loader2, PackageCheck, RefreshCw, Search, Send, ShieldAlert, Truck, Upload } from "lucide-react";
import { getDpdTrackingUrl } from "@shared/dpd-tracking";
import { stockingFontLabel } from "@shared/abode";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AbodeFinishedPhotos, type AbodeFinishedPhoto } from "@/components/AbodeFinishedPhotos";
import { AbodeStockingSample, type AbodeDigitalSample } from "@/components/AbodeStockingSample";
import { AbodeDeliveryNotes, AbodeOrderDeliveryNotes, type AbodeDeliveryNote } from "@/components/AbodeDeliveryNotes";

type StockingItem = {
  id: string;
  quantity: number;
  completed: boolean;
  description: string;
  stockingDetails: { colour: string; font: string; thread: string; name: string };
  agreedUnitPrice: number | null;
  digitalSamples?: AbodeDigitalSample[];
};
type StockingOrder = {
  id: string;
  jobNumber: number;
  poNumber: string;
  orderNumber: string;
  jobName: string;
  completed: boolean;
  invoiceStatus: string;
  sampleApprovalReady: boolean;
  dhlTrackingNumber: string | null;
  shippingCost: string | null;
  dispatchEmailQueuedAt: string | null;
  recipient: { name: string; line1: string; line2: string; town: string; county: string; postcode: string };
  shippingRoute: "dpd" | "royal_mail";
  shipmentState: "unbooked" | "booking" | "booked" | "review";
  labelAvailable: boolean;
  items: StockingItem[];
  finishedPhotos?: AbodeFinishedPhoto[];
  deliveryNotes?: AbodeDeliveryNote[];
};
type StockingsData = {
  enabled: boolean;
  customer: { id: string; name: string; logoUrl: string | null };
  completedCount: number;
  currentRate: number;
  canApproveSamples: boolean;
  orders: StockingOrder[];
};
type PreviewData = {
  orders: { orderNumber: string; recipient: StockingOrder["recipient"]; shippingRoute: string; items: { colour: string; font: string; thread: string; name: string }[]; existing: boolean; detailsChanged: boolean }[];
  stockingCount: number;
  orderCount: number;
};
type RowRecord = Record<string, string>;

const STAFF_URL = "/api/abode";
const CUSTOMER_URL = "/api/customer-portal/abode";
const MONEY = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
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
  const [filter, setFilter] = useState<"all" | "in-work" | "ready" | "dispatched">("all");
  const [search, setSearch] = useState("");
  const [activeOrder, setActiveOrder] = useState<StockingOrder | null>(null);
  const [dialog, setDialog] = useState<"complete" | "book" | "royal-mail" | "recover" | null>(null);
  const [weight, setWeight] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [bookingRecovery, setBookingRecovery] = useState<{ trackingNumber: string; warning: string; labelHtml?: string } | null>(null);

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
      return response.json() as Promise<{ created: number; skipped: number; flaggedOrders: { orderNumber: string; detailsChanged: boolean }[] }>;
    },
    onSuccess: (result) => {
      toast({ title: "Order sheet processed", description: `${result.created} created · ${result.skipped} repeat orders flagged for checking` });
      setFlaggedOrders(result.flaggedOrders);
      setRows(null); setPreview(null); setSelectedFile("");
      if (fileRef.current) fileRef.current.value = "";
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
        setBookingRecovery(result);
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
  const totalStockings = orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0);
  const inWorkCount = orders.filter((order) => !order.completed).length;
  const readyCount = orders.filter((order) => order.completed && !order.dhlTrackingNumber).length;
  const dispatchedCount = orders.filter((order) => Boolean(order.dhlTrackingNumber)).length;
  const awaitingApprovalCount = orders.filter(order => !order.completed && !order.dhlTrackingNumber && !order.sampleApprovalReady).length;
  const awaitingDeliveryNoteCount = orders.filter(order => !order.dhlTrackingNumber && !order.deliveryNotes?.length).length;
  const shownOrders = useMemo(() => orders.filter((order) => {
    const status = order.dhlTrackingNumber ? "dispatched" : order.completed ? "ready" : "in-work";
    if (filter !== "all" && filter !== status) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || [order.jobNumber, order.poNumber, order.jobName, ...order.items.map((item) => item.stockingDetails.name)].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
  }), [orders, filter, search]);

  async function onFileChange(file?: File) {
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
    const path = `${baseUrl}/orders/${encodeURIComponent(order.id)}/${kind}`;
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
        {bookingRecovery && <div role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 break-words">
          <strong>Shipment already booked — do not book again</strong>
          <p className="mt-2">{bookingRecovery.warning}</p>
          <p className="mt-2 font-mono font-bold">Tracking: {bookingRecovery.trackingNumber}</p>
          {bookingRecovery.labelHtml && <Button className="mt-3" variant="outline" onClick={() => {
            const escaped = bookingRecovery.labelHtml!.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
            const blob = new Blob([`<!doctype html><title>Booked DPD label</title><iframe title="DPD label" sandbox="allow-same-origin allow-modals" style="width:100%;height:95vh;border:0" srcdoc="${escaped}"></iframe>`], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a"); anchor.href = url; anchor.download = "booked-dpd-label.html"; anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
          }}>Save booked label</Button>}
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

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="Open orders" value={String(orders.length)} note={`${totalStockings} stockings`} />
          <Metric label="Outstanding" value={String(inWorkCount)} note="Production outstanding" />
          <Metric label="Awaiting approval" value={String(awaitingApprovalCount)} note="Orders needing sample approval" />
          <Metric label="Awaiting delivery note" value={String(awaitingDeliveryNoteCount)} note="Undispatched orders missing a PDF" />
          <Metric label="Ready to dispatch" value={String(readyCount)} note="Production complete" />
          <Metric label="Dispatched" value={String(dispatchedCount)} note={`${data.completedCount} stockings completed`} />
        </section>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_310px]">
          <Card className="overflow-hidden border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-[#f3e7df] p-3 text-[#8a4e3d]"><FileSpreadsheet className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-semibold">Import order sheet</h2>
                    <p className="mt-1 text-sm text-stone-600">Preview everything before any orders are added. No minimum order.</p>
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
                <input ref={fileRef} aria-label="Choose an Excel or CSV order sheet" className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onFileChange(event.target.files?.[0])} />
              </label>
              <p className="mt-4 text-xs text-stone-500">Excel or CSV · first worksheet · maximum 5,000 rows / 5 MB</p>
              {selectedFile && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-3 text-sm"><span className="min-w-0 truncate font-medium">{selectedFile} <span className="font-normal text-stone-500">({rows?.length ?? 0} rows)</span></span><Button size="sm" onClick={() => rows && previewMutation.mutate(rows)} disabled={previewMutation.isPending || !rows}>{previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Preview sheet</Button></div>}
              {preview && <div className="mt-4 rounded-xl border border-[#d6c3ae] bg-[#fbf8f3] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold">{preview.orderCount} orders · {preview.stockingCount} stockings</p><p className="mt-1 text-xs text-stone-600">Repeat order numbers are flagged for checking and will not be imported again. Existing jobs stay unchanged.</p></div>
                  <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPreview(null)}>Cancel</Button><Button size="sm" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>{importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm import</Button></div>
                </div>
                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                  {preview.orders.map((order, index) => <div key={`${order.orderNumber}-${index}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${order.existing ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}><span className="font-semibold">{order.orderNumber}</span><span className="text-stone-600">{order.items.length} personalisation lines · {order.shippingRoute.replace("_", " ")}</span><span className="max-w-full truncate text-stone-500">{order.recipient.name} · {order.recipient.postcode}</span>{order.existing && <span className="font-semibold text-amber-900">Already uploaded — check existing order{order.detailsChanged ? " · Details differ" : ""}</span>}</div>)}
                </div>
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

        <AbodeDeliveryNotes baseUrl={baseUrl} isStaff={isStaff} onChanged={refresh} />

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Order register</p><h2 className="mt-1 text-xl font-semibold">Stockings in motion</h2></div>
            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or name" className="bg-white pl-9" /></div>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {(["all", "in-work", "ready", "dispatched"] as const).map((key) => <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${filter === key ? "bg-[#344e43] text-white" : "border border-stone-300 bg-white text-stone-600 hover:bg-stone-100"}`}>{key === "all" ? "All orders" : key === "in-work" ? "In work" : key === "ready" ? "Ready for dispatch" : "Dispatched"}</button>)}
          </div>
          {shownOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center"><PackageCheck className="mx-auto h-8 w-8 text-stone-400" /><h3 className="mt-3 font-semibold">{orders.length ? "No orders match this view" : "Your order register is clear"}</h3><p className="mt-1 text-sm text-stone-500">{orders.length ? "Try another filter or search term." : "Import an order sheet above to start tracking fulfilment."}</p></div> : <div className="space-y-3">
            {shownOrders.map((order) => {
              const state = order.dhlTrackingNumber ? "dispatched" : order.completed ? "ready" : !order.sampleApprovalReady ? "approval" : "in-work";
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
                      {!order.completed && <Button size="sm" disabled={!order.sampleApprovalReady} title={!order.sampleApprovalReady ? "Every stocking awaiting approval needs its latest digital sample approved first." : undefined} onClick={() => { setActiveOrder(order); setDialog("complete"); }}><Check className="mr-1.5 h-4 w-4" />Complete work</Button>}
                      {order.completed && !order.dhlTrackingNumber && order.shippingRoute === "dpd" && order.shipmentState !== "booking" && order.shipmentState !== "review" && <Button size="sm" onClick={() => { setActiveOrder(order); setWeight(""); setDialog("book"); }}><Truck className="mr-1.5 h-4 w-4" />Book DPD</Button>}
                      {order.completed && !order.dhlTrackingNumber && order.shippingRoute === "royal_mail" && <Button variant="outline" size="sm" onClick={() => { setActiveOrder(order); setDialog("royal-mail"); }}><Send className="mr-1.5 h-4 w-4" />Add tracking</Button>}
                      {(order.shipmentState === "review" || order.shipmentState === "booking") && <Button variant="outline" size="sm" onClick={() => { setActiveOrder(order); setTrackingNumber(""); setDialog("recover"); }}><ShieldAlert className="mr-1.5 h-4 w-4" />Recover booking</Button>}
                      {order.labelAvailable && <Button variant="outline" size="sm" onClick={() => openDocument(order, "label")}><ArrowDownToLine className="mr-1.5 h-4 w-4" />Label</Button>}
                    </div>}
                    {!isStaff && Boolean(order.deliveryNotes?.length) && <Button variant="outline" size="sm" onClick={() => openDocument(order, "delivery-note")}><ArrowDownToLine className="mr-1.5 h-4 w-4" />Delivery note PDF</Button>}
                  </div>
                  {isStaff && !order.completed && !order.sampleApprovalReady && <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950 md:px-5">
                    <p className="font-semibold">Production completion is waiting on individual sample approvals.</p>
                    <p className="mt-0.5">Each stocking that needs approval must have its latest digital sample approved by the customer before this order can be completed. Staff cannot approve on their behalf.</p>
                  </div>}
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
                        <AbodeStockingSample
                          jobId={order.id}
                          itemId={item.id}
                          name={item.stockingDetails.name}
                          font={item.stockingDetails.font}
                          colour={item.stockingDetails.colour}
                          thread={item.stockingDetails.thread}
                          samples={item.digitalSamples}
                          isStaff={isStaff}
                          canApprove={!isStaff && data.canApproveSamples === true}
                          canUpload={isStaff && !item.completed && !order.completed && !order.dhlTrackingNumber && !/^(invoiced|invoice[_ -]?sent|sent|paid|issued)$/i.test(order.invoiceStatus || "")}
                          onChanged={refresh}
                        />
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
                      {isStaff ? <><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Recipient</p><p className="mt-1 font-medium">{order.recipient.name}</p><p className="mt-1 text-sm leading-5 text-stone-600">{[order.recipient.line1, order.recipient.line2, order.recipient.town, order.recipient.county, order.recipient.postcode].filter(Boolean).join(", ")}</p></> : <><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Delivery</p>{order.dhlTrackingNumber ? <><a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#344e43] underline underline-offset-2" href={trackingUrl(order)} target="_blank" rel="noreferrer">Track parcel <ExternalLink className="h-3.5 w-3.5" /></a><p className="mt-1 break-all font-mono text-xs text-stone-600">{order.dhlTrackingNumber}</p></> : <p className="mt-2 text-sm text-stone-600">{order.completed ? "Ready for dispatch" : "In production"}</p>}</>}
                      {isStaff && order.dhlTrackingNumber && <div className="mt-3 border-t border-stone-100 pt-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Parcel tracking</p><a href={trackingUrl(order)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-[#344e43] underline underline-offset-2">{order.dhlTrackingNumber}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></div>}
                      {isStaff && order.shippingRoute === "royal_mail" && !order.dhlTrackingNumber && <div className="mt-3 border-t border-stone-100 pt-3"><p className="text-xs text-stone-600">Royal Mail route: book externally, then save its tracking number here.</p><a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#344e43] underline" href="https://www.parcel2go.com/" target="_blank" rel="noreferrer">Open Parcel2Go <ExternalLink className="h-3 w-3" /></a></div>}
                      {isStaff && order.shipmentState === "booking" && <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-900"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />DPD booking is still processing. Do not book again. Use recovery only after checking the original booking.</div>}
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
          </div>}
        </section>
      </div>

      <Dialog open={dialog === "complete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle>Confirm production is complete</DialogTitle><DialogDescription>This will mark every remaining stocking on <strong>{activeOrder?.jobName}</strong> as complete. Confirm the pieces have been checked and finished before proceeding.</DialogDescription></DialogHeader><div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mr-2 inline h-4 w-4" />This is a production confirmation, not a dispatch action.</div>{activeOrder && !activeOrder.sampleApprovalReady && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Every stocking awaiting approval needs its latest digital sample approved by the customer first.</p>}<DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Go back</Button><Button disabled={operationMutation.isPending || !activeOrder?.sampleApprovalReady} onClick={() => activeOrder?.sampleApprovalReady && operationMutation.mutate({ order: activeOrder, action: "complete", payload: {} })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm completion</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={dialog === "book"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book one DPD bag</DialogTitle>
            <DialogDescription>A real Expresspak bag label will be purchased when you confirm.</DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">Measured packed weight in grams
            <Input type="number" min="100" max="5000" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <div className="rounded-lg bg-amber-50 p-3 text-sm leading-5 text-amber-900">
            Enter the measured packed weight (100–5,000 g). Up to 1 kg uses Expresspak 1; up to 5 kg uses Expresspak 5.
            Check the bag and address first. If the order exceeds 5 kg, ask a manager to review shipping.
            Do not retry an uncertain booking; check DPD and use recovery.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={!weight.trim() || !Number.isInteger(Number(weight)) || Number(weight) < 100 || Number(weight) > 5000 || operationMutation.isPending}
              onClick={() => activeOrder && operationMutation.mutate({ order: activeOrder, action: "book", payload: { weightGrams: Number(weight) } })}>
              {operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Buy label & book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "royal-mail" || dialog === "recover"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle>{dialog === "recover" ? "Record recovered DPD booking" : "Save Royal Mail tracking"}</DialogTitle><DialogDescription>{dialog === "recover" ? "Only use this after checking the original DPD booking. This records its tracking number; it does not create a new parcel." : "Book the parcel externally, then record the tracking number here."}</DialogDescription></DialogHeader><label className="space-y-2 text-sm font-medium">Tracking number<Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} autoComplete="off" /></label>{dialog === "royal-mail" && <a className="inline-flex items-center gap-1 text-sm font-medium text-[#344e43] underline" href="https://www.parcel2go.com/" target="_blank" rel="noreferrer">Open Parcel2Go <ExternalLink className="h-3.5 w-3.5" /></a>}<DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={!trackingNumber.trim() || operationMutation.isPending} onClick={() => activeOrder && operationMutation.mutate({ order: activeOrder, action: dialog === "recover" ? "recover" : "royal-mail", payload: { trackingNumber: trackingNumber.trim() } })}>{operationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save tracking</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-stone-500">{note}</p></div>;
}
function Spec({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p><p className="mt-1 break-words text-sm font-medium leading-5 text-stone-800">{value || "—"}</p></div>;
}
function StatusPill({ status }: { status: "in-work" | "ready" | "dispatched" | "approval" }) {
  const config = status === "dispatched" ? ["bg-emerald-100 text-emerald-900", "Dispatched"] : status === "ready" ? ["bg-[#f5e8d6] text-[#71482e]", "Ready for dispatch"] : status === "approval" ? ["bg-amber-100 text-amber-950", "Awaiting sample approval"] : ["bg-stone-100 text-stone-700", "In work"];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config[0]}`}>{config[1]}</span>;
}

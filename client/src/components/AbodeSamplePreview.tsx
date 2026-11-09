import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expand, Loader2, Minus, Plus, RotateCw } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Sample = { id: string; fileUrl: string; fileType: string; fileName: string };
let pdfLibrary: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | undefined;
function loadPdfLibrary() {
  return pdfLibrary ||= import("pdfjs-dist/legacy/build/pdf.mjs").then(library => {
    library.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return library;
  });
}

function PdfPage({ document, number = 1, width = 620 }: { document: PDFDocumentProxy; number?: number; width?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void; promise: Promise<void> } | undefined;
    setReady(false);
    setError(false);
    const canvas = canvasRef.current!;
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        const page = await document.getPage(number);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(width * ratio / base.width, Math.sqrt(12_000_000 / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        render = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport });
        await render.promise;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }, { rootMargin: "150px" });
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
      render?.cancel();
    };
  }, [document, number, width]);
  return <div className="relative flex min-h-32 w-full items-center justify-center bg-white">
    {!ready && !error && <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading preview</span>}
    {error && <p role="alert" className="p-4 text-sm text-rose-800">This page could not be displayed. Close and retry the preview.</p>}
    <canvas ref={canvasRef} aria-label={`Sample preview, page ${number}`} className={`block h-auto w-full object-contain ${ready ? "" : "opacity-0"}`} />
  </div>;
}

export function AbodeSamplePreview({ sample, name }: { sample: Sample; name?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isPdf = sample.fileType === "application/pdf" || /\.pdf$/i.test(sample.fileName);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setActive(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(rootRef.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isPdf || !active) return;
    const controller = new AbortController();
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | undefined;
    setDocument(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(sample.fileUrl, { credentials: "include", signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to view this sample." : "The sample could not be loaded.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const library = await loadPdfLibrary();
        if (cancelled) return;
        const loading = library.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
        task = loading;
        const pdf = await loading.promise;
        if (!cancelled) setDocument(pdf);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The sample could not be loaded.");
      }
    })();
    return () => { cancelled = true; controller.abort(); void task?.destroy(); };
  }, [active, isPdf, sample.id, sample.fileUrl, attempt]);
  const preview = (width: number) => isPdf
    ? document ? <PdfPage document={document} width={width} /> : <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading sample</div>
    : <img src={sample.fileUrl} alt={`Digital sample${name ? ` for ${name}` : ""}`} className="block max-h-[65vh] w-full object-contain" loading="lazy" onError={() => setError("The sample image could not be loaded.")} />;
  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const enlarge = () => { setHovered(false); setZoom(1); setOpen(true); };
  return <div ref={rootRef} className="mt-3 min-w-0">
    {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <p>{error}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setError(""); setAttempt(value => value + 1); }}><RotateCw className="mr-1 h-3.5 w-3.5" />Retry preview</Button>
    </div> : <button type="button" className="group block w-full overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#344e43]"
      aria-label={`Enlarge sample preview${name ? ` for ${name}` : ""}`} onClick={enlarge}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)} onFocus={() => { if (canHover()) setHovered(true); }} onBlur={() => setHovered(false)}
      onKeyDown={event => { if (event.key === "Escape") setHovered(false); }}>
      <div className="flex h-44 items-center justify-center overflow-hidden [&_canvas]:max-h-44 [&_img]:max-h-44">{preview(420)}</div>
      <span className="flex items-center justify-between gap-2 border-t border-stone-100 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700">
        <span>Hover to preview · tap to enlarge</span><Expand className="h-3.5 w-3.5 shrink-0" />
      </span>
    </button>}
    {hovered && !error && !open && createPortal(
      <div aria-hidden="true" className="pointer-events-none fixed left-1/2 top-1/2 z-[70] max-h-[78vh] w-[min(680px,85vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-stone-300 bg-white p-3 shadow-2xl">
        <div className="max-h-[70vh] overflow-hidden [&_canvas]:max-h-[70vh]">{preview(680)}</div>
        <p className="mt-2 text-center text-xs text-stone-500">Click the sample to enlarge and inspect</p>
      </div>, window.document.body)}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col overflow-hidden bg-[#fbfaf7]">
        <DialogHeader><DialogTitle>Sample preview{name ? ` · ${name}` : ""}</DialogTitle><DialogDescription>Check the sample on screen, then return to approve or reject it.</DialogDescription></DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-stone-500">{isPdf && document ? `${document.numPages} page${document.numPages === 1 ? "" : "s"}` : "Digital sample"}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><Minus className="h-4 w-4" /></Button>
            <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <Button type="button" variant="outline" size="icon" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border border-stone-200 bg-stone-100 p-2">
          <div style={{ width: `${zoom * 100}%` }} className="space-y-3">
            {isPdf && document ? Array.from({ length: document.numPages }, (_, index) => <div key={index}><PdfPage document={document} number={index + 1} width={800 * zoom} /><p className="mt-1 text-center text-xs text-stone-500">Page {index + 1} of {document.numPages}</p></div>)
              : preview(800 * zoom)}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Back to sample approval</Button>
      </DialogContent>
    </Dialog>
  </div>;
}

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Search, Palette, Upload, RefreshCw, Sheet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import type { ThreadColour } from "@shared/schema";

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function ColourSwatch({ colour }: { colour: ThreadColour }) {
  const bg = `rgb(${colour.r},${colour.g},${colour.b})`;
  const dark = luminance(colour.r, colour.g, colour.b) < 140;
  const textColour = dark ? "#ffffff" : "#1a1a1a";
  const subTextColour = dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col cursor-default select-none"
      style={{ background: bg }}
      title={`${colour.code} — ${colour.name}`}
      data-testid={`swatch-${colour.code}`}
    >
      <div className="flex-1 min-h-[64px]" />
      <div className="px-3 py-2.5">
        <p className="text-xs font-bold leading-tight" style={{ color: textColour }}>
          {colour.code}
        </p>
        <p className="text-[11px] leading-snug mt-0.5 line-clamp-2" style={{ color: subTextColour }}>
          {colour.name}
        </p>
      </div>
    </div>
  );
}

function UnknownSwatch({ code, chart }: { code: string; chart: string }) {
  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col cursor-default select-none border bg-muted/40"
      title={`${code} — not in TCH library`}
      data-testid={`swatch-unknown-${code}`}
    >
      <div className="flex-1 min-h-[64px] flex items-center justify-center">
        <span className="text-xs text-muted-foreground/50">?</span>
      </div>
      <div className="px-3 py-2.5 border-t">
        <p className="text-xs font-bold leading-tight text-foreground">{code}</p>
        <p className="text-[11px] leading-snug mt-0.5 text-muted-foreground/60">{chart}</p>
      </div>
    </div>
  );
}

export default function ThreadColourChart({ customerView = false }: { customerView?: boolean }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isImpersonating } = usePermissions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [chartFilter, setChartFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("library");

  const isStaff = user?.role !== undefined;

  const { data: colours = [], isLoading } = useQuery<ThreadColour[]>({
    queryKey: ["/api/thread-library"],
  });

  const { data: sheetColours, isLoading: sheetLoading, refetch: refetchSheet } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/thread-library/sheet-colours"],
    enabled: isStaff && !customerView,
    staleTime: 5 * 60_000,
  });

  const charts = useMemo(() => {
    const set = new Set(colours.map(c => c.chart));
    return Array.from(set).sort();
  }, [colours]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return colours.filter(c => {
      const matchChart = chartFilter === "all" || c.chart === chartFilter;
      const matchSearch =
        !q ||
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q);
      return matchChart && matchSearch;
    });
  }, [colours, search, chartFilter]);

  // Build "My Colours" list — sheet codes cross-referenced with TCH library
  const myColours = useMemo(() => {
    if (!sheetColours) return [];
    const byCode = new Map(colours.map(c => [c.code, c]));
    const result: Array<{ code: string; chart: string; tchColour: ThreadColour | null }> = [];
    for (const [chart, codes] of Object.entries(sheetColours)) {
      for (const code of codes) {
        result.push({ code, chart, tchColour: byCode.get(code) ?? null });
      }
    }
    return result;
  }, [sheetColours, colours]);

  const myColoursFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return myColours.filter(c => {
      const matchChart = chartFilter === "all" || c.chart === chartFilter;
      const matchSearch =
        !q ||
        c.code.toLowerCase().includes(q) ||
        (c.tchColour?.name || "").toLowerCase().includes(q);
      return matchChart && matchSearch;
    });
  }, [myColours, search, chartFilter]);

  const myCharts = useMemo(() => {
    if (!sheetColours) return [];
    return Object.keys(sheetColours).sort();
  }, [sheetColours]);

  const sheetTotal = useMemo(() =>
    Object.values(sheetColours ?? {}).reduce((s, arr) => s + arr.length, 0),
  [sheetColours]);

  const matchedCount = useMemo(() =>
    myColours.filter(c => c.tchColour !== null).length,
  [myColours]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await apiRequest("POST", "/api/thread-library/import-tch", { data: b64 });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      toast({ title: `Imported ${json.imported} thread colours` });
      queryClient.invalidateQueries({ queryKey: ["/api/thread-library"] });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const backPath = isStaff ? "/dashboard" : "/customer/documents";
  const activeCharts = activeTab === "sheet" ? myCharts : charts;

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && <ImpersonationBanner customerEmail="" />}

      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(backPath)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <span className="font-semibold text-sm">Thread Colour Library</span>
          <div className="flex-1" />
          {!customerView && isStaff && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".tch,.TCH"
                className="hidden"
                onChange={handleImport}
                data-testid="input-tch-file"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                data-testid="button-import-tch"
              >
                {importing ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sync .TCH file
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/8 via-background to-primary/4 border-b">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Palette className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Thread Colour Library</h1>
              <p className="text-muted-foreground mt-0.5">
                Madeira Classic 40 &amp; PolyNeon 40 — select your thread colour by code or name
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab bar + filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <TabsList data-testid="tabs-thread-library">
              <TabsTrigger value="library" data-testid="tab-full-library">
                Full Library
                {colours.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs no-default-active-elevate">
                    {colours.length}
                  </Badge>
                )}
              </TabsTrigger>
              {!customerView && isStaff && (
                <TabsTrigger value="sheet" data-testid="tab-my-colours">
                  <Sheet className="h-3.5 w-3.5 mr-1.5" />
                  My Colours
                  {sheetTotal > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs no-default-active-elevate">
                      {sheetTotal}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by code or name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-thread"
              />
            </div>

            {activeCharts.length > 1 && (
              <Select value={chartFilter} onValueChange={setChartFilter}>
                <SelectTrigger className="w-52" data-testid="select-chart-filter">
                  <SelectValue placeholder="All charts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All charts</SelectItem>
                  {activeCharts.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Full Library tab */}
          <TabsContent value="library">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <p className="text-sm">Loading thread library…</p>
              </div>
            ) : colours.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Palette className="h-7 w-7 text-muted-foreground/50" />
                  </div>
                  <p className="font-medium text-muted-foreground">No thread colours loaded yet.</p>
                  {isStaff && (
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Use the "Sync .TCH file" button above to load your Wilcom thread library.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <p>No colours match your search.</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                {filtered.map(colour => (
                  <ColourSwatch key={colour.id} colour={colour} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Colours tab (staff only — sourced from Google Sheet) */}
          {!customerView && isStaff && (
            <TabsContent value="sheet">
              {sheetLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-sm">Loading colours from Google Sheet…</p>
                </div>
              ) : !sheetColours || sheetTotal === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Sheet className="h-7 w-7 text-muted-foreground/50" />
                    </div>
                    <p className="font-medium text-muted-foreground">No colours found in the Google Sheet.</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Make sure the sheet has colour codes in column A across the Classic 40, Classic 60, and Poly Neon 60 tabs.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchSheet()}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {colours.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                      <Sheet className="h-4 w-4 text-primary shrink-0" />
                      <span>
                        {matchedCount} of {sheetTotal} colours matched in your TCH library
                        {matchedCount < sheetTotal && (
                          <> — <span className="text-amber-600 dark:text-amber-400">{sheetTotal - matchedCount} not yet in library</span> (sync your .TCH file to add them)</>
                        )}
                      </span>
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetchSheet()} data-testid="button-refresh-sheet">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {myColoursFiltered.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                      <p>No colours match your search.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                      {myColoursFiltered.map(({ code, chart, tchColour }) =>
                        tchColour ? (
                          <ColourSwatch key={`${chart}-${code}`} colour={tchColour} />
                        ) : (
                          <UnknownSwatch key={`${chart}-${code}`} code={code} chart={chart} />
                        )
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

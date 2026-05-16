import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Search, Palette, Upload, RefreshCw } from "lucide-react";
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
        <p
          className="text-xs font-bold leading-tight"
          style={{ color: textColour }}
        >
          {colour.code}
        </p>
        <p
          className="text-[11px] leading-snug mt-0.5 line-clamp-2"
          style={{ color: subTextColour }}
        >
          {colour.name}
        </p>
      </div>
    </div>
  );
}

export default function ThreadColourChart() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isImpersonating } = usePermissions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [chartFilter, setChartFilter] = useState("all");

  const isStaff = user?.role !== undefined;

  const { data: colours = [], isLoading } = useQuery<ThreadColour[]>({
    queryKey: ["/api/thread-library"],
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
          {isStaff && (
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
                Import .TCH file
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/8 via-background to-primary/4 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Palette className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Thread Colour Library
              </h1>
              <p className="text-muted-foreground mt-0.5">
                Madeira Classic 40 &amp; PolyNeon 40 — select your thread colour by code or name
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b bg-card/30">
        <div className="container mx-auto px-4 py-3 flex flex-wrap gap-3 items-center">
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
          {charts.length > 1 && (
            <Select value={chartFilter} onValueChange={setChartFilter}>
              <SelectTrigger className="w-52" data-testid="select-chart-filter">
                <SelectValue placeholder="All charts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All charts</SelectItem>
                {charts.map(c => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge
            className="text-xs font-normal no-default-active-elevate"
            variant="secondary"
            data-testid="badge-count"
          >
            {filtered.length} colour{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Grid */}
      <main className="container mx-auto px-4 py-8">
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
              <p className="font-medium text-muted-foreground">
                No thread colours loaded yet.
              </p>
              {isStaff && (
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Use the "Import .TCH file" button above to load your Wilcom thread library.
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
      </main>
    </div>
  );
}

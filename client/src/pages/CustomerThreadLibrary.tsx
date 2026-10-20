import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowDown, ArrowLeft, ArrowUp, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import type { ListedThreadColour } from "@shared/thread-sheet";
import { compareThreadCodes, getThreadRangeLabel } from "@shared/thread-colours";

type CustomerIdentity = { email: string };

function ThreadEntry({ entry }: { entry: ListedThreadColour }) {
  const colour = entry.colour;
  const swatch = colour ? `rgb(${colour.r}, ${colour.g}, ${colour.b})` : undefined;

  return (
    <article
      className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
      data-testid={`thread-entry-${entry.chart}-${entry.code}`}
    >
      {colour ? (
        <div
          className="relative h-24 border-b border-black/5"
          style={{ backgroundColor: swatch }}
          aria-label={`Shade preview for ${entry.code}`}
          data-testid={`thread-swatch-${entry.code}`}
        >
          <span className="absolute bottom-2 right-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-black/60">
            SHADE
          </span>
        </div>
      ) : (
        <div
          className="flex h-24 items-center justify-center border-b border-dashed bg-muted/50"
          data-testid={`thread-swatch-unavailable-${entry.code}`}
        >
          <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            Shade preview unavailable
          </span>
        </div>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Thread code</p>
            <h2 className="mt-1 truncate text-lg font-bold leading-none tracking-tight" data-testid={`thread-code-${entry.code}`}>
              {entry.code}
            </h2>
          </div>
          <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
        </div>
        <div className="border-t pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Colour shade</p>
          <p className="mt-1 min-h-5 text-sm font-medium leading-snug">
            {colour ? colour.name : <span className="text-muted-foreground">Shade preview unavailable</span>}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Range</span>
          <span className="rounded-md bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary" data-testid={`thread-range-${entry.code}`}>
            {getThreadRangeLabel(entry.chart)}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function CustomerThreadLibrary() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();
  const [search, setSearch] = useState("");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { data: customerUser } = useQuery<CustomerIdentity>({
    queryKey: ["/api/customer-auth/user"],
  });
  const {
    data: listedColours = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ListedThreadColour[]>({
    queryKey: ["/api/thread-library/listed-colours"],
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const ranges = useMemo(() => {
    const values = new Map<string, string>();
    listedColours.forEach(({ chart }) => values.set(chart, getThreadRangeLabel(chart)));
    return Array.from(values.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [listedColours]);

  const filteredColours = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return listedColours
      .filter(({ code, chart, colour }) => {
        const matchesRange = rangeFilter === "all" || chart === rangeFilter;
        const matchesSearch = !query
          || code.toLocaleLowerCase().includes(query)
          || (colour?.name ?? "").toLocaleLowerCase().includes(query);
        return matchesRange && matchesSearch;
      })
      .sort((a, b) => {
        const comparison = compareThreadCodes(a, b);
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [listedColours, rangeFilter, search, sortDirection]);

  return (
    <div
      className="h-screen h-dvh overflow-y-auto overscroll-y-contain bg-background"
      data-testid="customer-thread-library-scroll-area"
    >
      {isImpersonating && <ImpersonationBanner customerEmail={customerUser?.email ?? ""} />}

      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="container mx-auto flex min-h-14 items-center gap-3 px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/customer/dashboard")}
            data-testid="button-thread-library-back"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2">
            <Palette className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate text-sm font-semibold">Thread Library</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 pb-12">
        <section className="relative -mx-4 overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-primary/[0.025] px-4 py-8 sm:py-10">
          <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full border-[32px] border-primary/[0.045]" />
          <div className="relative mx-auto max-w-7xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-px w-7 bg-primary/50" />
              Colour reference
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" data-testid="heading-thread-library">
              Thread Library
            </h1>
            <p className="mt-4 max-w-4xl text-base leading-relaxed text-muted-foreground sm:text-lg" data-testid="thread-library-intro">
              We are continually adding to our thread library. If we do not have the exact thread in stock then we can either offer an alternative shade, or in certain circumstances order it in and add it to our library.
            </p>
          </div>
        </section>

        <section className="py-6 sm:py-8" aria-label="Thread colours">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by thread code or shade"
                className="h-11 border-border/80 bg-card pl-9"
                aria-label="Search by thread code or shade"
                data-testid="input-search-listed-threads"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={rangeFilter} onValueChange={setRangeFilter}>
                <SelectTrigger className="h-11 w-full bg-card sm:w-56" data-testid="select-thread-range">
                  <SelectValue placeholder="All ranges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ranges</SelectItem>
                  {ranges.map(([chart, label]) => (
                    <SelectItem key={chart} value={chart}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start bg-card sm:justify-center"
                onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
                aria-label={`Numerical code sort, currently ${sortDirection === "asc" ? "ascending" : "descending"}`}
                data-testid="button-sort-thread-codes"
              >
                {sortDirection === "asc" ? <ArrowUp className="mr-2 h-4 w-4" /> : <ArrowDown className="mr-2 h-4 w-4" />}
                Code: numeric {sortDirection === "asc" ? "ascending" : "descending"}
              </Button>
            </div>
          </div>

          {!isLoading && !isError && listedColours.length > 0 && (
            <div className="mb-4 flex items-center justify-between border-b pb-3 text-sm text-muted-foreground">
              <span>
                {filteredColours.length} {filteredColours.length === 1 ? "thread" : "threads"}
                {rangeFilter !== "all" || search.trim() ? " shown" : " listed"}
              </span>
              <span className="hidden text-xs sm:inline">Codes are ordered numerically</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
                  <div className="h-24 animate-pulse bg-muted/80" />
                  <div className="space-y-3 p-4">
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <Card className="border-destructive/20 bg-card">
              <CardContent className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <Palette className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="font-semibold">Thread library unavailable</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  We could not load the listed thread colours. Please try again.
                </p>
                <Button variant="outline" className="mt-5" onClick={() => refetch()} data-testid="button-retry-thread-library">
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : listedColours.length === 0 ? (
            <Card className="border-dashed bg-card/70">
              <CardContent className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Palette className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="font-semibold">No thread colours are listed yet</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Please check back soon as we continue adding to the library.
                </p>
              </CardContent>
            </Card>
          ) : filteredColours.length === 0 ? (
            <Card className="border-dashed bg-card/70">
              <CardContent className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="font-semibold">No thread colours match</h2>
                <p className="mt-1 text-sm text-muted-foreground">Try another code or shade, or choose a different range.</p>
                <Button
                  variant="ghost"
                  className="mt-3"
                  onClick={() => { setSearch(""); setRangeFilter("all"); }}
                  data-testid="button-clear-thread-filters"
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredColours.map((entry, index) => (
                <ThreadEntry key={`${entry.chart}-${entry.code}-${index}`} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

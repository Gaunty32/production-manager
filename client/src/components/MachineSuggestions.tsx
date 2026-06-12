import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTimeDisplay } from "@shared/machines";
import { cn } from "@/lib/utils";

interface Suggestion {
  machineId: number;
  machineName: string;
  heads: number;
  estimatedDuration: number;
  estimatedRuns: number;
  earliestDate: string;
  startTimeFormatted: string;
  endTimeFormatted: string;
  staffId: string | null;
  staffName: string | null;
  canMeetDeadline: boolean;
  daysUntilAvailable: number;
  score: number;
}

interface MachineSuggestionsProps {
  quantity: number;
  stitchCount: number;
  jobType: string;
  dispatchDate?: string | null;
  currentMachineId: number | null;
  onSelect: (machineId: number, staffId?: string | null) => void;
}

const EMBROIDERY_TYPES = ["Embroidery", "Embroidery Initials/Name"];
const DEBOUNCE_MS = 700;

export function MachineSuggestions({
  quantity,
  stitchCount,
  jobType,
  dispatchDate,
  currentMachineId,
  onSelect,
}: MachineSuggestionsProps) {
  // Debounced query params — only update after the user stops typing
  const [committed, setCommitted] = useState<{
    quantity: number;
    stitchCount: number;
    dispatchDate: string | null;
  } | null>(null);

  const isEmbroidery = EMBROIDERY_TYPES.includes(jobType);
  const canQuery = isEmbroidery && quantity > 0 && stitchCount > 0;

  useEffect(() => {
    if (!canQuery) {
      setCommitted(null);
      return;
    }
    const timer = setTimeout(() => {
      setCommitted({ quantity, stitchCount, dispatchDate: dispatchDate || null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [quantity, stitchCount, dispatchDate, canQuery]);

  const queryParams = committed
    ? new URLSearchParams({
        quantity: committed.quantity.toString(),
        stitchCount: committed.stitchCount.toString(),
        ...(committed.dispatchDate ? { dispatchDate: committed.dispatchDate } : {}),
        jobType,
      }).toString()
    : null;

  const { data, isLoading, isFetching } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ["/api/scheduling/machine-suggestions", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/scheduling/machine-suggestions?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: !!queryParams,
    staleTime: 30_000,
  });

  if (!isEmbroidery) return null;
  if (!canQuery) return null;

  const loading = isLoading || isFetching || committed === null;
  const suggestions = data?.suggestions ?? [];

  return (
    <div className="mt-2 space-y-1.5" data-testid="machine-suggestions">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="font-medium">Machine suggestions</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
      </div>

      {!loading && suggestions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No available slots found within the scheduling window.
        </p>
      )}

      {!loading && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => {
            const isSelected = currentMachineId === s.machineId;
            const isRecommended = i === 0;
            return (
              <button
                key={s.machineId}
                type="button"
                onClick={() => onSelect(s.machineId, s.staffId)}
                data-testid={`machine-suggestion-${s.machineId}`}
                className={cn(
                  "text-left rounded-md border px-3 py-2 text-xs transition-colors hover-elevate active-elevate-2",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-semibold">{s.machineName}</span>
                  {isRecommended && !isSelected && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1 h-4">Best</Badge>
                  )}
                  {isSelected && (
                    <Badge variant="default" className="text-[10px] py-0 px-1 h-4">Selected</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  {s.canMeetDeadline ? (
                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  <span className={s.canMeetDeadline ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                    {s.canMeetDeadline ? "Meets deadline" : "Misses deadline"}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {s.daysUntilAvailable === 0
                    ? "Available today"
                    : `Free ${format(parseISO(s.earliestDate), "EEE d MMM")}`}
                </div>
                <div className="text-muted-foreground">
                  Est. {formatTimeDisplay(s.estimatedDuration)}
                  {" · "}{s.estimatedRuns} run{s.estimatedRuns !== 1 ? "s" : ""}
                </div>
                {s.staffName && (
                  <div className="text-muted-foreground mt-0.5">
                    Operator: {s.staffName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

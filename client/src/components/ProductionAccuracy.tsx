import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TrendingUp, TrendingDown, Minus, CalendarIcon, RefreshCw, Sliders } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { formatTimeDisplay } from "@shared/machines";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AccuracyItem {
  lineItemId: string;
  jobName: string;
  machineId: number;
  machineName: string;
  quantity: number;
  stitchCount: number;
  estimatedMinutes: number;
  actualMinutes: number;
  variance: number;
  ratio: number | null;
  completedAt: string | null;
}

interface MachineStat {
  machineId: number;
  name: string;
  count: number;
  avgRatio: number;
  avgVarianceMinutes: number;
}

interface AccuracyData {
  overall: {
    count: number;
    avgRatio: number | null;
    avgAccuracyPercent: number | null;
  };
  byMachine: MachineStat[];
  items: AccuracyItem[];
}

function AccuracyBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const pct = Math.round(ratio * 100);
  if (ratio <= 1.05) {
    return (
      <Badge variant="outline" className="text-green-600 dark:text-green-400 gap-1 text-xs">
        <TrendingDown className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  if (ratio <= 1.20) {
    return (
      <Badge variant="outline" className="text-amber-600 dark:text-amber-400 gap-1 text-xs">
        <Minus className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-destructive gap-1 text-xs">
      <TrendingUp className="h-3 w-3" />
      {pct}%
    </Badge>
  );
}

const DEFAULT_FROM = new Date("2026-05-01");

interface CalibrationMachine {
  id: number;
  name: string;
  isActive: boolean;
  schedulingMultiplier: number;
  calibrationStartedAt: string;
  lastRecalibratedAt: string | null;
}

interface CalibrationData {
  machines: CalibrationMachine[];
  history: Array<{
    id: string;
    machineId: number;
    runAt: string;
    previousMultiplier: number;
    newMultiplier: number;
    observedRatio: number | null;
    sampleCount: number;
    trigger: string;
  }>;
}

export function ProductionAccuracy() {
  const [fromDate, setFromDate] = useState<Date>(DEFAULT_FROM);
  const [calOpen, setCalOpen] = useState(false);
  const { toast } = useToast();

  const queryKey = ["/api/scheduling/accuracy", fromDate.toISOString()];
  const { data, isLoading } = useQuery<AccuracyData>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ fromDate: fromDate.toISOString() });
      const res = await fetch(`/api/scheduling/accuracy?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accuracy");
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const { data: calibration } = useQuery<CalibrationData>({
    queryKey: ["/api/scheduling/calibration"],
  });

  const recalibrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scheduling/recalibrate", {});
      return res.json();
    },
    onSuccess: (data: { results: Array<{ machineName: string; sampleCount: number; newMultiplier: number }> }) => {
      const updated = data.results.filter(r => r.sampleCount >= 3).length;
      toast({
        title: "Recalibration complete",
        description: `${updated} machine${updated !== 1 ? "s" : ""} updated based on the last 2 weeks of completed jobs.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/calibration"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/accuracy"] });
    },
    onError: (err: Error) => {
      toast({ title: "Recalibration failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="animate-pulse h-24" />)}
        </div>
        <Card className="animate-pulse h-48" />
      </div>
    );
  }

  const { overall, byMachine, items } = data ?? { overall: { count: 0, avgRatio: null, avgAccuracyPercent: null }, byMachine: [], items: [] };

  const overallPct = overall.avgAccuracyPercent;
  const overallRatio = overall.avgRatio;

  const overallColor =
    overallRatio === null ? "text-muted-foreground"
    : overallRatio <= 1.05 ? "text-green-600 dark:text-green-400"
    : overallRatio <= 1.20 ? "text-amber-600 dark:text-amber-400"
    : "text-destructive";

  const overallLabel =
    overallRatio === null ? "—"
    : overallRatio <= 1.05 ? "Accurate"
    : overallRatio <= 1.20 ? "Slightly over"
    : "Consistently over";

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Measuring from:</span>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-accuracy-from-date">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(fromDate, "d MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={(d) => { if (d) { setFromDate(d); setCalOpen(false); } }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {fromDate.toDateString() !== DEFAULT_FROM.toDateString() && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7"
            onClick={() => setFromDate(DEFAULT_FROM)}
          >
            Reset to 1 May 2026
          </Button>
        )}
      </div>

      {/* Calibration panel */}
      {calibration && calibration.machines.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-start gap-2">
                <Sliders className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">Scheduling calibration</p>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                    Each machine has a multiplier the scheduler uses to convert stitches into minutes. Every 2 weeks the system gently nudges each multiplier halfway toward what the last 2 weeks of completed jobs suggest, so estimates trend toward 100% accuracy. Invoiced stitch counts are never changed.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={recalibrateMutation.isPending}
                onClick={() => recalibrateMutation.mutate()}
                data-testid="button-recalibrate-now"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", recalibrateMutation.isPending && "animate-spin")} />
                Recalibrate now
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {calibration.machines.filter(m => m.isActive).map(m => {
                const mult = m.schedulingMultiplier ?? 1;
                const pct = Math.round(mult * 100);
                const color =
                  Math.abs(mult - 1) < 0.05 ? "text-green-600 dark:text-green-400"
                  : Math.abs(mult - 1) < 0.20 ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive";
                const lastRun = m.lastRecalibratedAt
                  ? `Recalibrated ${formatDistanceToNow(new Date(m.lastRecalibratedAt), { addSuffix: true })}`
                  : "Not yet recalibrated";
                return (
                  <div key={m.id} className="rounded-md border p-2.5" data-testid={`calibration-machine-${m.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium truncate">{m.name}</p>
                      <span className={cn("text-sm font-bold", color)}>{pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{lastRun}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {overall.count === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No accuracy data for this period</p>
            <p className="text-xs text-muted-foreground mt-1">
              Once embroidery jobs completed after {format(fromDate, "d MMM yyyy")} have actual production times recorded, accuracy statistics will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Overall accuracy</p>
                <p className={cn("text-2xl font-bold mt-1", overallColor)}>
                  {overallPct !== null ? `${overallPct}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{overallLabel}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Jobs measured</p>
                <p className="text-2xl font-bold mt-1">{overall.count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">completed with actuals</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Avg overrun</p>
                <p className={cn("text-2xl font-bold mt-1", overallRatio && overallRatio > 1 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400")}>
                  {overallRatio !== null
                    ? overallRatio >= 1
                      ? `+${Math.round((overallRatio - 1) * 100)}%`
                      : `${Math.round((overallRatio - 1) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">actual vs estimated</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-machine breakdown */}
          {byMachine.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Per-machine accuracy</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {byMachine.map(m => {
                  const pct = Math.round(m.avgRatio * 100);
                  const color =
                    m.avgRatio <= 1.05 ? "text-green-600 dark:text-green-400"
                    : m.avgRatio <= 1.20 ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive";
                  const label =
                    m.avgVarianceMinutes >= 0
                      ? `+${m.avgVarianceMinutes}m avg overrun`
                      : `${m.avgVarianceMinutes}m avg under`;
                  return (
                    <Card key={m.machineId}>
                      <CardContent className="pt-4 pb-4">
                        <p className="text-xs font-medium truncate">{m.name}</p>
                        <p className={cn("text-xl font-bold mt-1", color)}>{pct}%</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        <p className="text-xs text-muted-foreground">{m.count} job{m.count !== 1 ? "s" : ""}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Explanatory note */}
          {overallRatio !== null && overallRatio > 1.10 && (
            <Card className="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="py-3 px-4 text-xs text-amber-700 dark:text-amber-300">
                <strong>Tip:</strong> The formula is running consistently slower than estimated. Consider increasing the stitch count entered per job to account for practical speed, or adjust machine stitches/minute in Machine Management.
              </CardContent>
            </Card>
          )}

          {/* Recent items table */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Recent completed jobs</h3>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Job</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Machine</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Est.</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Actual</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Accuracy</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.lineItemId} className="border-b last:border-0" data-testid={`accuracy-item-${item.lineItemId}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium truncate max-w-[180px]">{item.jobName}</div>
                          <div className="text-xs text-muted-foreground">{item.quantity} × {item.stitchCount?.toLocaleString()} sts</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.machineName}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{formatTimeDisplay(item.estimatedMinutes)}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{formatTimeDisplay(item.actualMinutes)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <AccuracyBadge ratio={item.ratio} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden md:table-cell">
                          {item.completedAt ? format(new Date(item.completedAt), "d MMM yy") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

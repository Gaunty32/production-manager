import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import { formatTimeDisplay } from "@shared/machines";
import { cn } from "@/lib/utils";

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

export function ProductionAccuracy() {
  const { data, isLoading } = useQuery<AccuracyData>({
    queryKey: ["/api/scheduling/accuracy"],
    refetchInterval: 120_000,
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

  if (!data || data.overall.count === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium">No accuracy data yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once embroidery jobs are completed with actual production times recorded, accuracy statistics will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { overall, byMachine, items } = data;
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
    </div>
  );
}

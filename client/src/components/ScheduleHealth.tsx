import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Clock, XCircle, CalendarOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { formatTimeDisplay } from "@shared/machines";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface HealthItem {
  lineItemId: string;
  jobId: string;
  jobName: string;
  customerName: string;
  position: string | null;
  quantity: number;
  estimatedMinutes: number | null;
  machineId: number | null;
  dispatchDate: string | null;
  scheduledDate: string | null;
  status: "will_miss" | "unscheduled_urgent" | "at_risk" | "on_track" | "unscheduled";
  daysUntilDispatch: number | null;
  daysLate: number | null;
}

interface HealthSummary {
  willMiss: number;
  unscheduledUrgent: number;
  atRisk: number;
  onTrack: number;
  unscheduled: number;
}

interface HealthData {
  summary: HealthSummary;
  items: HealthItem[];
}

const STATUS_CONFIG = {
  will_miss: {
    label: "Will Miss",
    color: "text-destructive",
    bgColor: "bg-destructive/10 border-destructive/20",
    badgeVariant: "destructive" as const,
    icon: XCircle,
  },
  unscheduled_urgent: {
    label: "Urgent — Not Scheduled",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/40",
    badgeVariant: "outline" as const,
    icon: AlertTriangle,
  },
  at_risk: {
    label: "At Risk",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40",
    badgeVariant: "outline" as const,
    icon: AlertTriangle,
  },
  on_track: {
    label: "On Track",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/40",
    badgeVariant: "outline" as const,
    icon: CheckCircle,
  },
  unscheduled: {
    label: "Unscheduled",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30 border-border",
    badgeVariant: "secondary" as const,
    icon: CalendarOff,
  },
};

type FilterStatus = "all" | HealthItem["status"];

export function ScheduleHealth() {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const { data, isLoading } = useQuery<HealthData>({
    queryKey: ["/api/scheduling/health"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card className="animate-pulse h-24" />
        <Card className="animate-pulse h-48" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, items } = data;
  const total = items.length;

  const filteredItems = filter === "all" ? items : items.filter(i => i.status === filter);

  const summaryTiles: { key: FilterStatus; label: string; count: number; color: string }[] = [
    { key: "will_miss", label: "Will Miss", count: summary.willMiss, color: "text-destructive" },
    { key: "unscheduled_urgent", label: "Urgent", count: summary.unscheduledUrgent, color: "text-orange-600 dark:text-orange-400" },
    { key: "at_risk", label: "At Risk", count: summary.atRisk, color: "text-amber-600 dark:text-amber-400" },
    { key: "on_track", label: "On Track", count: summary.onTrack, color: "text-green-600 dark:text-green-400" },
    { key: "unscheduled", label: "Unscheduled", count: summary.unscheduled, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-5 gap-3">
        {summaryTiles.map(tile => (
          <button
            key={tile.key}
            onClick={() => setFilter(filter === tile.key ? "all" : tile.key)}
            className={cn(
              "rounded-md border p-3 text-center hover-elevate active-elevate-2 transition-colors",
              filter === tile.key ? "bg-accent border-accent" : "bg-card"
            )}
            data-testid={`health-filter-${tile.key}`}
          >
            <div className={cn("text-2xl font-bold", tile.color)}>{tile.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{tile.label}</div>
          </button>
        ))}
      </div>

      {/* Item list */}
      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">All embroidery jobs are on track</p>
            <p className="text-xs text-muted-foreground mt-1">No active jobs are at risk of missing their deadlines</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No jobs in this category</p>
          )}
          {filteredItems.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            const Icon = cfg.icon;
            return (
              <div
                key={item.lineItemId}
                className={cn("rounded-md border p-4 flex items-start gap-4", cfg.bgColor)}
                data-testid={`health-item-${item.lineItemId}`}
              >
                <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <Link href={`/orders?job=${item.jobId}`}>
                      <span className="font-medium text-sm hover:underline cursor-pointer">
                        {item.jobName}
                      </span>
                    </Link>
                    <Badge variant={cfg.badgeVariant} className={cn("text-xs shrink-0", cfg.color)}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.customerName}{item.position ? ` — ${item.position}` : ""}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{item.quantity} units</span>
                    {item.estimatedMinutes && (
                      <span>Est. {formatTimeDisplay(item.estimatedMinutes)}</span>
                    )}
                    {!item.machineId && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">No machine assigned</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  {item.dispatchDate && (
                    <div className="text-xs font-medium">
                      Due {format(parseISO(item.dispatchDate), "d MMM")}
                    </div>
                  )}
                  {item.scheduledDate && (
                    <div className="text-xs text-muted-foreground">
                      Sched. {format(parseISO(item.scheduledDate), "d MMM")}
                    </div>
                  )}
                  {item.daysLate !== null && item.daysLate > 0 && (
                    <div className="text-xs text-destructive font-medium">{item.daysLate}d late</div>
                  )}
                  {item.daysUntilDispatch !== null && item.daysLate === null && (
                    <div className={cn("text-xs", item.daysUntilDispatch < 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {item.daysUntilDispatch < 0
                        ? `${Math.abs(item.daysUntilDispatch)}d overdue`
                        : item.daysUntilDispatch === 0
                        ? "Due today"
                        : `${item.daysUntilDispatch}d left`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

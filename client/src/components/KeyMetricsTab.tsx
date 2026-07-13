import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DemoAmount, DemoText } from "@/components/DemoText";
import { format, parseISO, subWeeks } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Users, Package, PoundSterling, Target, Clock, AlertTriangle, Activity, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KeyMetricsWeek {
  weekStart: string;
  weekEnd: string;
  activeCustomers: number;
  completedJobs: number;
  jobValue: number;
  avgJobValue: number;
  avgJobQuantity: number;
  onTimeCount: number;
  lateOrders: number;
  onTimePercentage: number;
  totalErrors: number;
  outputQuantity: number;
}

interface DeliveryJob {
  jobId: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  completedDate: string;
  onTime: boolean | null;
  invoiceTotal: number;
}

interface KeyMetricsData {
  weekly: KeyMetricsWeek[];
  rolling: Omit<KeyMetricsWeek, "weekStart" | "weekEnd"> & { weeks: number };
  deliveryJobs: DeliveryJob[];
  showPrices: boolean;
}

type MetricKey =
  | "activeCustomers"
  | "avgJobQuantity"
  | "jobValue"
  | "avgJobValue"
  | "onTimePercentage"
  | "lateOrders"
  | "totalErrors"
  | "outputQuantity";

interface MetricDef {
  key: MetricKey;
  label: string;
  icon: LucideIcon;
  isCurrency?: boolean;
  isPercent?: boolean;
  decimals?: number;
  rollingMode: "sum" | "average";
  color: string;
  headlineClass?: string;
}

const METRICS: MetricDef[] = [
  { key: "activeCustomers", label: "Active Customers", icon: Users, rollingMode: "average", color: "hsl(221, 83%, 53%)" },
  { key: "avgJobQuantity", label: "Average Job Quantity", icon: Package, decimals: 1, rollingMode: "average", color: "hsl(262, 83%, 58%)" },
  { key: "jobValue", label: "Job Value", icon: PoundSterling, isCurrency: true, rollingMode: "sum", color: "hsl(142, 71%, 45%)" },
  { key: "avgJobValue", label: "Average Job Value", icon: PoundSterling, isCurrency: true, rollingMode: "average", color: "hsl(158, 64%, 42%)" },
  { key: "onTimePercentage", label: "On-Time Delivery", icon: Target, isPercent: true, rollingMode: "average", color: "hsl(142, 71%, 45%)", headlineClass: "text-green-600 dark:text-green-400" },
  { key: "lateOrders", label: "Late Orders", icon: Clock, rollingMode: "sum", color: "hsl(0, 72%, 51%)", headlineClass: "text-red-600 dark:text-red-400" },
  { key: "totalErrors", label: "Total Errors", icon: AlertTriangle, rollingMode: "sum", color: "hsl(38, 92%, 50%)", headlineClass: "text-amber-600 dark:text-amber-400" },
  { key: "outputQuantity", label: "Output Quantity", icon: Activity, rollingMode: "sum", color: "hsl(199, 89%, 48%)" },
];

function formatValue(def: MetricDef, value: number): string {
  if (def.isCurrency) return `£${Math.round(value).toLocaleString()}`;
  if (def.isPercent) return `${Math.round(value)}%`;
  if (def.decimals) return value.toLocaleString(undefined, { maximumFractionDigits: def.decimals });
  return Math.round(value).toLocaleString();
}

function MetricCard({ def, data, weekLabel, onClick }: { def: MetricDef; data: KeyMetricsData; weekLabel: string; onClick?: () => void }) {
  const weeks = data.weekly;
  const current = weeks[weeks.length - 1];
  const headline = current ? current[def.key] : 0;

  const rollingValue = def.rollingMode === "sum"
    ? (data.rolling as any)[def.key]
    : def.key === "activeCustomers"
      ? data.rolling.activeCustomers
      : (data.rolling as any)[def.key];

  const rollingLabel = def.rollingMode === "sum"
    ? `${data.rolling.weeks}-week total`
    : def.key === "activeCustomers"
      ? `${data.rolling.weeks}-week unique`
      : `${data.rolling.weeks}-week average`;

  const chartData = weeks.map(w => ({
    week: format(parseISO(w.weekStart), "d MMM"),
    value: def.isCurrency || def.decimals ? Math.round(w[def.key] * 100) / 100 : w[def.key],
  }));

  const Icon = def.icon;
  const hideValue = def.isCurrency && !data.showPrices;

  return (
    <Card
      data-testid={`card-metric-${def.key}`}
      className={onClick ? "cursor-pointer hover-elevate" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{def.label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {hideValue ? (
          <div className="text-2xl font-bold text-muted-foreground" data-testid={`text-metric-${def.key}`}>—</div>
        ) : (
          <div className={`text-2xl font-bold ${def.headlineClass ?? ""}`} data-testid={`text-metric-${def.key}`}>
            {def.isCurrency ? <DemoAmount value={formatValue(def, headline)} /> : formatValue(def, headline)}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {weekLabel}
          {!hideValue && (
            <>
              {" · "}
              <span data-testid={`text-rolling-${def.key}`}>
                {def.isCurrency ? <DemoAmount value={formatValue(def, rollingValue)} /> : formatValue(def, rollingValue)}
              </span>{" "}
              {rollingLabel}
            </>
          )}
        </p>
        {!hideValue && (
          <div className="h-16 mt-3 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="week" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v: any) => [formatValue(def, Number(v)), def.label]}
                  labelFormatter={(l) => `Week of ${l}`}
                  contentStyle={{ fontSize: "12px", borderRadius: "6px" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={def.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryJobsDialog({
  open,
  onOpenChange,
  jobs,
  filter,
  weekLabel,
  showPrices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: DeliveryJob[];
  filter: "onTime" | "late";
  weekLabel: string;
  showPrices: boolean;
}) {
  const filtered = jobs.filter(j => (filter === "onTime" ? j.onTime === true : j.onTime === false));
  const title = filter === "onTime" ? "On-Time Jobs" : "Late Jobs";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {title} · Wk {weekLabel}
          </DialogTitle>
        </DialogHeader>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4" data-testid="text-no-delivery-jobs">
            No {filter === "onTime" ? "on-time" : "late"} jobs completed this week.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Completed</TableHead>
                {showPrices && <TableHead className="text-right">Value</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(job => (
                <TableRow key={job.jobId} data-testid={`row-delivery-job-${job.jobId}`}>
                  <TableCell className="font-medium">
                    {job.jobNumber != null ? `#${job.jobNumber} · ` : ""}{job.jobName}
                  </TableCell>
                  <TableCell><DemoText>{job.customerName}</DemoText></TableCell>
                  <TableCell>
                    {job.requiredDispatchDate ? format(parseISO(job.requiredDispatchDate), "d MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell>{format(parseISO(job.completedDate), "d MMM yyyy")}</TableCell>
                  {showPrices && (
                    <TableCell className="text-right">
                      <DemoAmount value={`£${Math.round(job.invoiceTotal).toLocaleString()}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    {job.onTime ? (
                      <Badge variant="outline" className="text-green-600 dark:text-green-400">On time</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 dark:text-red-400">Late</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function KeyMetricsTab() {
  // 0 = last complete week (Mon-Sun); each step back adds 1
  const [weekOffset, setWeekOffset] = useState(0);
  const [jobsDialog, setJobsDialog] = useState<"onTime" | "late" | null>(null);
  const endDate = format(subWeeks(new Date(), 1 + weekOffset), "yyyy-MM-dd");

  const { data, isLoading, isError } = useQuery<KeyMetricsData>({
    queryKey: ["/api/reports/key-metrics", { endDate }],
    queryFn: async () => {
      const res = await fetch(`/api/reports/key-metrics?endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load key metrics");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map(m => (
          <Card key={m.key}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load key metrics. Please refresh the page.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const firstWeek = data.weekly[0];
  const lastWeek = data.weekly[data.weekly.length - 1];
  const weekLabel = lastWeek
    ? `${format(parseISO(lastWeek.weekStart), "d MMM")} – ${format(parseISO(lastWeek.weekEnd), "d MMM")}`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Key Metrics</h2>
        {firstWeek && lastWeek && (
          <span className="text-sm text-muted-foreground" data-testid="text-key-metrics-range">
            headline is the week shown, trend covers {format(parseISO(firstWeek.weekStart), "d MMM yyyy")} – {format(parseISO(lastWeek.weekEnd), "d MMM yyyy")} · completed weeks only
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setWeekOffset(o => o + 1)}
            data-testid="button-week-prev"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[130px] text-center" data-testid="text-selected-week">
            {lastWeek ? `Week ${weekLabel}` : ""}
          </span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
            disabled={weekOffset === 0}
            data-testid="button-week-next"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map(def => (
          <MetricCard
            key={def.key}
            def={def}
            data={data}
            weekLabel={`Wk ${weekLabel}`}
            onClick={
              def.key === "onTimePercentage"
                ? () => setJobsDialog("onTime")
                : def.key === "lateOrders"
                  ? () => setJobsDialog("late")
                  : undefined
            }
          />
        ))}
      </div>
      <DeliveryJobsDialog
        open={jobsDialog !== null}
        onOpenChange={(open) => !open && setJobsDialog(null)}
        jobs={data.deliveryJobs}
        filter={jobsDialog ?? "late"}
        weekLabel={weekLabel}
        showPrices={data.showPrices}
      />
    </div>
  );
}

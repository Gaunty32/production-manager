import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoAmount } from "@/components/DemoText";
import { format, parseISO } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Users, Package, PoundSterling, Target, Clock, AlertTriangle, Activity, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KeyMetricsWeek {
  weekStart: string;
  weekEnd: string;
  activeCustomers: number;
  invoicedJobs: number;
  jobValue: number;
  avgJobValue: number;
  avgJobQuantity: number;
  onTimeCount: number;
  lateOrders: number;
  onTimePercentage: number;
  totalErrors: number;
  outputQuantity: number;
}

interface KeyMetricsData {
  weekly: KeyMetricsWeek[];
  rolling: Omit<KeyMetricsWeek, "weekStart" | "weekEnd"> & { weeks: number };
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

function MetricCard({ def, data }: { def: MetricDef; data: KeyMetricsData }) {
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
    <Card data-testid={`card-metric-${def.key}`}>
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
          This week
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

export function KeyMetricsTab() {
  const { data, isLoading, isError } = useQuery<KeyMetricsData>({
    queryKey: ["/api/reports/key-metrics"],
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Key Metrics</h2>
        {firstWeek && lastWeek && (
          <span className="text-sm text-muted-foreground" data-testid="text-key-metrics-range">
            {format(parseISO(firstWeek.weekStart), "d MMM yyyy")} – {format(parseISO(lastWeek.weekEnd), "d MMM yyyy")} · headline is the current week, trend shows the last {data.rolling.weeks} weeks
          </span>
        )}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map(def => (
          <MetricCard key={def.key} def={def} data={data} />
        ))}
      </div>
    </div>
  );
}

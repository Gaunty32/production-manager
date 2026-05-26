import { useState, useMemo } from "react";
import { DemoText } from "@/components/DemoText";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemoAmount } from "@/components/DemoText";
import { Calendar } from "@/components/ui/calendar";
import { AlertTriangle, Clock, TrendingUp, Users, Target, Activity, CheckCircle2, CalendarIcon, LineChart as LineChartIcon, Building2, Trophy, AlertCircle, RefreshCw, Gauge } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DatePreset = "this-week" | "last-week" | "last-4-weeks" | "last-12-weeks" | "custom";

interface DateRange {
  from: Date;
  to: Date;
}

interface StaffPerformanceData {
  staffMetrics: Array<{
    staffId: string;
    staffName: string;
    onTimeCount: number;
    lateCount: number;
    totalCompleted: number;
    onTimePercentage: number;
  }>;
  teamTotals: {
    onTimeCount: number;
    lateCount: number;
    totalCompleted: number;
    onTimePercentage: number;
  };
}

interface ErrorsReportData {
  staffErrors: Array<{
    staffId: string | null;
    staffName: string;
    errorCount: number;
    resolvedCount: number;
    unresolvedCount: number;
  }>;
  teamTotals: {
    totalErrors: number;
    resolvedCount: number;
    unresolvedCount: number;
  };
}

interface DailyProductionData {
  dailyData: Array<{
    date: string;
    staffId: string;
    staffName: string;
    totalStitches: number;
    totalItems: number;
    actualMinutes: number;
    estimatedMinutes: number;
  }>;
  staffSummary: Array<{
    staffId: string;
    staffName: string;
    avgDailyStitches: number;
    avgDailyItems: number;
    totalStitches: number;
    totalItems: number;
    totalActualMinutes: number;
    totalEstimatedMinutes: number;
    accuracyPercentage: number;
  }>;
}

interface WeeklyTrendData {
  weekStart: string;
  weekEnd: string;
  invoicedTotal: number;
  completedQuantity: number;
  newCustomers: number;
  totalActiveCustomers: number;
}

interface WeeklyProductionData {
  weeklyData: Array<{
    weekNumber: number;
    weekStart: string;
    weekEnd: string;
    staffId: string;
    staffName: string;
    avgDailyStitches: number;
    avgDailyItems: number;
    totalStitches: number;
    totalItems: number;
    totalActualMinutes: number;
    totalEstimatedMinutes: number;
    efficiencyScore: number;
    daysWorked: number;
  }>;
  staffTotals: Array<{
    staffId: string;
    staffName: string;
    avgDailyStitches: number;
    avgDailyItems: number;
    totalStitches: number;
    totalItems: number;
    totalActualMinutes: number;
    totalEstimatedMinutes: number;
    efficiencyScore: number;
  }>;
}

interface MachineStat {
  machineId: number;
  name: string;
  count: number;
  avgRatio: number;
  avgVarianceMinutes: number;
}

interface AccuracyReportData {
  overall: {
    count: number;
    avgRatio: number | null;
    avgAccuracyPercent: number | null;
  };
  byMachine: MachineStat[];
  items: Array<{
    lineItemId: string;
    jobName: string;
    machineName: string;
    quantity: number;
    stitchCount: number;
    estimatedMinutes: number;
    actualMinutes: number;
    ratio: number | null;
    completedAt: string | null;
  }>;
}

interface CustomerInsightsData {
  activeCustomerCount: number;
  topCustomers: Array<{
    customerId: number;
    customerName: string;
    totalQuantity: number;
    jobCount: number;
  }>;
  dormantCustomers: Array<{
    customerId: number;
    customerName: string;
    lastOrderDate: string | null;
    daysSinceLastOrder: number | null;
  }>;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

function getPresetDateRange(preset: DatePreset): DateRange {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  
  switch (preset) {
    case "this-week":
      return {
        from: weekStart,
        to: endOfWeek(today, { weekStartsOn: 1 })
      };
    case "last-week":
      return {
        from: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
        to: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })
      };
    case "last-4-weeks":
      return {
        from: startOfWeek(subWeeks(today, 3), { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 })
      };
    case "last-12-weeks":
    default:
      return {
        from: startOfWeek(subWeeks(today, 11), { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 })
      };
  }
}

export default function WeeklyReports() {
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>("last-12-weeks");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reports/sync-invoice-totals"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Sync complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/reports/weekly-performance'] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message || "Could not sync invoice totals from Xero.", variant: "destructive" });
    },
  });
  
  const dateRange = useMemo(() => {
    if (selectedPreset === "custom" && customDateRange) {
      return customDateRange;
    }
    return getPresetDateRange(selectedPreset);
  }, [selectedPreset, customDateRange]);

  const weeksCount = useMemo(() => {
    const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7) || 1;
  }, [dateRange]);

  const fetchWithParams = async (baseUrl: string) => {
    const url = `${baseUrl}?weeks=${weeksCount}&endDate=${dateRange.to.toISOString()}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${baseUrl}`);
    }
    return res.json();
  };

  const { data: performanceData, isLoading: isLoadingPerformance, error: performanceError } = useQuery<StaffPerformanceData>({
    queryKey: ['/api/reports/staff-performance', weeksCount, dateRange.to.toISOString()],
    queryFn: () => fetchWithParams('/api/reports/staff-performance'),
  });

  const { data: errorsData, isLoading: isLoadingErrors, error: errorsError } = useQuery<ErrorsReportData>({
    queryKey: ['/api/reports/errors', weeksCount, dateRange.to.toISOString()],
    queryFn: () => fetchWithParams('/api/reports/errors'),
  });

  const { data: productionData, isLoading: isLoadingProduction, error: productionError } = useQuery<DailyProductionData>({
    queryKey: ['/api/reports/daily-production', weeksCount, dateRange.to.toISOString()],
    queryFn: () => fetchWithParams('/api/reports/daily-production'),
  });

  const { data: weeklyProductionData, isLoading: isLoadingWeekly, error: weeklyError } = useQuery<WeeklyProductionData>({
    queryKey: ['/api/reports/weekly-production', weeksCount, dateRange.to.toISOString()],
    queryFn: () => fetchWithParams('/api/reports/weekly-production'),
  });

  const { data: weeklyTrendData, isLoading: isLoadingTrend, error: trendError } = useQuery<WeeklyTrendData[]>({
    queryKey: ['/api/reports/weekly-performance', weeksCount, dateRange.to.toISOString()],
    queryFn: () => fetchWithParams('/api/reports/weekly-performance'),
  });

  const { data: accuracyData, isLoading: isLoadingAccuracy } = useQuery<AccuracyReportData>({
    queryKey: ['/api/scheduling/accuracy', dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: dateRange.from.toISOString(),
        toDate: dateRange.to.toISOString(),
      });
      const res = await fetch(`/api/scheduling/accuracy?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accuracy data");
      return res.json();
    },
  });

  const { data: allCustomersList } = useQuery<Array<{ id: string; name: string; active: boolean }>>({
    queryKey: ["/api/customers"],
  });

  const { data: customerSpendTrend, isLoading: isLoadingCustomerTrend, isError: isCustomerTrendError, refetch: refetchCustomerTrend } = useQuery<Array<{
    weekStart: string;
    weekEnd: string;
    invoicedTotal: number;
    completedQuantity: number;
  }>>({
    queryKey: ['/api/reports/customer-weekly-trend', selectedCustomerId, 12],
    queryFn: async () => {
      const res = await fetch(`/api/reports/customer-weekly-trend?customerId=${selectedCustomerId}&weeks=12`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load customer spend');
      return res.json();
    },
    enabled: !!selectedCustomerId,
  });

  const customerSpendChartData = useMemo(() => {
    if (!customerSpendTrend) return [];
    return customerSpendTrend.map(w => ({
      week: format(new Date(w.weekStart), "MMM d"),
      spend: w.invoicedTotal,
      items: w.completedQuantity,
    }));
  }, [customerSpendTrend]);

  const customerSpendTotal = useMemo(
    () => customerSpendTrend?.reduce((s, w) => s + w.invoicedTotal, 0) ?? 0,
    [customerSpendTrend]
  );

  const { data: customerInsights, isLoading: isLoadingCustomers, error: customersError } = useQuery<CustomerInsightsData>({
    queryKey: ['/api/reports/customer-insights', dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const url = `/api/reports/customer-insights?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customer insights");
      return res.json();
    },
  });

  const isLoading = isLoadingPerformance || isLoadingErrors || isLoadingProduction || isLoadingWeekly || isLoadingTrend;
  const hasError = performanceError || errorsError || productionError || weeklyError || trendError;

  const chartData = useMemo(() => {
    if (!weeklyTrendData) return [];
    return weeklyTrendData.map(week => ({
      week: format(new Date(week.weekStart), "MMM d"),
      output: week.completedQuantity,
      invoiceValue: week.invoicedTotal,
      activeCustomers: week.totalActiveCustomers,
    }));
  }, [weeklyTrendData]);

  const formatNumber = (value: number) => value.toLocaleString();
  
  const handlePresetChange = (preset: DatePreset) => {
    setSelectedPreset(preset);
    if (preset !== "custom") {
      setCustomDateRange(null);
    }
  };

  const handleCustomDateChange = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setCustomDateRange({ from: range.from, to: range.to });
      setSelectedPreset("custom");
    } else if (range?.from) {
      setCustomDateRange({ from: range.from, to: range.from });
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Weekly Performance Report</h1>
          <p className="text-muted-foreground text-sm">
            {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedPreset === "this-week" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("this-week")}
            data-testid="button-this-week"
          >
            This Week
          </Button>
          <Button
            variant={selectedPreset === "last-week" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("last-week")}
            data-testid="button-last-week"
          >
            Last Week
          </Button>
          <Button
            variant={selectedPreset === "last-4-weeks" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("last-4-weeks")}
            data-testid="button-last-4-weeks"
          >
            Last 4 Weeks
          </Button>
          <Button
            variant={selectedPreset === "last-12-weeks" ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetChange("last-12-weeks")}
            data-testid="button-last-12-weeks"
          >
            Last 12 Weeks
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={selectedPreset === "custom" ? "default" : "outline"}
                size="sm"
                data-testid="button-custom-date"
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                Custom
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customDateRange ? { from: customDateRange.from, to: customDateRange.to } : undefined}
                onSelect={handleCustomDateChange}
                numberOfMonths={2}
                data-testid="calendar-date-picker"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {hasError && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Failed to load report data. Please refresh the page.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Delivery</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingPerformance ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-ontime-percentage">
                  {performanceData?.teamTotals?.onTimePercentage ?? 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {performanceData?.teamTotals?.onTimeCount ?? 0} of {performanceData?.teamTotals?.totalCompleted ?? 0} orders
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Orders</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingPerformance ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-late-count">
                  {performanceData?.teamTotals?.lateCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Orders delivered late</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingErrors ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-total-errors">
                  {errorsData?.teamTotals?.totalErrors ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {errorsData?.teamTotals?.unresolvedCount ?? 0} unresolved
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Output</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingProduction ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-items">
                  {formatNumber(productionData?.staffSummary?.reduce((sum, s) => sum + s.totalItems, 0) ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">Items completed</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList data-testid="tabs-report-sections">
          <TabsTrigger value="performance" data-testid="tab-performance">
            <Users className="h-4 w-4 mr-2" />
            Staff Performance
          </TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Error Tracking
          </TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-production">
            <TrendingUp className="h-4 w-4 mr-2" />
            Daily Production
          </TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">
            <LineChartIcon className="h-4 w-4 mr-2" />
            Contract Embroidery
          </TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-customers">
            <Building2 className="h-4 w-4 mr-2" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="accuracy" data-testid="tab-accuracy">
            <Gauge className="h-4 w-4 mr-2" />
            Accuracy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Individual Staff Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPerformance ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">On Time</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[150px]">Performance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performanceData?.staffMetrics?.length ? (
                      performanceData.staffMetrics.map((staff, index) => (
                        <TableRow key={staff.staffId} data-testid={`row-staff-performance-${index}`}>
                          <TableCell className="font-medium">{staff.staffName}</TableCell>
                          <TableCell className="text-right text-green-600 dark:text-green-400">
                            {staff.onTimeCount}
                          </TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">
                            {staff.lateCount}
                          </TableCell>
                          <TableCell className="text-right">{staff.totalCompleted}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={staff.onTimePercentage} className="h-2" />
                              <span className="text-xs w-10">{staff.onTimePercentage}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No performance data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{errorsData?.teamTotals?.totalErrors ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {errorsData?.teamTotals?.resolvedCount ?? 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {errorsData?.teamTotals?.unresolvedCount ?? 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Errors by Staff Member</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingErrors ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Unresolved</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorsData?.staffErrors?.length ? (
                      errorsData.staffErrors.map((staff, index) => (
                        <TableRow key={staff.staffId || 'unassigned'} data-testid={`row-staff-errors-${index}`}>
                          <TableCell className="font-medium">{staff.staffName}</TableCell>
                          <TableCell className="text-right">{staff.errorCount}</TableCell>
                          <TableCell className="text-right text-green-600 dark:text-green-400">
                            {staff.resolvedCount}
                          </TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">
                            {staff.unresolvedCount}
                          </TableCell>
                          <TableCell>
                            {staff.unresolvedCount === 0 ? (
                              <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                All Clear
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {staff.unresolvedCount} Pending
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          No errors recorded
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          {/* Staff Totals Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staff Production Summary (All Weeks)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingWeekly ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">Avg Daily Stitches</TableHead>
                      <TableHead className="text-right">Avg Daily Items</TableHead>
                      <TableHead className="text-right">Total Stitches</TableHead>
                      <TableHead className="text-right">Total Items</TableHead>
                      <TableHead className="text-right">Actual Time</TableHead>
                      <TableHead className="text-right">Est. Time</TableHead>
                      <TableHead className="text-right">Efficiency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyProductionData?.staffTotals?.length ? (
                      weeklyProductionData.staffTotals.map((staff, index) => (
                        <TableRow key={staff.staffId} data-testid={`row-staff-total-${index}`}>
                          <TableCell className="font-medium">{staff.staffName}</TableCell>
                          <TableCell className="text-right">{formatNumber(staff.avgDailyStitches)}</TableCell>
                          <TableCell className="text-right">{formatNumber(staff.avgDailyItems)}</TableCell>
                          <TableCell className="text-right">{formatNumber(staff.totalStitches)}</TableCell>
                          <TableCell className="text-right">{formatNumber(staff.totalItems)}</TableCell>
                          <TableCell className="text-right">{formatMinutes(staff.totalActualMinutes)}</TableCell>
                          <TableCell className="text-right">{formatMinutes(staff.totalEstimatedMinutes)}</TableCell>
                          <TableCell className="text-right">
                            <span className={
                              staff.efficiencyScore === 0 ? 'text-muted-foreground' :
                              staff.efficiencyScore >= 0.9 && staff.efficiencyScore <= 1.2 ? 'text-green-600 dark:text-green-400 font-semibold' :
                              staff.efficiencyScore > 2 ? 'text-red-600 dark:text-red-400 font-semibold' :
                              'text-amber-600 dark:text-amber-400 font-semibold'
                            }>
                              {staff.efficiencyScore > 0 ? staff.efficiencyScore.toFixed(2) : 'N/A'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No production data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Weekly Breakdown by Staff */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Production Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingWeekly ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>Staff Member</TableHead>
                        <TableHead className="text-right">Avg Daily Stitches</TableHead>
                        <TableHead className="text-right">Avg Daily Items</TableHead>
                        <TableHead className="text-right">Total Stitches</TableHead>
                        <TableHead className="text-right">Total Items</TableHead>
                        <TableHead className="text-right">Actual Time</TableHead>
                        <TableHead className="text-right">Est. Time</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weeklyProductionData?.weeklyData?.length ? (
                        weeklyProductionData.weeklyData.map((row, index) => (
                          <TableRow key={`${row.weekNumber}-${row.staffId}`} data-testid={`row-weekly-production-${index}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              Week {row.weekNumber}
                              <span className="text-xs text-muted-foreground block">
                                {new Date(row.weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                              </span>
                            </TableCell>
                            <TableCell>{row.staffName}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.avgDailyStitches)}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.avgDailyItems)}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.totalStitches)}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.totalItems)}</TableCell>
                            <TableCell className="text-right">{formatMinutes(row.totalActualMinutes)}</TableCell>
                            <TableCell className="text-right">{formatMinutes(row.totalEstimatedMinutes)}</TableCell>
                            <TableCell className="text-right">
                              <span className={
                                row.efficiencyScore === 0 ? 'text-muted-foreground' :
                                row.efficiencyScore >= 0.9 && row.efficiencyScore <= 1.2 ? 'text-green-600 dark:text-green-400 font-semibold' :
                                row.efficiencyScore > 2 ? 'text-red-600 dark:text-red-400 font-semibold' :
                                'text-amber-600 dark:text-amber-400 font-semibold'
                              }>
                                {row.efficiencyScore > 0 ? row.efficiencyScore.toFixed(2) : 'N/A'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            No weekly production data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Efficiency Score Guide:</strong> Actual Time / Estimated Time ratio.{" "}
              <span className="text-green-600 dark:text-green-400 font-semibold">0.9 - 1.2</span> = On target (excellent),{" "}
              <span className="text-amber-600 dark:text-amber-400 font-semibold">1.2 - 2.0</span> = Slower than expected,{" "}
              <span className="text-red-600 dark:text-red-400 font-semibold">&gt;2.0</span> = Needs attention (took 2x+ longer)
            </p>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Output</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="text-total-output">
                  {formatNumber(weeklyTrendData?.reduce((sum, w) => sum + w.completedQuantity, 0) ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">Items completed in period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Invoice Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-invoice-value">
                  £{formatNumber(Math.round(weeklyTrendData?.reduce((sum, w) => sum + w.invoicedTotal, 0) ?? 0))}
                </div>
                <p className="text-xs text-muted-foreground">Invoiced in period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Average Cost Per Item</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const totalOutput = weeklyTrendData?.reduce((sum, w) => sum + w.completedQuantity, 0) ?? 0;
                  const totalValue = weeklyTrendData?.reduce((sum, w) => sum + w.invoicedTotal, 0) ?? 0;
                  const avgCost = totalOutput > 0 ? totalValue / totalOutput : 0;
                  return (
                    <>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-avg-cost">
                        £{avgCost.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground">Invoice value / output</p>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Contract Embroidery Trend</CardTitle>
                <p className="text-sm text-muted-foreground">Weekly output and invoice value over time</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-xero"
                title="Pull invoice totals from Xero for historical jobs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? "Syncing…" : "Sync from Xero"}
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingTrend ? (
                <Skeleton className="h-[350px] w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                      label={{ value: 'Items', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                      tickFormatter={(value) => `£${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                      label={{ value: 'Invoice Value (£)', angle: 90, position: 'insideRight', style: { fontSize: 12 } }}
                    />
                    <YAxis
                      yAxisId="customers"
                      orientation="right"
                      hide
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'Invoice Value (£)') return [`£${formatNumber(value)}`, name];
                        return [formatNumber(value), name];
                      }}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Legend />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="output" 
                      name="Output (Items)"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="invoiceValue" 
                      name="Invoice Value (£)"
                      stroke="hsl(142.1, 76.2%, 36.3%)" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'hsl(142.1, 76.2%, 36.3%)' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      yAxisId="customers"
                      type="monotone"
                      dataKey="activeCustomers"
                      name="Customers on Books"
                      stroke="hsl(221.2, 83.2%, 53.3%)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3, fill: 'hsl(221.2, 83.2%, 53.3%)' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  No trend data available for the selected period
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          {isLoadingCustomers ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : customersError ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Failed to load customer insights.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Per-customer rolling 12-week spend */}
              <Card data-testid="card-customer-spend-trend">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Customer Spend — Rolling 12 Weeks
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pick a customer to see their weekly invoice value over the last 12 weeks.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedCustomerId && customerSpendTrend && customerSpendTrend.length > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">12-week total</p>
                          <p className="text-lg font-semibold" data-testid="text-customer-spend-total">
                            <DemoAmount value={`£${formatNumber(Math.round(customerSpendTotal))}`} />
                          </p>
                        </div>
                      )}
                      <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                        <SelectTrigger className="w-[240px]" data-testid="select-customer-spend">
                          <SelectValue placeholder="Choose a customer…" />
                        </SelectTrigger>
                        <SelectContent>
                          {[...(allCustomersList ?? [])]
                            .filter(c => c.active)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(c => (
                              <SelectItem key={c.id} value={c.id} data-testid={`option-customer-${c.id}`}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedCustomerId ? (
                    <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
                      Pick a customer above to see their rolling 12-week spend.
                    </div>
                  ) : isLoadingCustomerTrend ? (
                    <Skeleton className="h-[280px] w-full" />
                  ) : isCustomerTrendError ? (
                    <div className="flex flex-col items-center justify-center h-[280px] gap-3 text-sm text-muted-foreground">
                      <span>Couldn't load this customer's spend.</span>
                      <Button variant="outline" size="sm" onClick={() => refetchCustomerTrend()} data-testid="button-retry-customer-spend">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                      </Button>
                    </div>
                  ) : customerSpendChartData.every(d => d.spend === 0 && d.items === 0) ? (
                    <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
                      No invoiced activity for this customer in the last 12 weeks.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={customerSpendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="week" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                          tickFormatter={(value) => `£${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                          }}
                          formatter={(value: number) => [`£${formatNumber(Math.round(value))}`, 'Invoice Value']}
                          labelFormatter={(label) => `Week of ${label}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="spend"
                          name="Invoice Value (£)"
                          stroke="hsl(142.1, 76.2%, 36.3%)"
                          strokeWidth={3}
                          dot={{ r: 4, fill: 'hsl(142.1, 76.2%, 36.3%)' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* KPI cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card data-testid="card-active-customers">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-md">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ordering Customers</p>
                        <p className="text-3xl font-bold" data-testid="text-active-customer-count">
                          {customerInsights?.activeCustomerCount ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Placed orders in selected period
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-total-active-customers">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-md">
                        <Users className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Active Customers</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-total-active-count">
                          {weeklyTrendData?.length
                            ? weeklyTrendData[weeklyTrendData.length - 1].totalActiveCustomers
                            : 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Active on books at end of period
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-new-customers">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-500/10 rounded-md">
                        <TrendingUp className="h-6 w-6 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">New Customers</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-new-customers">
                          {weeklyTrendData?.reduce((sum, w) => sum + w.newCustomers, 0) ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Added in selected period
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top 5 by volume */}
              <Card data-testid="card-top-customers">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    Top 5 Customers by Volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {customerInsights?.topCustomers?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Jobs</TableHead>
                          <TableHead className="text-right">Total Items</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerInsights.topCustomers.map((c, idx) => (
                          <TableRow key={c.customerId} data-testid={`row-top-customer-${c.customerId}`}>
                            <TableCell>
                              <span className={`font-bold ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                                {idx + 1}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium"><DemoText>{c.customerName}</DemoText></TableCell>
                            <TableCell className="text-right">{c.jobCount}</TableCell>
                            <TableCell className="text-right font-semibold">{c.totalQuantity.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-6">No order data for the selected period.</p>
                  )}
                </CardContent>
              </Card>

              {/* Dormant customers */}
              <Card data-testid="card-dormant-customers">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    No Orders in Last 4 Weeks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {customerInsights?.dormantCustomers?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Last Order</TableHead>
                          <TableHead className="text-right">Days Ago</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerInsights.dormantCustomers.map((c) => (
                          <TableRow key={c.customerId} data-testid={`row-dormant-customer-${c.customerId}`}>
                            <TableCell className="font-medium"><DemoText>{c.customerName}</DemoText></TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {c.lastOrderDate ? format(new Date(c.lastOrderDate), "dd MMM yyyy") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {c.daysSinceLastOrder !== null ? (
                                <Badge variant={c.daysSinceLastOrder > 60 ? "destructive" : "secondary"} data-testid={`badge-days-${c.customerId}`}>
                                  {c.daysSinceLastOrder}d
                                </Badge>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-6">All customers have placed orders in the last 4 weeks.</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        {/* Accuracy Tab */}
        <TabsContent value="accuracy" className="space-y-6">
          {isLoadingAccuracy ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !accuracyData || accuracyData.overall.count === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Gauge className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">No accuracy data for this period</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Embroidery jobs completed between {format(dateRange.from, "d MMM yyyy")} and {format(dateRange.to, "d MMM yyyy")} with actual production times will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Overview KPIs */}
              <div className="grid gap-4 grid-cols-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Overall accuracy</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      accuracyData.overall.avgRatio === null ? "text-muted-foreground"
                      : accuracyData.overall.avgRatio <= 1.05 ? "text-green-600 dark:text-green-400"
                      : accuracyData.overall.avgRatio <= 1.20 ? "text-amber-600 dark:text-amber-400"
                      : "text-destructive"
                    }`}>
                      {accuracyData.overall.avgAccuracyPercent !== null ? `${accuracyData.overall.avgAccuracyPercent}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {accuracyData.overall.avgRatio === null ? "—"
                       : accuracyData.overall.avgRatio <= 1.05 ? "Accurate"
                       : accuracyData.overall.avgRatio <= 1.20 ? "Slightly over"
                       : "Consistently over"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Jobs measured</p>
                    <p className="text-2xl font-bold mt-1">{accuracyData.overall.count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">completed with actuals</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">Avg overrun</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      accuracyData.overall.avgRatio !== null && accuracyData.overall.avgRatio > 1
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-green-600 dark:text-green-400"
                    }`}>
                      {accuracyData.overall.avgRatio !== null
                        ? accuracyData.overall.avgRatio >= 1
                          ? `+${Math.round((accuracyData.overall.avgRatio - 1) * 100)}%`
                          : `${Math.round((accuracyData.overall.avgRatio - 1) * 100)}%`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">actual vs estimated</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-machine */}
              {accuracyData.byMachine.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Per-Machine Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead className="text-right">Jobs</TableHead>
                          <TableHead className="text-right">Accuracy</TableHead>
                          <TableHead className="text-right">Avg Overrun</TableHead>
                          <TableHead className="w-[140px]">Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accuracyData.byMachine.map(m => {
                          const pct = Math.round(m.avgRatio * 100);
                          const overPct = Math.round((m.avgRatio - 1) * 100);
                          const color =
                            m.avgRatio <= 1.05 ? "text-green-600 dark:text-green-400"
                            : m.avgRatio <= 1.20 ? "text-amber-600 dark:text-amber-400"
                            : "text-destructive";
                          return (
                            <TableRow key={m.machineId} data-testid={`row-accuracy-machine-${m.machineId}`}>
                              <TableCell className="font-medium">{m.name}</TableCell>
                              <TableCell className="text-right">{m.count}</TableCell>
                              <TableCell className={`text-right font-semibold ${color}`}>{pct}%</TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                {overPct >= 0 ? `+${overPct}%` : `${overPct}%`} ({m.avgVarianceMinutes >= 0 ? `+${m.avgVarianceMinutes}m` : `${m.avgVarianceMinutes}m`})
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={Math.min(100, (1 / m.avgRatio) * 100)} className="h-2" />
                                  <span className="text-xs w-12">
                                    {m.avgRatio <= 1.05 ? "Good" : m.avgRatio <= 1.20 ? "Slow" : "Review"}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Recent jobs table */}
              {accuracyData.items.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Completed Jobs in Period</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
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
                          {accuracyData.items.map(item => {
                            const ratio = item.ratio;
                            const pct = ratio !== null ? Math.round(ratio * 100) : null;
                            const badgeColor = ratio === null ? ""
                              : ratio <= 1.05 ? "text-green-600 dark:text-green-400"
                              : ratio <= 1.20 ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive";
                            return (
                              <tr key={item.lineItemId} className="border-b last:border-0">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium truncate max-w-[180px]">{item.jobName}</div>
                                  <div className="text-xs text-muted-foreground">{item.quantity} × {item.stitchCount?.toLocaleString()} sts</div>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.machineName}</td>
                                <td className="px-4 py-2.5 text-right text-xs">
                                  {item.estimatedMinutes >= 60 ? `${Math.floor(item.estimatedMinutes / 60)}h ${item.estimatedMinutes % 60}m` : `${item.estimatedMinutes}m`}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs">
                                  {item.actualMinutes >= 60 ? `${Math.floor(item.actualMinutes / 60)}h ${item.actualMinutes % 60}m` : `${item.actualMinutes}m`}
                                </td>
                                <td className={`px-4 py-2.5 text-right text-xs font-semibold ${badgeColor}`}>
                                  {pct !== null ? `${pct}%` : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden md:table-cell">
                                  {item.completedAt ? format(new Date(item.completedAt), "d MMM yy") : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Accuracy Guide:</strong> Actual time / estimated time. <span className="text-green-600 dark:text-green-400 font-semibold">≤105%</span> = accurate, <span className="text-amber-600 dark:text-amber-400 font-semibold">105–120%</span> = slightly over, <span className="text-destructive font-semibold">&gt;120%</span> = consistently slow — consider adjusting stitches/minute in Machine Management.
                </p>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

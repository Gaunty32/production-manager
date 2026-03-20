import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertTriangle, Clock, TrendingUp, Users, Target, Activity, CheckCircle2, CalendarIcon, LineChart as LineChartIcon, Building2, Trophy, AlertCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>("last-12-weeks");
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);
  
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
            <CardHeader>
              <CardTitle className="text-base">Contract Embroidery Trend</CardTitle>
              <p className="text-sm text-muted-foreground">Weekly output and invoice value over time</p>
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
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'invoiceValue') return [`£${formatNumber(value)}`, 'Invoice Value'];
                        return [formatNumber(value), 'Output'];
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
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  No trend data available for the selected period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead className="text-right">Output (Items)</TableHead>
                    <TableHead className="text-right">Invoice Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyTrendData?.length ? (
                    weeklyTrendData.map((week, index) => (
                      <TableRow key={index} data-testid={`row-weekly-trend-${index}`}>
                        <TableCell className="font-medium">
                          {format(new Date(week.weekStart), "MMM d")} - {format(new Date(week.weekEnd), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(week.completedQuantity)}</TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          £{formatNumber(Math.round(week.invoicedTotal))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No weekly data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
              {/* KPI card */}
              <Card data-testid="card-active-customers">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-md">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Active Customers</p>
                      <p className="text-3xl font-bold" data-testid="text-active-customer-count">
                        {customerInsights?.activeCustomerCount ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Customers with jobs placed in the selected period
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                            <TableCell className="font-medium">{c.customerName}</TableCell>
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
                            <TableCell className="font-medium">{c.customerName}</TableCell>
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
      </Tabs>
    </div>
  );
}

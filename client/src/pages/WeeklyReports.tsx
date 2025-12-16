import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { formatTimeDisplay } from "@shared/machines";
import { CheckCircle2, XCircle, AlertTriangle, Clock, TrendingUp, Users, Target, Activity } from "lucide-react";

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

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(142.1 76.2% 36.3%)', 'hsl(47.9 95.8% 53.1%)', 'hsl(262.1 83.3% 57.8%)', 'hsl(12.6 83.7% 53.9%)'];

export default function WeeklyReports() {
  console.log('[WeeklyReports] Component rendering');
  
  const { data: performanceData, isLoading: isLoadingPerformance, error: performanceError } = useQuery<StaffPerformanceData>({
    queryKey: ['/api/reports/staff-performance'],
  });
  
  console.log('[WeeklyReports] Performance data:', { performanceData, isLoadingPerformance, error: performanceError });

  const { data: errorsData, isLoading: isLoadingErrors, error: errorsError } = useQuery<ErrorsReportData>({
    queryKey: ['/api/reports/errors'],
  });

  const { data: productionData, isLoading: isLoadingProduction, error: productionError } = useQuery<DailyProductionData>({
    queryKey: ['/api/reports/daily-production'],
  });

  const hasError = performanceError || errorsError || productionError;

  const formatNumber = (value: number) => value.toLocaleString();

  const formatDate = (dateStr: string) => {
    try {
      if (!dateStr) return '-';
      return format(parseISO(dateStr), 'dd MMM');
    } catch {
      return dateStr;
    }
  };

  const isLoading = isLoadingPerformance || isLoadingErrors || isLoadingProduction;

  // Prepare chart data for on-time vs late
  const performanceChartData = performanceData?.staffMetrics.map(staff => ({
    name: staff.staffName,
    onTime: staff.onTimeCount,
    late: staff.lateCount,
  })) || [];

  // Prepare pie chart data for team on-time percentage
  const teamPieData = performanceData ? [
    { name: 'On Time', value: performanceData.teamTotals.onTimeCount, color: 'hsl(142.1 76.2% 36.3%)' },
    { name: 'Late', value: performanceData.teamTotals.lateCount, color: 'hsl(0 84.2% 60.2%)' },
  ] : [];

  // Prepare daily stitches trend data (last 14 days aggregated)
  const dailyTrendData = productionData?.dailyData
    .reduce((acc: Record<string, { date: string; totalStitches: number; totalItems: number }>, item) => {
      const dateKey = item.date;
      if (!acc[dateKey]) {
        acc[dateKey] = { date: dateKey, totalStitches: 0, totalItems: 0 };
      }
      acc[dateKey].totalStitches += item.totalStitches;
      acc[dateKey].totalItems += item.totalItems;
      return acc;
    }, {});

  const trendChartData = dailyTrendData 
    ? Object.values(dailyTrendData)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14)
        .map(item => ({
          date: formatDate(item.date),
          stitches: Math.round(item.totalStitches / 1000), // Show in thousands
          items: item.totalItems,
        }))
    : [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4" data-testid="text-page-title">Weekly Performance Report</h1>
      <p className="text-muted-foreground text-sm mb-6">Last 12 weeks performance metrics</p>
      
      {/* Debug info */}
      <div className="mb-4 p-4 bg-muted rounded text-sm">
        <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
        <p>Has Error: {hasError ? 'Yes' : 'No'}</p>
        <p>Performance Data: {performanceData ? 'Loaded' : 'Not loaded'}</p>
        <p>Errors Data: {errorsData ? 'Loaded' : 'Not loaded'}</p>
        <p>Production Data: {productionData ? 'Loaded' : 'Not loaded'}</p>
      </div>

      {hasError && (
        <Card className="border-destructive mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Failed to load report data. Please refresh the page or try again later.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* On-Time Delivery */}
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
                    {performanceData?.teamTotals.onTimePercentage || 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {performanceData?.teamTotals.onTimeCount || 0} of {performanceData?.teamTotals.totalCompleted || 0} orders
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Late Orders */}
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
                    {performanceData?.teamTotals.lateCount || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Orders delivered late
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Total Errors */}
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
                    {errorsData?.teamTotals.totalErrors || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {errorsData?.teamTotals.unresolvedCount || 0} unresolved
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Team Output */}
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
                    {formatNumber(productionData?.staffSummary.reduce((sum, s) => sum + s.totalItems, 0) || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Items completed
                  </p>
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
          </TabsList>

          {/* Staff Performance Tab */}
          <TabsContent value="performance" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* On-Time vs Late Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">On-Time vs Late by Staff</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingPerformance ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : performanceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={performanceChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="onTime" fill="hsl(142.1 76.2% 36.3%)" name="On Time" stackId="a" />
                        <Bar dataKey="late" fill="hsl(0 84.2% 60.2%)" name="Late" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No performance data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team Summary Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Team Delivery Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingPerformance ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : teamPieData.length > 0 && (performanceData?.teamTotals?.totalCompleted ?? 0) > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={teamPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {teamPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No delivery data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Staff Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Individual Performance</CardTitle>
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
                      {performanceData?.staffMetrics.length ? (
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
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No staff performance data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Error Tracking Tab */}
          <TabsContent value="errors" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-testid="text-errors-total">
                    {errorsData?.teamTotals.totalErrors || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-errors-resolved">
                    {errorsData?.teamTotals.resolvedCount || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600 dark:text-red-400" data-testid="text-errors-unresolved">
                    {errorsData?.teamTotals.unresolvedCount || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Errors by Staff Member</CardTitle>
                <CardDescription>Errors assigned to each team member</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingErrors ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff Member</TableHead>
                        <TableHead className="text-right">Total Errors</TableHead>
                        <TableHead className="text-right">Resolved</TableHead>
                        <TableHead className="text-right">Unresolved</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errorsData?.staffErrors.length ? (
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
                            No errors recorded in the last 12 weeks
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Production Tab */}
          <TabsContent value="production" className="space-y-4">
            {/* Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Output Trend (Last 14 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingProduction ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : trendChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          name === 'stitches' ? `${value}k stitches` : `${value} items`,
                          name === 'stitches' ? 'Stitches' : 'Items'
                        ]}
                      />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="stitches" 
                        stroke="hsl(var(--primary))" 
                        name="Stitches (thousands)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="items" 
                        stroke="hsl(142.1 76.2% 36.3%)" 
                        name="Items"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No production data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Staff Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Staff Production Summary</CardTitle>
                <CardDescription>Daily averages and totals per staff member</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProduction ? (
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
                        <TableHead className="text-right">Estimated Time</TableHead>
                        <TableHead className="text-right">Accuracy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionData?.staffSummary.length ? (
                        productionData.staffSummary.map((staff, index) => (
                          <TableRow key={staff.staffId} data-testid={`row-staff-production-${index}`}>
                            <TableCell className="font-medium">{staff.staffName}</TableCell>
                            <TableCell className="text-right">{formatNumber(staff.avgDailyStitches)}</TableCell>
                            <TableCell className="text-right">{formatNumber(staff.avgDailyItems)}</TableCell>
                            <TableCell className="text-right">{formatNumber(staff.totalStitches)}</TableCell>
                            <TableCell className="text-right">{formatNumber(staff.totalItems)}</TableCell>
                            <TableCell className="text-right">{formatTimeDisplay(staff.totalActualMinutes)}</TableCell>
                            <TableCell className="text-right">{formatTimeDisplay(staff.totalEstimatedMinutes)}</TableCell>
                            <TableCell className="text-right">
                              <span className={
                                staff.accuracyPercentage === 0 ? 'text-muted-foreground' :
                                staff.accuracyPercentage >= 90 && staff.accuracyPercentage <= 110 ? 'text-green-600 dark:text-green-400' :
                                staff.accuracyPercentage < 80 || staff.accuracyPercentage > 120 ? 'text-red-600 dark:text-red-400' :
                                'text-amber-600 dark:text-amber-400'
                              }>
                                {staff.accuracyPercentage > 0 ? `${staff.accuracyPercentage}%` : 'N/A'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No production data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Accuracy Guide */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Accuracy Guide:</strong> 
                <span className="ml-2 text-green-600 dark:text-green-400">Green (90-110%)</span> = Excellent accuracy, 
                <span className="ml-2 text-amber-600 dark:text-amber-400">Yellow (80-90% or 110-120%)</span> = Acceptable variance, 
                <span className="ml-2 text-red-600 dark:text-red-400">Red (&lt;80% or &gt;120%)</span> = Needs review
              </p>
            </div>
          </TabsContent>
        </Tabs>
    </div>
  );
}

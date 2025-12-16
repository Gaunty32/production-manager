import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, TrendingUp, Users, Target, Activity, CheckCircle2 } from "lucide-react";

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

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

export default function WeeklyReports() {
  const { data: performanceData, isLoading: isLoadingPerformance, error: performanceError } = useQuery<StaffPerformanceData>({
    queryKey: ['/api/reports/staff-performance'],
  });

  const { data: errorsData, isLoading: isLoadingErrors, error: errorsError } = useQuery<ErrorsReportData>({
    queryKey: ['/api/reports/errors'],
  });

  const { data: productionData, isLoading: isLoadingProduction, error: productionError } = useQuery<DailyProductionData>({
    queryKey: ['/api/reports/daily-production'],
  });

  const { data: weeklyProductionData, isLoading: isLoadingWeekly, error: weeklyError } = useQuery<WeeklyProductionData>({
    queryKey: ['/api/reports/weekly-production'],
  });

  const isLoading = isLoadingPerformance || isLoadingErrors || isLoadingProduction || isLoadingWeekly;
  const hasError = performanceError || errorsError || productionError || weeklyError;

  const formatNumber = (value: number) => value.toLocaleString();

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Weekly Performance Report</h1>
        <p className="text-muted-foreground text-sm">Last 12 weeks performance metrics</p>
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
      </Tabs>
    </div>
  );
}

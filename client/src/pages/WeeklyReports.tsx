import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatTimeDisplay } from "@shared/machines";

interface WeeklyPerformanceData {
  weekStart: string;
  weekEnd: string;
  invoicedTotal: number;
  completedQuantity: number;
}

interface ProductionTimeAnalysis {
  staffName: string;
  machineName: string;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  completedItems: number;
  averageAccuracy: number | null;
}

export default function WeeklyReports() {
  const { data: weeklyData, isLoading, error, isError } = useQuery<WeeklyPerformanceData[]>({
    queryKey: ['/api/reports/weekly-performance'],
  });

  const { data: productionTimeData, isLoading: isLoadingTimeAnalysis } = useQuery<ProductionTimeAnalysis[]>({
    queryKey: ['/api/reports/production-time-analysis'],
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Weekly Performance Report</h1>
          <p className="text-muted-foreground">Last 12 weeks of invoiced value and completed production</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Invoiced Value</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <p className="text-xs text-muted-foreground mt-2">Last 12 weeks</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Completed Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <p className="text-xs text-muted-foreground mt-2">Last 12 weeks</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Weekly Breakdown</CardTitle>
            <CardDescription>Loading data...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Early return for error state
  if (isError) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Weekly Performance Report</h1>
          <p className="text-muted-foreground">Last 12 weeks of invoiced value and completed production</p>
        </div>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              {error instanceof Error && error.message.includes("permission") ? "Access Denied" : "Error Loading Data"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-error-message">
              {error instanceof Error ? error.message : "Failed to load weekly performance data. Please try again later."}
            </p>
            {error instanceof Error && error.message.includes("permission") && (
              <p className="text-xs text-muted-foreground mt-2">
                This report requires admin, manager, or super admin privileges to view pricing information.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate totals (safe now because we've handled null case above)
  const totals = weeklyData?.reduce(
    (acc, week) => ({
      invoicedTotal: acc.invoicedTotal + week.invoicedTotal,
      completedQuantity: acc.completedQuantity + week.completedQuantity,
    }),
    { invoicedTotal: 0, completedQuantity: 0 }
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Weekly Performance Report</h1>
        <p className="text-muted-foreground">Last 12 weeks of invoiced value and completed production</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced Value</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-invoiced">
                {formatCurrency(totals?.invoicedTotal || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Last 12 weeks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Completed Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-quantity">
                {(totals?.completedQuantity || 0).toLocaleString()} items
              </div>
            )}
            <p className="text-xs text-muted-foreground">Last 12 weeks</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Breakdown</CardTitle>
          <CardDescription>Invoiced value and completed quantities per week</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week Starting</TableHead>
                  <TableHead>Week Ending</TableHead>
                  <TableHead className="text-right">Invoiced Value</TableHead>
                  <TableHead className="text-right">Completed Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyData && weeklyData.length > 0 ? (
                  weeklyData.map((week, index) => (
                    <TableRow 
                      key={`${week.weekStart}-${index}`}
                      data-testid={`row-week-${index}`}
                    >
                      <TableCell data-testid={`text-week-start-${index}`}>
                        {formatDate(week.weekStart)}
                      </TableCell>
                      <TableCell data-testid={`text-week-end-${index}`}>
                        {formatDate(week.weekEnd)}
                      </TableCell>
                      <TableCell 
                        className="text-right font-medium" 
                        data-testid={`text-invoiced-${index}`}
                      >
                        {formatCurrency(week.invoicedTotal)}
                      </TableCell>
                      <TableCell 
                        className="text-right" 
                        data-testid={`text-quantity-${index}`}
                      >
                        {week.completedQuantity.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="text-no-data">
                      No data available for the selected period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Production Time Analysis</CardTitle>
          <CardDescription>Estimated vs Actual production times by staff and machine (last 12 weeks)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTimeAnalysis ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : productionTimeData && productionTimeData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={productionTimeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey={(item) => `${item.staffName} - ${item.machineName}`}
                    angle={-45}
                    textAnchor="end"
                    height={120}
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis 
                    label={{ value: 'Time (minutes)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border rounded p-3 shadow-lg">
                            <p className="font-semibold">{data.staffName}</p>
                            <p className="text-sm text-muted-foreground">{data.machineName}</p>
                            <p className="text-sm mt-2">
                              <span className="text-blue-600 dark:text-blue-400">Estimated: </span>
                              {formatTimeDisplay(data.totalEstimatedMinutes)}
                            </p>
                            <p className="text-sm">
                              <span className="text-green-600 dark:text-green-400">Actual: </span>
                              {formatTimeDisplay(data.totalActualMinutes)}
                            </p>
                            <p className="text-sm">Items: {data.completedItems}</p>
                            <p className="text-sm">
                              Accuracy: {data.averageAccuracy !== null ? `${data.averageAccuracy.toFixed(1)}%` : 'N/A'}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="totalEstimatedMinutes" 
                    fill="hsl(var(--primary))" 
                    name="Estimated Time (min)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="totalActualMinutes" 
                    fill="hsl(142.1 76.2% 36.3%)" 
                    name="Actual Time (min)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6">
                <h3 className="font-semibold mb-3">Detailed Breakdown</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Estimated</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productionTimeData.map((item, index) => (
                      <TableRow key={index} data-testid={`row-analysis-${index}`}>
                        <TableCell data-testid={`text-staff-${index}`}>{item.staffName}</TableCell>
                        <TableCell data-testid={`text-machine-${index}`}>{item.machineName}</TableCell>
                        <TableCell className="text-right" data-testid={`text-items-${index}`}>
                          {item.completedItems}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-estimated-${index}`}>
                          {formatTimeDisplay(item.totalEstimatedMinutes)}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-actual-${index}`}>
                          {formatTimeDisplay(item.totalActualMinutes)}
                        </TableCell>
                        <TableCell 
                          className={`text-right font-medium ${
                            item.averageAccuracy === null
                              ? 'text-muted-foreground'
                              : item.averageAccuracy > 90 && item.averageAccuracy < 110 
                              ? 'text-green-600 dark:text-green-400' 
                              : item.averageAccuracy < 80 || item.averageAccuracy > 120
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                          }`}
                          data-testid={`text-accuracy-${index}`}
                        >
                          {item.averageAccuracy !== null ? `${item.averageAccuracy.toFixed(1)}%` : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Accuracy Guide:</strong> 
                  <span className="ml-2 text-green-600 dark:text-green-400">Green (90-110%)</span> = Excellent accuracy, 
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400">Yellow (80-90% or 110-120%)</span> = Acceptable variance, 
                  <span className="ml-2 text-red-600 dark:text-red-400">Red (&lt;80% or &gt;120%)</span> = Needs review
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-analysis-data">
              <p>No production time data available for the selected period</p>
              <p className="text-sm mt-1">Complete jobs with tracked production times to see analysis here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

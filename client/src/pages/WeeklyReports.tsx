import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface WeeklyPerformanceData {
  weekStart: string;
  weekEnd: string;
  invoicedTotal: number;
  completedQuantity: number;
}

export default function WeeklyReports() {
  const { data: weeklyData, isLoading, error, isError } = useQuery<WeeklyPerformanceData[]>({
    queryKey: ['/api/reports/weekly-performance'],
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

  // Calculate totals
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

      {isError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-error-message">
              {error instanceof Error ? error.message : "Failed to load weekly performance data. Please try again later."}
            </p>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}

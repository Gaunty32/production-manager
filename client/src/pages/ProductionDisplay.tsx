import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Trophy, Calendar, TrendingUp, AlertTriangle } from "lucide-react";
import { getMachineName } from "@shared/machines";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface QueueLineItem {
  line_item_id: string;
  description: string | null;
  quantity: number;
  stitch_count: number;
  machine_id: number | null;
  staff_id: string | null;
  staff_name: string | null;
  start_time: number | null;
  end_time: number | null;
}

interface QueueData {
  schedule_date: string | null;
  job_id: string;
  job_number: number | null;
  customer_name: string;
  job_name: string;
  required_dispatch_date: string | null;
  line_item_id: string;
  description: string | null;
  quantity: number;
  stitch_count: number;
  machine_id: number | null;
  staff_id: string | null;
  staff_name: string | null;
  start_time: number | null;
  end_time: number | null;
  is_overdue: number;
}

interface LeaderData {
  staff_id: string;
  staff_name: string;
  yellow_stars: number;
  red_stars: number;
  total_stitches: number;
  total_hours: number;
  stitches_per_head_hour: number;
  machine_usage: Record<string, number>;
}

interface LeaderboardResponse {
  generatedAt: string;
  range: {
    start: string;
    end: string;
  };
  leaders: LeaderData[];
}

interface HistoryData {
  completion_date: string;
  staff_id: string;
  staff_name: string;
  total_stitches: number;
  total_hours: number;
  stitches_per_hour: number;
}

interface HistoryResponse {
  generatedAt: string;
  range: {
    start: string;
    end: string;
  };
  history: HistoryData[];
}

type ViewMode = 'queue' | 'leaderboard' | 'graph';

export default function ProductionDisplay() {
  const [currentView, setCurrentView] = useState<ViewMode>('queue');
  
  const { data: queueData = [], isLoading: queueLoading } = useQuery<QueueData[]>({
    queryKey: ["/api/production-display/queue"],
    refetchInterval: 150000, // Refresh every 2.5 minutes
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/production-display/leaderboard"],
    refetchInterval: 150000,
  });

  const { data: history, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/production-display/history"],
    refetchInterval: 150000,
  });

  // Prepare chart data from history (must be before loading check to follow Rules of Hooks)
  const chartData = useMemo(() => {
    if (!history || history.history.length === 0) return [];

    // Get unique dates and staff members
    const dates = Array.from(new Set(history.history.map(h => h.completion_date))).sort();
    const staffMembers = Array.from(new Set(history.history.map(h => h.staff_name)));

    // Transform data for recharts
    return dates.map(date => {
      const dataPoint: any = { date };
      history.history
        .filter(h => h.completion_date === date)
        .forEach(h => {
          dataPoint[h.staff_name] = h.stitches_per_hour;
        });
      return dataPoint;
    });
  }, [history]);

  // Detect overdue jobs
  const overdueJobs = useMemo(() => {
    return queueData.filter(item => item.is_overdue === 1);
  }, [queueData]);

  // Rotate between views every 12 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentView(prev => {
        if (prev === 'queue') return 'leaderboard';
        if (prev === 'leaderboard') return chartData.length > 0 ? 'graph' : 'queue';
        return 'queue';
      });
    }, 12000); // 12 seconds per view

    return () => clearInterval(interval);
  }, [chartData.length]);

  // Show loading state
  if (queueLoading || leaderboardLoading || historyLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-xl text-muted-foreground">Loading Production Display...</p>
        </div>
      </div>
    );
  }

  // Helper function to parse database date strings (format: "2025-11-10 00:00:00")
  const parseDbDate = (dateStr: string | null): Date | null => {
    if (!dateStr || dateStr.trim() === '') return null;
    // Convert space-separated DB format to ISO format
    const isoDate = dateStr.trim().replace(' ', 'T');
    const parsed = new Date(isoDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Group queue data by date, then by job
  const groupedByDate: Record<string, Record<string, QueueData[]>> = {};
  queueData.forEach((item) => {
    const dateKey = item.schedule_date || 'unscheduled';
    if (!groupedByDate[dateKey]) {
      groupedByDate[dateKey] = {};
    }
    if (!groupedByDate[dateKey][item.job_id]) {
      groupedByDate[dateKey][item.job_id] = [];
    }
    groupedByDate[dateKey][item.job_id].push(item);
  });

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    if (a === 'unscheduled') return 1;
    if (b === 'unscheduled') return -1;
    return a.localeCompare(b);
  });

  const getMachineBadgeColor = (machineId: number | null) => {
    if (machineId === null) return "bg-muted text-muted-foreground";
    if (machineId === 1) return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100";
    if (machineId === 2) return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100";
    if (machineId === 3 || machineId === 4) return "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100";
    return "bg-muted text-muted-foreground";
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return "N/A";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Generate colors for each staff member
  const staffColors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="grid grid-cols-[2fr,1fr] min-h-screen gap-4 p-4">
        {/* Left Panel: Production Queue */}
        <div className="flex flex-col">
          <div className="mb-4">
            <h1 className="text-4xl font-bold tracking-tight" data-testid="heading-production-queue">Production Queue</h1>
            <p className="text-xl text-muted-foreground mt-1">
              Next 3 Days (excluding Sundays)
            </p>
          </div>

          <div className="flex-1 space-y-6">
            {sortedDates.map((date) => {
              const jobs = groupedByDate[date];
              return (
                <div key={date} data-testid={`date-group-${date}`}>
                  <div className="flex items-center gap-3 mb-3 sticky top-0 bg-background z-10 py-2">
                    <Calendar className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold">
                      {date === 'unscheduled' 
                        ? 'Unscheduled' 
                        : parseDbDate(date) 
                          ? format(parseDbDate(date)!, "EEEE, MMM d")
                          : 'Invalid Date'
                      }
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(jobs).map(([jobId, lineItems]) => {
                      const firstItem = lineItems[0];
                      return (
                        <Card key={jobId} data-testid={`job-card-${jobId}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <CardTitle className="text-xl">
                                  {firstItem.customer_name}
                                </CardTitle>
                                <p className="text-lg text-muted-foreground mt-1">
                                  {firstItem.job_name}
                                </p>
                                {firstItem.job_number && (
                                  <p className="text-sm text-muted-foreground">
                                    Job #{firstItem.job_number}
                                  </p>
                                )}
                              </div>
                              {parseDbDate(firstItem.required_dispatch_date) && (
                                <Badge variant="outline" className="text-base px-3 py-1">
                                  Dispatch: {format(parseDbDate(firstItem.required_dispatch_date)!, "MMM d")}
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {lineItems.map((item) => (
                                <div
                                  key={item.line_item_id}
                                  className="grid grid-cols-[1fr,auto,auto,auto] gap-4 items-center p-3 border rounded-lg"
                                  data-testid={`line-item-${item.line_item_id}`}
                                >
                                  <div>
                                    <p className="font-medium text-base">
                                      {item.description || "Line Item"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      Qty: {item.quantity} • {item.stitch_count.toLocaleString()} stitches
                                    </p>
                                  </div>

                                  <Badge className={`${getMachineBadgeColor(item.machine_id)} text-base px-3 py-1`}>
                                    {getMachineName(item.machine_id)}
                                  </Badge>

                                  <div className="text-right min-w-[120px]">
                                    <p className="font-semibold text-base">
                                      {item.staff_name || "Unassigned"}
                                    </p>
                                    {item.start_time !== null && (
                                      <p className="text-sm text-muted-foreground">
                                        {formatTime(item.start_time)} - {formatTime(item.end_time)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {sortedDates.length === 0 && (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-xl">No jobs scheduled for the next 3 days</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Right Panel: Leaderboard */}
        <div className="flex flex-col overflow-hidden">
          <div className="mb-4">
            <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
            <p className="text-lg text-muted-foreground mt-1">
              Last 30 Days
            </p>
          </div>

          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto flex-1">
              {leaderboard && leaderboard.leaders.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.leaders.map((leader, index) => {
                    const totalStars = leader.yellow_stars + leader.red_stars;
                    return (
                      <div
                        key={leader.staff_id}
                        className="p-4 border rounded-lg hover-elevate"
                        data-testid={`leader-${leader.staff_id}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 shrink-0">
                              {index < 3 ? (
                                <Trophy
                                  className={`h-7 w-7 ${
                                    index === 0
                                      ? "text-yellow-600 dark:text-yellow-500"
                                      : index === 1
                                      ? "text-slate-400 dark:text-slate-300"
                                      : "text-amber-700 dark:text-amber-600"
                                  }`}
                                />
                              ) : (
                                <span className="text-xl font-semibold text-muted-foreground">
                                  {index + 1}
                                </span>
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{leader.staff_name}</h3>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium text-base">{leader.yellow_stars}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 fill-red-500 text-red-500" />
                            <span className="font-medium text-base">{leader.red_stars}</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2 text-primary">
                            <TrendingUp className="h-5 w-5" />
                            <span className="font-bold text-xl">
                              {Math.round(leader.stitches_per_head_hour || 0).toLocaleString()}
                            </span>
                            <span className="text-sm text-muted-foreground">stitches/hr</span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {leader.total_stitches.toLocaleString()} stitches • {leader.total_hours.toFixed(1)}h
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">No production data in last 30 days</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stitches Per Hour Line Graph */}
          {chartData.length > 0 && history && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <TrendingUp className="h-6 w-6 text-primary" />
                  Stitches Per Hour Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Stitches/Hour', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      labelFormatter={(value) => format(new Date(value as string), "MMM d, yyyy")}
                    />
                    <Legend />
                    {Array.from(new Set(history.history.map(h => h.staff_name))).map((staffName, index) => (
                      <Line
                        key={staffName}
                        type="monotone"
                        dataKey={staffName}
                        stroke={staffColors[index % staffColors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {leaderboard && (
            <div className="mt-3 text-xs text-muted-foreground text-center">
              Updated {format(new Date(leaderboard.generatedAt), "MMM d, h:mm a")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

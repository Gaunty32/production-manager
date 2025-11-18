import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Trophy, Calendar, TrendingUp, AlertTriangle, AlertCircle } from "lucide-react";
import { getMachineName } from "@shared/machines";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  on_time_count?: number;
  late_count?: number;
  stars?: number;
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

    // Get unique dates
    const dates = Array.from(new Set(history.history.map(h => h.completion_date))).sort();

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
  }, [chartData.length]); // Recreate interval when chartData availability changes

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

  // Get unique staff members for line chart
  const staffMembers = history 
    ? Array.from(new Set(history.history.map(h => h.staff_name))) 
    : [];

  const renderOverdueBanner = () => {
    if (overdueJobs.length === 0) return null;

    const uniqueOverdueJobs = Array.from(
      new Map(overdueJobs.map(item => [item.job_id, item])).values()
    );

    const jobIdentifiers = uniqueOverdueJobs.map(j => 
      j.job_number ? `#${j.job_number}` : `${j.customer_name} - ${j.job_name}`
    ).join(', ');

    return (
      <div className="bg-destructive text-destructive-foreground p-6 mb-6 rounded-lg border-4 border-destructive" data-testid="banner-overdue">
        <div className="flex items-center gap-4">
          <AlertCircle className="h-8 w-8 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-3xl font-bold mb-2">OVERDUE JOBS!</h2>
            <p className="text-xl">
              {uniqueOverdueJobs.length} job{uniqueOverdueJobs.length !== 1 ? 's' : ''} past dispatch date: {jobIdentifiers}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderQueueView = () => (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-5xl font-bold tracking-tight" data-testid="heading-production-queue">Production Queue</h1>
        <p className="text-2xl text-muted-foreground mt-2">
          Next 3 Days (excluding Sundays) + Overdue Jobs
        </p>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        {sortedDates.map((date) => {
          const jobs = groupedByDate[date];
          return (
            <div key={date} data-testid={`date-group-${date}`}>
              <div className="flex items-center gap-3 mb-4 sticky top-0 bg-background z-10 py-2">
                <Calendar className="h-8 w-8 text-primary" />
                <h2 className="text-3xl font-semibold">
                  {date === 'unscheduled' 
                    ? 'Unscheduled' 
                    : parseDbDate(date) 
                      ? format(parseDbDate(date)!, "EEEE, MMM d")
                      : 'Invalid Date'
                  }
                </h2>
              </div>

              <div className="space-y-4">
                {Object.entries(jobs).map(([jobId, lineItems]) => {
                  const firstItem = lineItems[0];
                  const isOverdue = firstItem.is_overdue === 1;
                  return (
                    <Card 
                      key={jobId} 
                      data-testid={`job-card-${jobId}`}
                      className={isOverdue ? "border-4 border-destructive" : ""}
                    >
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-2xl">
                              {firstItem.customer_name}
                            </CardTitle>
                            <p className="text-xl text-muted-foreground mt-1">
                              {firstItem.job_name}
                            </p>
                            {firstItem.job_number && (
                              <p className="text-lg text-muted-foreground">
                                Job #{firstItem.job_number}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            {isOverdue && (
                              <Badge variant="destructive" className="text-xl px-4 py-2">
                                <AlertCircle className="h-5 w-5 mr-2" />
                                OVERDUE
                              </Badge>
                            )}
                            {parseDbDate(firstItem.required_dispatch_date) && (
                              <Badge variant="outline" className="text-lg px-4 py-2">
                                Dispatch: {format(parseDbDate(firstItem.required_dispatch_date)!, "MMM d")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {lineItems.map((item) => (
                            <div
                              key={item.line_item_id}
                              className="grid grid-cols-[1fr,auto,auto] gap-6 items-center p-4 border rounded-lg"
                              data-testid={`line-item-${item.line_item_id}`}
                            >
                              <div>
                                <p className="font-medium text-xl">
                                  {item.description || "Line Item"}
                                </p>
                                <p className="text-lg text-muted-foreground">
                                  Qty: {item.quantity} • {item.stitch_count.toLocaleString()} stitches
                                </p>
                              </div>

                              <Badge className={`${getMachineBadgeColor(item.machine_id)} text-lg px-4 py-2`}>
                                {getMachineName(item.machine_id)}
                              </Badge>

                              <div className="text-right min-w-[180px]">
                                <p className="font-semibold text-xl">
                                  {item.staff_name || "Unassigned"}
                                </p>
                                {item.start_time !== null && (
                                  <p className="text-lg text-muted-foreground">
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
            <CardContent className="text-center py-16 text-muted-foreground">
              <Calendar className="h-20 w-20 mx-auto mb-4 opacity-30" />
              <p className="text-2xl">No jobs scheduled in the next 3 days</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderLeaderboardView = () => {
    const leaders = leaderboard?.leaders || [];
    
    if (leaders.length === 0) {
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <h1 className="text-5xl font-bold tracking-tight" data-testid="heading-leaderboard">Production Leaderboard</h1>
            <p className="text-2xl text-muted-foreground mt-2">Last 30 Days Performance</p>
          </div>
          <Card>
            <CardContent className="text-center py-16 text-muted-foreground">
              <Trophy className="h-20 w-20 mx-auto mb-4 opacity-30" />
              <p className="text-2xl">No performance data available for the last 30 days</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h1 className="text-5xl font-bold tracking-tight" data-testid="heading-leaderboard">Production Leaderboard</h1>
          <p className="text-2xl text-muted-foreground mt-2">Last 30 Days Performance</p>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="space-y-4">
            {leaders.map((staff: LeaderData, index: number) => {
              const netStars = Math.max(0, staff.yellow_stars - staff.red_stars);
              return (
                <Card key={staff.staff_id} data-testid={`leaderboard-${staff.staff_id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-6">
                      <div 
                        className="text-6xl font-bold text-primary w-20 text-center" 
                        data-testid={`rank-${staff.staff_id}`}
                        aria-label={`Rank ${index + 1}`}
                      >
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-3xl font-semibold" data-testid={`staff-name-${staff.staff_id}`}>
                          {staff.staff_name}
                        </h3>
                        <div className="grid grid-cols-3 gap-6 mt-4">
                          <div>
                            <p className="text-lg text-muted-foreground">Stitches/Hour</p>
                            <p 
                              className="text-3xl font-bold text-primary" 
                              data-testid={`stitches-per-hour-${staff.staff_id}`}
                            >
                              {staff.stitches_per_head_hour.toFixed(0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-lg text-muted-foreground">Yellow Stars</p>
                            <p 
                              className="text-3xl font-bold text-yellow-600" 
                              data-testid={`yellow-stars-${staff.staff_id}`}
                            >
                              {staff.yellow_stars}
                            </p>
                          </div>
                          <div>
                            <p className="text-lg text-muted-foreground">Red Stars</p>
                            <p 
                              className="text-3xl font-bold text-red-600" 
                              data-testid={`red-stars-${staff.staff_id}`}
                            >
                              {staff.red_stars}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2" data-testid={`stars-${staff.staff_id}`} aria-label={`${netStars} stars`}>
                        {Array.from({ length: Math.min(5, netStars) }).map((_, i) => (
                          <Star key={i} className="h-12 w-12 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGraphView = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <h1 className="text-5xl font-bold tracking-tight" data-testid="heading-performance-graph">Performance Trends</h1>
            <p className="text-2xl text-muted-foreground mt-2">30-Day Stitches Per Hour History</p>
          </div>
          <Card>
            <CardContent className="text-center py-16 text-muted-foreground">
              <TrendingUp className="h-20 w-20 mx-auto mb-4 opacity-30" />
              <p className="text-2xl">No performance history available</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h1 className="text-5xl font-bold tracking-tight" data-testid="heading-performance-graph">Performance Trends</h1>
          <p className="text-2xl text-muted-foreground mt-2">30-Day Stitches Per Hour History</p>
        </div>

        <div className="flex-1 overflow-auto">
          <Card data-testid="graph-container">
            <CardContent className="p-8">
              <ResponsiveContainer width="100%" height={600} data-testid="performance-chart">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 16 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return format(date, 'MMM d');
                  }}
                />
                <YAxis 
                  label={{ value: 'Stitches Per Hour', angle: -90, position: 'insideLeft', style: { fontSize: 18 } }}
                  tick={{ fontSize: 16 }}
                />
                <Tooltip 
                  contentStyle={{ fontSize: 16 }}
                  labelFormatter={(value) => {
                    const date = new Date(value as string);
                    return format(date, 'MMM d, yyyy');
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: 18 }}
                />
                {staffMembers.map((staffName, index) => (
                  <Line
                    key={staffName}
                    type="monotone"
                    dataKey={staffName}
                    stroke={staffColors[index % staffColors.length]}
                    strokeWidth={3}
                    dot={{ r: 6 }}
                    name={staffName}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-background p-6">
      {renderOverdueBanner()}
      
      <div className="min-h-[calc(100vh-12rem)]">
        {currentView === 'queue' && renderQueueView()}
        {currentView === 'leaderboard' && renderLeaderboardView()}
        {currentView === 'graph' && renderGraphView()}
      </div>
      
      {/* View indicator */}
      <div className="mt-4 text-center text-muted-foreground text-lg" data-testid="carousel-indicators">
        <div className="flex items-center justify-center gap-3">
          <div 
            className={`h-3 w-3 rounded-full ${currentView === 'queue' ? 'bg-primary' : 'bg-muted'}`} 
            data-testid="indicator-queue"
            aria-label="Queue view indicator"
          />
          <div 
            className={`h-3 w-3 rounded-full ${currentView === 'leaderboard' ? 'bg-primary' : 'bg-muted'}`} 
            data-testid="indicator-leaderboard"
            aria-label="Leaderboard view indicator"
          />
          <div 
            className={`h-3 w-3 rounded-full ${currentView === 'graph' ? 'bg-primary' : 'bg-muted'}`} 
            data-testid="indicator-graph"
            aria-label="Graph view indicator"
          />
        </div>
        <p className="mt-2" data-testid="text-rotation-info">
          Auto-rotating every 12 seconds
        </p>
      </div>
    </div>
  );
}

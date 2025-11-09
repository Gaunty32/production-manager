import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Trophy, Calendar, TrendingUp } from "lucide-react";
import { getMachineName } from "@shared/machines";
import { format } from "date-fns";

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
  schedule_date: string;
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

export default function ProductionDisplay() {
  const { data: queueData = [] } = useQuery<QueueData[]>({
    queryKey: ["/api/production-display/queue"],
    refetchInterval: 150000, // Refresh every 2.5 minutes
  });

  const { data: leaderboard } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/production-display/leaderboard"],
    refetchInterval: 150000,
  });

  // Group queue data by date, then by job
  const groupedByDate: Record<string, Record<string, QueueData[]>> = {};
  queueData.forEach((item) => {
    if (!groupedByDate[item.schedule_date]) {
      groupedByDate[item.schedule_date] = {};
    }
    if (!groupedByDate[item.schedule_date][item.job_id]) {
      groupedByDate[item.schedule_date][item.job_id] = [];
    }
    groupedByDate[item.schedule_date][item.job_id].push(item);
  });

  const sortedDates = Object.keys(groupedByDate).sort();

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

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="grid grid-cols-[2fr,1fr] h-full gap-4 p-4">
        {/* Left Panel: Production Queue */}
        <div className="flex flex-col overflow-hidden">
          <div className="mb-4">
            <h1 className="text-4xl font-bold tracking-tight">Production Queue</h1>
            <p className="text-xl text-muted-foreground mt-1">
              Next 7 Days
            </p>
          </div>

          <div className="overflow-auto flex-1 space-y-6">
            {sortedDates.map((date) => {
              const jobs = groupedByDate[date];
              return (
                <div key={date} data-testid={`date-group-${date}`}>
                  <div className="flex items-center gap-3 mb-3 sticky top-0 bg-background z-10 py-2">
                    <Calendar className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold">
                      {format(new Date(date), "EEEE, MMM d")}
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
                              {firstItem.required_dispatch_date && (
                                <Badge variant="outline" className="text-base px-3 py-1">
                                  Dispatch: {format(new Date(firstItem.required_dispatch_date), "MMM d")}
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
                  <p className="text-xl">No jobs scheduled for the next 7 days</p>
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

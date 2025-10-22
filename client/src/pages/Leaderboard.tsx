import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Trophy, TrendingUp, Calendar, Briefcase, Hash, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface LeaderboardEntry {
  userId: string;
  firstName: string;
  lastName: string;
  yellowStars: number;
  redStars: number;
  stitchesPerHour: number;
  totalStitches: number;
  totalHours: number;
}

interface DailyProductionMetric {
  staffId: string;
  staffName: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  date: string;
  jobsCompleted: number;
  totalStitches: number;
  totalItems: number;
  totalHours: number;
  stitchesPerHour: number;
  machineTypes: Record<string, number>;
}

export default function Leaderboard() {
  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/stars/leaderboard"],
  });

  const { data: dailyProduction, isLoading: dailyLoading } = useQuery<DailyProductionMetric[]>({
    queryKey: ["/api/staff-production/daily"],
  });

  // Sort by yellow stars (primary) then red stars (secondary)
  const sortedLeaderboard = leaderboard
    ? [...leaderboard].sort((a, b) => {
        if (b.yellowStars !== a.yellowStars) {
          return b.yellowStars - a.yellowStars;
        }
        return b.redStars - a.redStars;
      })
    : [];

  // Group daily production by staff for better visualization
  const groupedByStaff = dailyProduction?.reduce((acc, metric) => {
    const key = metric.staffName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(metric);
    return acc;
  }, {} as Record<string, DailyProductionMetric[]>);

  const getRankColor = (index: number) => {
    switch (index) {
      case 0:
        return "text-yellow-600 dark:text-yellow-500";
      case 1:
        return "text-slate-400 dark:text-slate-300";
      case 2:
        return "text-amber-700 dark:text-amber-600";
      default:
        return "text-muted-foreground";
    }
  };

  const getRankIcon = (index: number) => {
    if (index < 3) {
      return <Trophy className={`h-6 w-6 ${getRankColor(index)}`} />;
    }
    return <span className="text-lg font-semibold text-muted-foreground">{index + 1}</span>;
  };

  const formatMachineTypes = (machineTypes: Record<string, number>) => {
    const entries = Object.entries(machineTypes);
    if (entries.length === 0) return "N/A";
    
    return entries
      .map(([type, minutes]) => `${type}: ${Math.round(minutes / 60 * 10) / 10}h`)
      .join(", ");
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Staff Performance</h1>
          <p className="text-muted-foreground mt-2">
            Track team performance, stars, and daily production metrics
          </p>
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6" data-testid="tabs-leaderboard">
            <TabsTrigger value="daily" data-testid="tab-daily-production">
              Daily Production
            </TabsTrigger>
            <TabsTrigger value="stars" data-testid="tab-stars">
              Star Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-4">
            {dailyLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !dailyProduction || dailyProduction.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No production data yet. Complete some line items to see daily metrics!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedByStaff || {}).map(([staffName, metrics]) => {
                  // Sort by date descending
                  const sortedMetrics = [...metrics].sort((a, b) => 
                    b.date.localeCompare(a.date)
                  );
                  
                  // Calculate totals for this staff member
                  const totalJobs = metrics.reduce((sum, m) => sum + m.jobsCompleted, 0);
                  const totalStitches = metrics.reduce((sum, m) => sum + m.totalStitches, 0);
                  const totalItems = metrics.reduce((sum, m) => sum + m.totalItems, 0);
                  const avgStitchesPerHour = Math.round(
                    metrics.reduce((sum, m) => sum + m.stitchesPerHour, 0) / metrics.length
                  );

                  return (
                    <Card key={staffName} data-testid={`staff-production-${staffName.replace(/\s/g, '-')}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-xl">{staffName}</CardTitle>
                            <CardDescription className="mt-1">
                              Production history and daily metrics
                            </CardDescription>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">{totalJobs}</div>
                              <div className="text-muted-foreground">Jobs</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">
                                {totalStitches.toLocaleString()}
                              </div>
                              <div className="text-muted-foreground">Stitches</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">
                                {avgStitchesPerHour.toLocaleString()}
                              </div>
                              <div className="text-muted-foreground">Avg/hr</div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {sortedMetrics.map((metric, idx) => (
                            <div
                              key={`${metric.staffId}-${metric.date}`}
                              className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 rounded-lg border hover-elevate"
                              data-testid={`daily-metric-${metric.staffId}-${metric.date}`}
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <div className="font-medium" data-testid={`text-date-${metric.date}`}>
                                    {format(new Date(metric.date), "MMM d, yyyy")}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(metric.date), "EEEE")}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <div className="font-bold text-lg" data-testid={`jobs-${metric.staffId}-${metric.date}`}>
                                    {metric.jobsCompleted}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Jobs</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <div className="font-bold text-lg" data-testid={`stitches-${metric.staffId}-${metric.date}`}>
                                    {metric.totalStitches.toLocaleString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Stitches</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <div className="font-bold text-lg" data-testid={`items-${metric.staffId}-${metric.date}`}>
                                    {metric.totalItems.toLocaleString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Items</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                  <div className="font-bold text-lg" data-testid={`hours-${metric.staffId}-${metric.date}`}>
                                    {metric.totalHours}h
                                  </div>
                                  <div className="text-xs text-muted-foreground">Time</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                                <div>
                                  <div className="font-bold text-lg text-primary" data-testid={`rate-${metric.staffId}-${metric.date}`}>
                                    {metric.stitchesPerHour.toLocaleString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Stitches/hr</div>
                                </div>
                              </div>

                              {Object.keys(metric.machineTypes).length > 0 && (
                                <div className="col-span-full text-xs text-muted-foreground border-t pt-2">
                                  Machine usage: {formatMachineTypes(metric.machineTypes)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stars">
            <Card>
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
                <CardDescription>
                  Yellow stars for on-time completions, red stars for late completions. 
                  Production metrics normalized per machine head (6-head or 8-head machines).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leaderboardLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : sortedLeaderboard.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No stars awarded yet. Complete some jobs to get on the leaderboard!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedLeaderboard.map((entry, index) => {
                      const totalStars = entry.yellowStars + entry.redStars;
                      return (
                        <div
                          key={entry.userId}
                          className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2"
                          data-testid={`leaderboard-entry-${entry.userId}`}
                        >
                          <div className="flex items-center justify-center w-12 shrink-0">
                            {getRankIcon(index)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg" data-testid={`text-name-${entry.userId}`}>
                              {entry.firstName} {entry.lastName}
                            </h3>
                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                              <div className="flex items-center gap-1.5" data-testid={`stars-yellow-${entry.userId}`}>
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">{entry.yellowStars}</span>
                              </div>
                              <div className="flex items-center gap-1.5" data-testid={`stars-red-${entry.userId}`}>
                                <Star className="h-4 w-4 fill-red-500 text-red-500" />
                                <span className="text-sm font-medium">{entry.redStars}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Total: {totalStars}
                              </div>
                              {entry.stitchesPerHour > 0 && (
                                <div className="text-sm font-medium text-primary" data-testid={`stitches-per-hour-${entry.userId}`}>
                                  {entry.stitchesPerHour.toLocaleString()} stitches/head-hr
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface LeaderboardEntry {
  userId: string;
  firstName: string;
  lastName: string;
  yellowStars: number;
  redStars: number;
}

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/stars/leaderboard"],
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

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Star Leaderboard</h1>
          <p className="text-muted-foreground mt-2">
            Team members ranked by performance stars
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>
              Yellow stars for on-time completions, red stars for late completions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                        <div className="flex items-center gap-4 mt-1">
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
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

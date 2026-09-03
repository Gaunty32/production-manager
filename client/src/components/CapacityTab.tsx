import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, CalendarClock, Gauge, Info, Timer } from "lucide-react";

interface CapacityData {
  history: Array<{
    weekStart: string;
    completedQuantity: number;
    actualMinutes: number;
    recordedSessions: number;
    fallbackItems: number;
    garmentsPerHour: number | null;
  }>;
  forward: Array<{
    weekStart: string;
    staffedMachineHours: number;
    scheduledHours: number;
    scheduledUtilisation: number | null;
    modelledCapacity: number | null;
  }>;
  summary: {
    measuredWeeks: number;
    measuredQuantity: number;
    measuredMinutes: number;
    garmentsPerHour: number | null;
    conservativeWeeklyOutput: number | null;
    typicalWeeklyOutput: number | null;
    strongWeeklyOutput: number | null;
    nextFourWeekStaffedMachineHours: number;
    nextFourWeekScheduledHours: number;
    nextFourWeekModelledCapacity: number | null;
    nextFourWeekScheduledUtilisation: number | null;
    confidence: "measured" | "early" | "insufficient";
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function confidenceBadge(confidence: CapacityData["summary"]["confidence"]) {
  if (confidence === "measured") return <Badge>Measured</Badge>;
  if (confidence === "early") return <Badge variant="secondary">Early signal</Badge>;
  return <Badge variant="destructive">Insufficient data</Badge>;
}

export function CapacityTab() {
  const { data, isLoading, isError } = useQuery<CapacityData>({
    queryKey: ["/api/reports/capacity"],
    queryFn: async () => {
      const response = await fetch("/api/reports/capacity?weeks=12", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load capacity report");
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (isError || !data) {
    return <Alert variant="destructive"><AlertTitle>Capacity report unavailable</AlertTitle><AlertDescription>We could not calculate capacity from the current production and scheduling data.</AlertDescription></Alert>;
  }

  const summary = data.summary;
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Capacity is measured, not guessed</AlertTitle>
        <AlertDescription>
          Historical throughput uses completed garments and recorded production minutes. Forward capacity uses staffed machine time from shifts, allocations, holidays and machine blocks, then applies the measured garments-per-hour rate.
        </AlertDescription>
      </Alert>

      {summary.confidence !== "measured" && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertTitle>{summary.confidence === "early" ? "Keep recording production time" : "Start recording production time"}</AlertTitle>
          <AlertDescription>
            {summary.confidence === "early"
              ? `Only ${summary.measuredWeeks} week${summary.measuredWeeks === 1 ? "" : "s"} contain usable actual-time data. Treat the capacity figures as an early signal until at least four complete weeks are measured.`
              : "There are no completed weeks with both output and actual production time. Capacity will appear here as operators record start/finish times or actual completion durations."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Typical weekly output</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-capacity-typical">
              {summary.typicalWeeklyOutput != null ? summary.typicalWeeklyOutput.toLocaleString() : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Median of measured weeks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Measured throughput</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-capacity-rate">
              {summary.garmentsPerHour != null ? `${summary.garmentsPerHour.toLocaleString()} / hr` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">{summary.measuredWeeks} measured week{summary.measuredWeeks === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next 4 weeks rota</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.nextFourWeekStaffedMachineHours.toLocaleString()}h</div>
            <p className="text-xs text-muted-foreground">Staffed machine time available</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modelled weekly capacity</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-capacity-modelled">
              {summary.nextFourWeekModelledCapacity != null ? summary.nextFourWeekModelledCapacity.toLocaleString() : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.nextFourWeekScheduledUtilisation != null
                ? `${summary.nextFourWeekScheduledUtilisation}% of rota already booked`
                : "Needs measured throughput"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forward capacity from the schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week starting</TableHead>
                  <TableHead className="text-right">Staffed machine time</TableHead>
                  <TableHead className="text-right">Booked jobs</TableHead>
                  <TableHead className="text-right">Booked rota</TableHead>
                  <TableHead className="text-right">Modelled garments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.forward.map((row) => (
                  <TableRow key={row.weekStart}>
                    <TableCell className="font-medium">{formatDate(row.weekStart)}</TableCell>
                    <TableCell className="text-right font-mono">{row.staffedMachineHours.toLocaleString()}h</TableCell>
                    <TableCell className="text-right font-mono">{row.scheduledHours.toLocaleString()}h</TableCell>
                    <TableCell className="text-right">
                      {row.scheduledUtilisation != null ? `${row.scheduledUtilisation}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.modelledCapacity != null ? row.modelledCapacity.toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Measured production history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week starting</TableHead>
                  <TableHead className="text-right">Garments completed</TableHead>
                  <TableHead className="text-right">Actual time</TableHead>
                  <TableHead className="text-right">Garments / hour</TableHead>
                  <TableHead>Data source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((row) => (
                  <TableRow key={row.weekStart}>
                    <TableCell className="font-medium">{formatDate(row.weekStart)}</TableCell>
                    <TableCell className="text-right font-mono">{row.completedQuantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatMinutes(row.actualMinutes)}</TableCell>
                    <TableCell className="text-right font-mono">{row.garmentsPerHour != null ? row.garmentsPerHour.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.recordedSessions > 0 ? `${row.recordedSessions} recorded session${row.recordedSessions === 1 ? "" : "s"}` : "No actual time"}
                      {row.fallbackItems > 0 ? ` + ${row.fallbackItems} completion record${row.fallbackItems === 1 ? "" : "s"}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
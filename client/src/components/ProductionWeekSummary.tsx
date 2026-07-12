import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoText } from "@/components/DemoText";
import { ChevronLeft, ChevronRight, Package, Clock, Gauge, CheckCircle2, Users } from "lucide-react";

interface ProductionWeekData {
  weekStart: string;
  weekEnd: string;
  totals: {
    itemsCompleted: number;
    quantityCompleted: number;
    totalStitches: number;
    actualMinutes: number;
    estimatedMinutes: number;
    avgRatio: number | null;
    onTime: number;
    late: number;
    withDueDate: number;
  };
  byStaff: Array<{
    staffId: string;
    name: string;
    quantity: number;
    minutes: number;
    stitches: number;
    itemsWorkedOn: number;
    stitchesPerHour: number | null;
  }>;
  byMachine: Array<{
    machineId: number;
    name: string;
    items: number;
    quantity: number;
    actualMinutes: number;
    estimatedMinutes: number;
    avgRatio: number | null;
  }>;
  items: Array<{
    lineItemId: string;
    jobName: string;
    customerName: string;
    description: string | null;
    machineName: string | null;
    quantity: number;
    stitchCount: number;
    estimatedMinutes: number | null;
    actualMinutes: number | null;
    variance: number | null;
    completedAt: string | null;
    contributors: string[];
  }>;
}

function formatMinutes(mins: number): string {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function accuracyBadge(ratio: number | null) {
  if (ratio == null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(ratio * 100);
  // ratio = actual / estimated. Under 100% means faster than estimated.
  const variant =
    pct <= 110 ? "default" : pct <= 135 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="font-mono">
      {pct}%
    </Badge>
  );
}

export function ProductionWeekSummary() {
  // Monday of the currently viewed week
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const isCurrentWeek = weekStartStr === format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading } = useQuery<ProductionWeekData>({
    queryKey: ["/api/reports/production-week", { weekStart: weekStartStr }],
    queryFn: async () => {
      const res = await fetch(`/api/reports/production-week?weekStart=${weekStartStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load production week report");
      return res.json();
    },
  });

  const totals = data?.totals;
  const timeSaved = totals ? totals.estimatedMinutes - totals.actualMinutes : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-week-range">
            {data ? (
              <>Week {format(new Date(data.weekStart), "d MMM")} – {format(new Date(data.weekEnd), "d MMM yyyy")}</>
            ) : (
              "Production Week"
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Monday to Sunday production summary{isCurrentWeek ? " (current week, in progress)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            disabled={isCurrentWeek}
            data-testid="button-current-week"
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            disabled={isCurrentWeek}
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Produced</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-week-quantity">
                  {(totals?.quantityCompleted ?? 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {totals?.itemsCompleted ?? 0} line item{(totals?.itemsCompleted ?? 0) !== 1 ? "s" : ""} completed
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-week-actual-time">
                  {formatMinutes(totals?.actualMinutes ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  vs {formatMinutes(totals?.estimatedMinutes ?? 0)} estimated
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimate Accuracy</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-week-accuracy">
                  {totals?.avgRatio != null ? `${Math.round(totals.avgRatio * 100)}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {totals?.avgRatio == null
                    ? "No comparable items"
                    : timeSaved >= 0
                      ? `${formatMinutes(timeSaved)} faster than estimated`
                      : `${formatMinutes(-timeSaved)} over estimate`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Completion</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-week-ontime">
                  {totals && totals.withDueDate > 0
                    ? `${Math.round((totals.onTime / totals.withDueDate) * 100)}%`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {totals?.onTime ?? 0} on time, {totals?.late ?? 0} late
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Output
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[160px] w-full" />
          ) : data?.byStaff.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Time Worked</TableHead>
                  <TableHead className="text-right">Stitches</TableHead>
                  <TableHead className="text-right">Stitches / Hour</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byStaff.map((s) => (
                  <TableRow key={s.staffId} data-testid={`row-week-staff-${s.staffId}`}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right font-mono">{s.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatMinutes(s.minutes)}</TableCell>
                    <TableCell className="text-right font-mono">{s.stitches.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">
                      {s.stitchesPerHour != null ? s.stitchesPerHour.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{s.itemsWorkedOn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No production recorded this week yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Machine Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[140px] w-full" />
          ) : data?.byMachine.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Actual Time</TableHead>
                  <TableHead className="text-right">Estimated Time</TableHead>
                  <TableHead className="text-right">Actual vs Estimate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byMachine.map((m) => (
                  <TableRow key={m.machineId} data-testid={`row-week-machine-${m.machineId}`}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right font-mono">{m.items}</TableCell>
                    <TableCell className="text-right font-mono">{m.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatMinutes(m.actualMinutes)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMinutes(m.estimatedMinutes)}</TableCell>
                    <TableCell className="text-right">{accuracyBadge(m.avgRatio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No machine production this week yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Completed Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[160px] w-full" />
          ) : data?.items.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Completed By</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Est.</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Accuracy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.lineItemId} data-testid={`row-week-item-${item.lineItemId}`}>
                      <TableCell>
                        <div className="font-medium">{item.jobName}</div>
                        <div className="text-xs text-muted-foreground">
                          <DemoText>{item.customerName}</DemoText>
                          {item.completedAt ? ` • ${format(new Date(item.completedAt), "EEE d MMM")}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.contributors.length ? (
                            item.contributors.map((name) => (
                              <Badge key={name} variant="secondary">{name}</Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{item.machineName || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{item.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.estimatedMinutes != null ? formatMinutes(item.estimatedMinutes) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.actualMinutes != null ? formatMinutes(item.actualMinutes) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {accuracyBadge(
                          item.estimatedMinutes && item.actualMinutes != null && item.estimatedMinutes > 0
                            ? item.actualMinutes / item.estimatedMinutes
                            : null
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No line items completed this week yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

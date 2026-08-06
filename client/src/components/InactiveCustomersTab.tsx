import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface InactiveCustomer {
  id: string;
  name: string;
  email: string | null;
  daysSinceLastOrder: number;
  lastOrderDate: string | null;
  checkInSentAt: string | null;
  inactiveNotifiedAt: string | null;
}

interface ReportData {
  activeCustomerCount: number;
  customers: InactiveCustomer[];
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : format(dt, "d MMM yyyy");
};

export default function InactiveCustomersTab() {
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/reports/inactive-customers"],
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const customers = data?.customers ?? [];
  const considerClosing = customers.filter(c => c.daysSinceLastOrder >= 91);
  const goingQuiet = customers.filter(c => c.daysSinceLastOrder < 91);

  const renderTable = (rows: InactiveCustomer[], testId: string) => (
    <Table data-testid={testId}>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Last order</TableHead>
          <TableHead className="text-right">Weeks inactive</TableHead>
          <TableHead>Check-in email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(c => (
          <TableRow key={c.id}>
            <TableCell>
              <div className="font-medium">{c.name}</div>
              {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
            </TableCell>
            <TableCell>{fmtDate(c.lastOrderDate)}</TableCell>
            <TableCell className="text-right">
              {Math.floor(c.daysSinceLastOrder / 7)}
              <span className="text-muted-foreground text-xs"> ({c.daysSinceLastOrder}d)</span>
            </TableCell>
            <TableCell>
              {c.checkInSentAt
                ? <Badge variant="outline">Sent {fmtDate(c.checkInSentAt)}</Badge>
                : <span className="text-muted-foreground text-sm">Not yet sent</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Open customer accounts</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold" data-testid="stat-active-customers">{data?.activeCustomerCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Going quiet (8+ weeks)</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold text-amber-600" data-testid="stat-going-quiet">{goingQuiet.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Consider closing (3+ months)</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-600" data-testid="stat-consider-closing">{considerClosing.length}</div></CardContent>
        </Card>
      </div>

      <Card className="border-red-500/40">
        <CardHeader>
          <CardTitle className="text-base">Consider making inactive — no orders for 3+ months ({considerClosing.length})</CardTitle>
          <CardDescription>
            Time for an honest conversation about closing these accounts. James is emailed automatically
            when a customer passes 3 months, and receives this full report on the 1st of each month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {considerClosing.length === 0
            ? <p className="text-sm text-muted-foreground">No customers at 3+ months. Nothing to action.</p>
            : renderTable(considerClosing, "table-consider-closing")}
        </CardContent>
      </Card>

      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-base">Going quiet — no orders for 8+ weeks ({goingQuiet.length})</CardTitle>
          <CardDescription>
            These customers are sent a friendly check-in email automatically once they pass 8 weeks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {goingQuiet.length === 0
            ? <p className="text-sm text-muted-foreground">Nobody in the 8-week window right now.</p>
            : renderTable(goingQuiet, "table-going-quiet")}
        </CardContent>
      </Card>
    </div>
  );
}

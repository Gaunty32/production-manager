import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Calendar, Check, X, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { StaffHoliday, BankHoliday, Staff } from "@shared/schema";
import { StaffHolidayFormDialog } from "@/components/StaffHolidayFormDialog";
import { BankHolidayFormDialog } from "@/components/BankHolidayFormDialog";
import { HolidayRequestDialog } from "@/components/HolidayRequestDialog";

type AllowanceSummary = {
  staffId: string;
  staffName: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
};

type HolidayWithDays = StaffHoliday & { days: number };
type RequestRow = StaffHoliday & { staffName: string; days: number };

type MyHolidayResponse = {
  staff: Staff | null;
  canApprove: boolean;
  summary: AllowanceSummary | null;
  holidays: HolidayWithDays[];
  year: number;
};

type AllowancesResponse = {
  year: number;
  allowances: AllowanceSummary[];
};

function statusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    approved: "default",
    pending: "secondary",
    declined: "destructive",
  };
  return (
    <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
  );
}

function holidayTypeBadge(type: string) {
  const variants: Record<string, "default" | "secondary" | "destructive"> = {
    holiday: "default",
    sick: "destructive",
    other: "secondary",
  };
  return <Badge variant={variants[type] || "secondary"}>{type}</Badge>;
}

function formatRange(holiday: StaffHoliday & { halfDayStart?: boolean; halfDayEnd?: boolean }) {
  const start = format(new Date(holiday.startDate), "dd MMM yyyy");
  const end = format(new Date(holiday.endDate), "dd MMM yyyy");
  const halves: string[] = [];
  if (holiday.halfDayStart) halves.push("½ first day");
  if (holiday.halfDayEnd) halves.push("½ last day");
  const suffix = halves.length ? ` (${halves.join(", ")})` : "";
  return start === end ? `${start}${suffix}` : `${start} → ${end}${suffix}`;
}

export function HolidaysManagement() {
  const { toast } = useToast();
  const [staffHolidayToDelete, setStaffHolidayToDelete] = useState<string | null>(null);
  const [staffHolidayToEdit, setStaffHolidayToEdit] = useState<StaffHoliday | null>(null);
  const [bankHolidayToDelete, setBankHolidayToDelete] = useState<string | null>(null);
  const [bankHolidayToEdit, setBankHolidayToEdit] = useState<BankHoliday | null>(null);
  const [editingAllowanceId, setEditingAllowanceId] = useState<string | null>(null);
  const [editAllowanceValue, setEditAllowanceValue] = useState("");

  const { data: me } = useQuery<MyHolidayResponse>({
    queryKey: ["/api/staff-holidays/me"],
  });
  const canApprove = me?.canApprove ?? false;

  const { data: staffHolidays = [], isLoading: loadingStaffHolidays } = useQuery<StaffHoliday[]>({
    queryKey: ["/api/staff-holidays"],
  });

  const { data: bankHolidays = [], isLoading: loadingBankHolidays } = useQuery<BankHoliday[]>({
    queryKey: ["/api/bank-holidays"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: requests = [] } = useQuery<RequestRow[]>({
    queryKey: ["/api/staff-holidays/requests"],
    enabled: canApprove,
  });

  const { data: allowancesData } = useQuery<AllowancesResponse>({
    queryKey: ["/api/staff-holidays/allowances"],
    enabled: canApprove,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "decline" }) => {
      const res = await apiRequest("POST", `/api/staff-holidays/${id}/${action}`, {});
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      toast({
        title: variables.action === "approve" ? "Approved" : "Declined",
        description: `Holiday request ${variables.action === "approve" ? "approved" : "declined"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update request",
        variant: "destructive",
      });
    },
  });

  const updateAllowanceMutation = useMutation({
    mutationFn: async ({ staffId, holidayAllowance }: { staffId: string; holidayAllowance: number }) => {
      const res = await apiRequest("PATCH", `/api/staff/${staffId}`, { holidayAllowance });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setEditingAllowanceId(null);
      toast({ title: "Allowance updated" });
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message || "Failed to update allowance", variant: "destructive" }),
  });

  const saveAllowance = (staffId: string) => {
    const val = parseFloat(editAllowanceValue);
    if (isNaN(val) || val < 0) {
      toast({ title: "Enter a valid number", description: "Allowance must be 0 or more.", variant: "destructive" });
      return;
    }
    updateAllowanceMutation.mutate({ staffId, holidayAllowance: val });
  };

  const deleteStaffHolidayMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/staff-holidays/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      toast({ title: "Success", description: "Staff holiday deleted successfully" });
      setStaffHolidayToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete staff holiday",
        variant: "destructive",
      });
      setStaffHolidayToDelete(null);
    },
  });

  const deleteBankHolidayMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/bank-holidays/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-holidays"] });
      toast({ title: "Success", description: "Bank holiday deleted successfully" });
      setBankHolidayToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete bank holiday",
        variant: "destructive",
      });
      setBankHolidayToDelete(null);
    },
  });

  const getStaffName = (staffId: string) => {
    const staffMember = staff.find((s) => s.id === staffId);
    return staffMember?.name || "Unknown";
  };

  if (loadingStaffHolidays || loadingBankHolidays) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <>
      <Tabs defaultValue="my-holiday" className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="my-holiday" data-testid="tab-my-holiday">
            My Holiday
          </TabsTrigger>
          {canApprove && (
            <TabsTrigger value="requests" data-testid="tab-requests">
              Requests
              {pendingRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canApprove && (
            <TabsTrigger value="allowances" data-testid="tab-allowances">
              Allowances
            </TabsTrigger>
          )}
          <TabsTrigger value="staff-holidays" data-testid="tab-staff-holidays">
            All Staff Holidays
          </TabsTrigger>
          <TabsTrigger value="bank-holidays" data-testid="tab-bank-holidays">
            Bank Holidays
          </TabsTrigger>
        </TabsList>

        {/* My Holiday */}
        <TabsContent value="my-holiday" className="mt-6">
          {!me?.staff || !me?.summary ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Your login isn't linked to a staff profile yet, so you can't request holidays.
                Please ask a manager to link your account.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Allowance ({me.year})</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-allowance-total">
                      {me.summary.allowance}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Used</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-allowance-used">
                      {me.summary.used}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Pending</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-allowance-pending">
                      {me.summary.pending}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Remaining</CardDescription>
                    <CardTitle className="text-2xl" data-testid="text-allowance-remaining">
                      {me.summary.remaining}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle>My Requests &amp; Holidays</CardTitle>
                      <CardDescription>
                        Your time off for {me.year}. Holiday days exclude weekends and bank holidays.
                      </CardDescription>
                    </div>
                    <HolidayRequestDialog
                      trigger={
                        <Button data-testid="button-request-holiday">
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Request Time Off
                        </Button>
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {me.holidays.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No holidays or requests yet for {me.year}.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {me.holidays.map((h) => (
                          <TableRow key={h.id} data-testid={`row-my-holiday-${h.id}`}>
                            <TableCell>{holidayTypeBadge(h.holidayType)}</TableCell>
                            <TableCell>{formatRange(h)}</TableCell>
                            <TableCell>{h.holidayType === "holiday" ? h.days : "-"}</TableCell>
                            <TableCell>{statusBadge(h.status)}</TableCell>
                            <TableCell className="max-w-xs truncate">{h.notes || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Requests (approver) */}
        {canApprove && (
          <TabsContent value="requests" className="mt-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Requests</CardTitle>
                  <CardDescription>Review and approve or decline staff time-off requests.</CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pending requests.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.map((r) => (
                          <TableRow key={r.id} data-testid={`row-request-${r.id}`}>
                            <TableCell className="font-medium">{r.staffName}</TableCell>
                            <TableCell>{holidayTypeBadge(r.holidayType)}</TableCell>
                            <TableCell>{formatRange(r)}</TableCell>
                            <TableCell>{r.holidayType === "holiday" ? r.days : "-"}</TableCell>
                            <TableCell className="max-w-xs truncate">{r.notes || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => reviewMutation.mutate({ id: r.id, action: "approve" })}
                                  disabled={reviewMutation.isPending}
                                  data-testid={`button-approve-${r.id}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => reviewMutation.mutate({ id: r.id, action: "decline" })}
                                  disabled={reviewMutation.isPending}
                                  data-testid={`button-decline-${r.id}`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Decline
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reviewed Requests</CardTitle>
                  <CardDescription>Previously approved or declined requests.</CardDescription>
                </CardHeader>
                <CardContent>
                  {reviewedRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No reviewed requests yet.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reviewedRequests.map((r) => (
                          <TableRow key={r.id} data-testid={`row-reviewed-${r.id}`}>
                            <TableCell className="font-medium">{r.staffName}</TableCell>
                            <TableCell>{holidayTypeBadge(r.holidayType)}</TableCell>
                            <TableCell>{formatRange(r)}</TableCell>
                            <TableCell>{r.holidayType === "holiday" ? r.days : "-"}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* Allowances (approver) */}
        {canApprove && (
          <TabsContent value="allowances" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Holiday Allowances {allowancesData ? `(${allowancesData.year})` : ""}</CardTitle>
                <CardDescription>
                  Per-staff allowance usage for the calendar year. Counts approved holiday days only.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!allowancesData || allowancesData.allowances.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No staff found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-right">Allowance</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allowancesData.allowances.map((a) => (
                        <TableRow key={a.staffId} data-testid={`row-allowance-${a.staffId}`}>
                          <TableCell className="font-medium">{a.staffName}</TableCell>
                          <TableCell className="text-right">
                            {editingAllowanceId === a.staffId ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={editAllowanceValue}
                                  onChange={(e) => setEditAllowanceValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveAllowance(a.staffId);
                                    if (e.key === "Escape") setEditingAllowanceId(null);
                                  }}
                                  autoFocus
                                  className="h-8 w-20 text-right"
                                  data-testid={`input-allowance-${a.staffId}`}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-600"
                                  onClick={() => saveAllowance(a.staffId)}
                                  disabled={updateAllowanceMutation.isPending}
                                  title="Save"
                                  data-testid={`button-save-allowance-${a.staffId}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={() => setEditingAllowanceId(null)}
                                  title="Cancel"
                                  data-testid={`button-cancel-allowance-${a.staffId}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <span data-testid={`text-allowance-${a.staffId}`}>{a.allowance}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground"
                                  onClick={() => {
                                    setEditingAllowanceId(a.staffId);
                                    setEditAllowanceValue(String(a.allowance));
                                  }}
                                  title="Edit allowance"
                                  data-testid={`button-edit-allowance-${a.staffId}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{a.used}</TableCell>
                          <TableCell className="text-right">{a.pending}</TableCell>
                          <TableCell className="text-right font-medium">{a.remaining}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* All Staff Holidays (manager-entered) */}
        <TabsContent value="staff-holidays" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle>All Staff Holidays</CardTitle>
                  <CardDescription>
                    Manage individual staff member holidays, sick leave, and other absences
                  </CardDescription>
                </div>
                <StaffHolidayFormDialog
                  trigger={
                    <Button data-testid="button-add-staff-holiday">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Staff Holiday
                    </Button>
                  }
                />
              </div>
            </CardHeader>
            <CardContent>
              {staffHolidays.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No staff holidays recorded
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffHolidays.map((holiday) => (
                      <TableRow key={holiday.id} data-testid={`row-staff-holiday-${holiday.id}`}>
                        <TableCell className="font-medium">
                          {getStaffName(holiday.staffId)}
                        </TableCell>
                        <TableCell>{holidayTypeBadge(holiday.holidayType)}</TableCell>
                        <TableCell>{formatRange(holiday)}</TableCell>
                        <TableCell>{statusBadge(holiday.status)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {holiday.notes || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setStaffHolidayToEdit(holiday)}
                              data-testid={`button-edit-staff-holiday-${holiday.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setStaffHolidayToDelete(holiday.id)}
                              data-testid={`button-delete-staff-holiday-${holiday.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bank Holidays */}
        <TabsContent value="bank-holidays" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle>Bank Holidays</CardTitle>
                  <CardDescription>
                    Manage company-wide bank holidays when no work is scheduled
                  </CardDescription>
                </div>
                <BankHolidayFormDialog
                  trigger={
                    <Button data-testid="button-add-bank-holiday">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Bank Holiday
                    </Button>
                  }
                />
              </div>
            </CardHeader>
            <CardContent>
              {bankHolidays.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No bank holidays recorded
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankHolidays.map((holiday) => (
                      <TableRow key={holiday.id} data-testid={`row-bank-holiday-${holiday.id}`}>
                        <TableCell className="font-medium">
                          {format(new Date(holiday.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>{holiday.name}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {holiday.description || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setBankHolidayToEdit(holiday)}
                              data-testid={`button-edit-bank-holiday-${holiday.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setBankHolidayToDelete(holiday.id)}
                              data-testid={`button-delete-bank-holiday-${holiday.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {staffHolidayToEdit && (
        <StaffHolidayFormDialog
          holiday={staffHolidayToEdit}
          onClose={() => setStaffHolidayToEdit(null)}
        />
      )}

      {bankHolidayToEdit && (
        <BankHolidayFormDialog
          holiday={bankHolidayToEdit}
          onClose={() => setBankHolidayToEdit(null)}
        />
      )}

      <AlertDialog open={staffHolidayToDelete !== null} onOpenChange={() => setStaffHolidayToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Holiday</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this staff holiday? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-staff-holiday">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => staffHolidayToDelete && deleteStaffHolidayMutation.mutate(staffHolidayToDelete)}
              data-testid="button-confirm-delete-staff-holiday"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bankHolidayToDelete !== null} onOpenChange={() => setBankHolidayToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Holiday</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bank holiday? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bank-holiday">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bankHolidayToDelete && deleteBankHolidayMutation.mutate(bankHolidayToDelete)}
              data-testid="button-confirm-delete-bank-holiday"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function HolidayManagement() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Holiday Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Request time off, manage approvals, and track holiday allowances
            </p>
          </div>
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <HolidaysManagement />
      </div>
    </div>
  );
}

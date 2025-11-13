import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Calendar } from "lucide-react";
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

export default function HolidayManagement() {
  const { toast } = useToast();
  const [staffHolidayToDelete, setStaffHolidayToDelete] = useState<string | null>(null);
  const [staffHolidayToEdit, setStaffHolidayToEdit] = useState<StaffHoliday | null>(null);
  const [bankHolidayToDelete, setBankHolidayToDelete] = useState<string | null>(null);
  const [bankHolidayToEdit, setBankHolidayToEdit] = useState<BankHoliday | null>(null);

  const { data: staffHolidays = [], isLoading: loadingStaffHolidays } = useQuery<StaffHoliday[]>({
    queryKey: ["/api/staff-holidays"],
  });

  const { data: bankHolidays = [], isLoading: loadingBankHolidays } = useQuery<BankHoliday[]>({
    queryKey: ["/api/bank-holidays"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const deleteStaffHolidayMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/staff-holidays/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays"] });
      toast({
        title: "Success",
        description: "Staff holiday deleted successfully",
      });
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
      toast({
        title: "Success",
        description: "Bank holiday deleted successfully",
      });
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

  const getHolidayTypeBadge = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      holiday: "default",
      sick: "destructive",
      other: "secondary",
    };
    return <Badge variant={variants[type] || "secondary"}>{type}</Badge>;
  };

  if (loadingStaffHolidays || loadingBankHolidays) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Holiday Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage staff holidays and bank holidays that affect scheduling
            </p>
          </div>
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>

        <Tabs defaultValue="staff-holidays" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="staff-holidays" data-testid="tab-staff-holidays">
              Staff Holidays
            </TabsTrigger>
            <TabsTrigger value="bank-holidays" data-testid="tab-bank-holidays">
              Bank Holidays
            </TabsTrigger>
          </TabsList>

          <TabsContent value="staff-holidays" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Staff Holidays</CardTitle>
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
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
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
                          <TableCell>{getHolidayTypeBadge(holiday.holidayType)}</TableCell>
                          <TableCell>
                            {format(new Date(holiday.startDate), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            {format(new Date(holiday.endDate), "dd MMM yyyy")}
                          </TableCell>
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

          <TabsContent value="bank-holidays" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
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
      </div>
    </div>
  );
}

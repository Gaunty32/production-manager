import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StaffMachineAllocationDialog } from "@/components/StaffMachineAllocationDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit } from "lucide-react";
import type { StaffMachineAllocation, Staff } from "@shared/schema";
import { MACHINE_NAMES } from "@shared/machines";
import { format } from "date-fns";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function StaffMachineAllocations() {
  const { toast } = useToast();

  const { data: allocations = [], isLoading } = useQuery<StaffMachineAllocation[]>({
    queryKey: ["/api/staff-machine-allocations"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/staff-machine-allocations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-machine-allocations"] });
      toast({
        title: "Success",
        description: "Staff allocation deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete allocation",
        variant: "destructive",
      });
    },
  });

  const getStaffName = (staffId: string) => {
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember?.name || "Unknown";
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Staff Machine Allocations</h2>
        <StaffMachineAllocationDialog />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead>Recurring</TableHead>
              <TableHead>Days of Week</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Loading allocations...
                </TableCell>
              </TableRow>
            ) : allocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No allocations found. Add an allocation to get started.
                </TableCell>
              </TableRow>
            ) : (
              allocations.map((allocation) => (
                <TableRow key={allocation.id}>
                  <TableCell className="font-medium">{getStaffName(allocation.staffId)}</TableCell>
                  <TableCell>{MACHINE_NAMES[allocation.machineId]}</TableCell>
                  <TableCell>{format(new Date(allocation.date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{formatTime(allocation.startTime)}</TableCell>
                  <TableCell>{formatTime(allocation.endTime)}</TableCell>
                  <TableCell>
                    {allocation.isRecurring ? (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {allocation.recurringDaysOfWeek && allocation.recurringDaysOfWeek.length > 0
                      ? allocation.recurringDaysOfWeek
                          .sort((a, b) => a - b)
                          .map(day => DAYS_OF_WEEK[day])
                          .join(", ")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <StaffMachineAllocationDialog
                        allocation={allocation}
                        trigger={
                          <Button variant="ghost" size="icon" data-testid={`button-edit-${allocation.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(allocation.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${allocation.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

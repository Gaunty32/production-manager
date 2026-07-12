import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertStaffMachineAllocationSchema, type InsertStaffMachineAllocation, type StaffMachineAllocation, type Staff } from "@shared/schema";
import { MACHINE_NAMES } from "@shared/machines";
import { Plus, UserCog } from "lucide-react";
import { format } from "date-fns";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface StaffMachineAllocationDialogProps {
  allocation?: StaffMachineAllocation;
  trigger?: React.ReactNode;
}

export function StaffMachineAllocationDialog({ allocation, trigger }: StaffMachineAllocationDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const form = useForm<InsertStaffMachineAllocation>({
    resolver: zodResolver(insertStaffMachineAllocationSchema),
    defaultValues: allocation
      ? {
          staffId: allocation.staffId,
          machineId: allocation.machineId,
          date: format(new Date(allocation.date), 'yyyy-MM-dd'),
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          isRecurring: allocation.isRecurring || false,
          recurringDaysOfWeek: allocation.recurringDaysOfWeek || [],
        }
      : {
          staffId: "",
          machineId: 1,
          date: format(new Date(), 'yyyy-MM-dd'),
          startTime: 540, // 9:00 AM
          endTime: 1020, // 5:00 PM
          isRecurring: false,
          recurringDaysOfWeek: [],
        },
  });

  const isRecurring = form.watch("isRecurring");
  const recurringDays = form.watch("recurringDaysOfWeek") || [];

  const createMutation = useMutation({
    mutationFn: async (data: InsertStaffMachineAllocation) => {
      const res = await apiRequest("POST", "/api/staff-machine-allocations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-machine-allocations"] });
      toast({
        title: "Success",
        description: "Staff allocation created successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create allocation",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertStaffMachineAllocation) => {
      const res = await apiRequest("PATCH", `/api/staff-machine-allocations/${allocation?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-machine-allocations"] });
      toast({
        title: "Success",
        description: "Staff allocation updated successfully",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update allocation",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertStaffMachineAllocation) => {
    if (allocation) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const parseTime = (timeString: string): number => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const toggleDay = (dayValue: number) => {
    const currentDays = recurringDays || [];
    if (currentDays.includes(dayValue)) {
      form.setValue("recurringDaysOfWeek", currentDays.filter(d => d !== dayValue));
    } else {
      form.setValue("recurringDaysOfWeek", [...currentDays, dayValue].sort());
    }
  };

  const selectMonFri = () => {
    form.setValue("recurringDaysOfWeek", [1, 2, 3, 4, 5]);
  };

  const selectMonSat = () => {
    form.setValue("recurringDaysOfWeek", [1, 2, 3, 4, 5, 6]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="button-add-allocation">
            <Plus className="mr-2 h-4 w-4" />
            Add Allocation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{allocation ? "Edit Staff Allocation" : "Add Staff Allocation"}</DialogTitle>
          <DialogDescription>
            Allocate a staff member to a machine during specific time periods.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="staffId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Staff Member</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-staff">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staff.filter((s) => s.active !== false).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="machineId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machine</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-machine">
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(MACHINE_NAMES).map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={formatTime(field.value)}
                        onChange={(e) => field.onChange(parseTime(e.target.value))}
                        data-testid="input-start-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={formatTime(field.value)}
                        onChange={(e) => field.onChange(parseTime(e.target.value))}
                        data-testid="input-end-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-recurring"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Recurring Allocation</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {isRecurring && (
              <FormField
                control={form.control}
                name="recurringDaysOfWeek"
                render={() => (
                  <FormItem>
                    <FormLabel>Days of Week</FormLabel>
                    <div className="flex gap-2 mb-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectMonFri}
                        data-testid="button-mon-fri"
                      >
                        Mon-Fri
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectMonSat}
                        data-testid="button-mon-sat"
                      >
                        Mon-Sat
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <div key={day.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`day-${day.value}`}
                            checked={recurringDays.includes(day.value)}
                            onCheckedChange={() => toggleDay(day.value)}
                            data-testid={`checkbox-day-${day.value}`}
                          />
                          <label
                            htmlFor={`day-${day.value}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {day.label}
                          </label>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {allocation ? "Update" : "Create"} Allocation
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

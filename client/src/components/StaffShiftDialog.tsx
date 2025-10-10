import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff, StaffShift } from "@shared/schema";
import { Clock } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const shiftFormSchema = z.object({
  staffId: z.string().min(1, "Please select a staff member"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be in HH:MM format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time must be in HH:MM format"),
  isRecurring: z.boolean().default(false),
  replicateDays: z.array(z.number()).default([]),
}).refine(
  (data) => {
    const [startHours, startMins] = data.startTime.split(':').map(Number);
    const [endHours, endMins] = data.endTime.split(':').map(Number);
    const startMinutes = startHours * 60 + startMins;
    const endMinutes = endHours * 60 + endMins;
    return startMinutes < endMinutes;
  },
  {
    message: "End time must be after start time",
    path: ["endTime"],
  }
);

type ShiftFormValues = z.infer<typeof shiftFormSchema>;

interface StaffShiftDialogProps {
  trigger?: React.ReactNode;
  shift?: StaffShift;
  onSuccess?: () => void;
}

export function StaffShiftDialog({ trigger, shift, onSuccess }: StaffShiftDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const timeToMinutes = (time: string): number => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: shift
      ? {
          staffId: shift.staffId,
          date: new Date(shift.date).toISOString().split('T')[0],
          startTime: minutesToTime(shift.startTime),
          endTime: minutesToTime(shift.endTime),
          isRecurring: shift.isRecurring,
          replicateDays: [],
        }
      : {
          staffId: "",
          date: new Date().toISOString().split('T')[0],
          startTime: "09:00",
          endTime: "17:00",
          isRecurring: false,
          replicateDays: [],
        },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff-shifts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-shifts"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Staff shift created successfully",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create shift",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/staff-shifts/${shift?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-shifts"] });
      setOpen(false);
      toast({
        title: "Success",
        description: "Staff shift updated successfully",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update shift",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (values: ShiftFormValues) => {
    if (shift) {
      // Update existing shift - keep the existing recurringDayOfWeek
      const data = {
        staffId: values.staffId,
        date: values.date,
        startTime: timeToMinutes(values.startTime),
        endTime: timeToMinutes(values.endTime),
        isRecurring: values.isRecurring,
        recurringDayOfWeek: values.isRecurring && shift.recurringDayOfWeek 
          ? shift.recurringDayOfWeek 
          : null,
      };
      updateMutation.mutate(data);
    } else if (values.replicateDays.length > 0) {
      // Create shifts for selected days of the week
      const baseDate = new Date(values.date);
      const shifts = [];
      
      // Get the day of week for the selected date
      const selectedDayOfWeek = baseDate.getDay();
      
      for (const targetDay of values.replicateDays) {
        const shiftDate = new Date(baseDate);
        // Calculate days to add to reach target day
        let daysToAdd = targetDay - selectedDayOfWeek;
        if (daysToAdd < 0) daysToAdd += 7; // If target day is earlier in week, go to next week
        
        shiftDate.setDate(baseDate.getDate() + daysToAdd);
        
        shifts.push({
          staffId: values.staffId,
          date: shiftDate.toISOString().split('T')[0],
          startTime: timeToMinutes(values.startTime),
          endTime: timeToMinutes(values.endTime),
          isRecurring: values.isRecurring,
          recurringDayOfWeek: values.isRecurring 
            ? targetDay
            : null,
        });
      }
      
      try {
        for (const shiftData of shifts) {
          await apiRequest("POST", "/api/staff-shifts", shiftData);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/staff-shifts"] });
        setOpen(false);
        form.reset();
        toast({
          title: "Success",
          description: `Created ${shifts.length} shift${shifts.length > 1 ? 's' : ''} for selected days`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to create shifts",
          variant: "destructive",
        });
      }
    } else {
      // Create single shift - use the day of week from the selected date if recurring
      const shiftDate = new Date(values.date);
      const data = {
        staffId: values.staffId,
        date: values.date,
        startTime: timeToMinutes(values.startTime),
        endTime: timeToMinutes(values.endTime),
        isRecurring: values.isRecurring,
        recurringDayOfWeek: values.isRecurring ? shiftDate.getDay() : null,
      };
      createMutation.mutate(data);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const isRecurring = form.watch("isRecurring");
  const replicateDays = form.watch("replicateDays");

  const toggleDay = (dayValue: number) => {
    const currentDays = form.getValues("replicateDays");
    if (currentDays.includes(dayValue)) {
      form.setValue("replicateDays", currentDays.filter(d => d !== dayValue));
    } else {
      form.setValue("replicateDays", [...currentDays, dayValue].sort());
    }
  };

  const selectWeekdays = () => {
    form.setValue("replicateDays", [1, 2, 3, 4, 5]); // Mon-Fri
  };

  const selectWeekdaysAndSaturday = () => {
    form.setValue("replicateDays", [1, 2, 3, 4, 5, 6]); // Mon-Sat
  };

  const clearDays = () => {
    form.setValue("replicateDays", []);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-add-shift">
            <Clock className="mr-2 h-4 w-4" />
            Add Shift
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-staff-shift">
        <DialogHeader>
          <DialogTitle>{shift ? "Edit" : "Add"} Staff Shift</DialogTitle>
          <DialogDescription>
            {shift ? "Update" : "Create"} a working shift for a staff member
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
                      {staff.map((s) => (
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
                      <Input {...field} type="time" data-testid="input-start-time" />
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
                      <Input {...field} type="time" data-testid="input-end-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!shift && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <FormLabel>Select Days of Week</FormLabel>
                  <FormDescription className="text-xs">
                    Choose which days this shift should be created for
                  </FormDescription>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectWeekdays}
                    data-testid="button-select-weekdays"
                  >
                    Mon-Fri
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectWeekdaysAndSaturday}
                    data-testid="button-select-weekdays-sat"
                  >
                    Mon-Sat
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearDays}
                    data-testid="button-clear-days"
                  >
                    Clear
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`day-${day.value}`}
                        checked={replicateDays.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                        data-testid={`checkbox-day-${day.value}`}
                      />
                      <label
                        htmlFor={`day-${day.value}`}
                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {day.label.substring(0, 3)}
                      </label>
                    </div>
                  ))}
                </div>

                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Make Recurring</FormLabel>
                        <FormDescription>
                          Repeat these shifts every week on the selected days
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-recurring"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
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
                data-testid="button-save"
              >
                {shift ? "Update" : "Create"} Shift
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

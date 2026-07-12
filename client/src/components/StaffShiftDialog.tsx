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
  selectedDays: z.array(z.number()).default([]),
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
).refine(
  (data) => {
    if (data.isRecurring) {
      return data.selectedDays.length > 0;
    }
    return true;
  },
  {
    message: "At least one day must be selected for recurring shifts",
    path: ["selectedDays"],
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
          selectedDays: shift.recurringDaysOfWeek || [],
        }
      : {
          staffId: "",
          date: new Date().toISOString().split('T')[0],
          startTime: "09:00",
          endTime: "17:00",
          isRecurring: false,
          selectedDays: [],
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
    const data = {
      staffId: values.staffId,
      date: values.date,
      startTime: timeToMinutes(values.startTime),
      endTime: timeToMinutes(values.endTime),
      isRecurring: values.isRecurring,
      recurringDaysOfWeek: values.isRecurring && values.selectedDays.length > 0 
        ? values.selectedDays 
        : null,
    };

    if (shift) {
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

  const isRecurring = form.watch("isRecurring");
  const selectedDays = form.watch("selectedDays");

  const toggleDay = (dayValue: number) => {
    const currentDays = form.getValues("selectedDays");
    if (currentDays.includes(dayValue)) {
      form.setValue("selectedDays", currentDays.filter(d => d !== dayValue));
    } else {
      form.setValue("selectedDays", [...currentDays, dayValue].sort());
    }
  };

  const selectWeekdays = () => {
    form.setValue("selectedDays", [1, 2, 3, 4, 5]); // Mon-Fri
  };

  const selectWeekdaysAndSaturday = () => {
    form.setValue("selectedDays", [1, 2, 3, 4, 5, 6]); // Mon-Sat
  };

  const clearDays = () => {
    form.setValue("selectedDays", []);
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

            <FormField
              control={form.control}
              name="selectedDays"
              render={() => (
                <FormItem>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <FormLabel>Working Days</FormLabel>
                      <FormDescription className="text-xs">
                        Select which days of the week this shift applies to
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
                            checked={selectedDays.includes(day.value)}
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
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Recurring Shift</FormLabel>
                    <FormDescription>
                      Repeat this shift every week on the selected days
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

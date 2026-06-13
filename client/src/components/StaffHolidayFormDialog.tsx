import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { StaffHoliday, Staff } from "@shared/schema";

type HolidayTypeValue = "holiday" | "sick" | "other";

const formSchema = z.object({
  staffId: z.string().min(1, "Staff member is required"),
  holidayType: z.enum(["holiday", "sick", "other"]),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  halfDayStart: z.boolean(),
  halfDayEnd: z.boolean(),
  notes: z.string().optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

type FormValues = z.infer<typeof formSchema>;

interface StaffHolidayFormDialogProps {
  holiday?: StaffHoliday | null;
  trigger?: React.ReactNode;
  onClose?: () => void;
}

export function StaffHolidayFormDialog({
  holiday,
  trigger,
  onClose,
}: StaffHolidayFormDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(!!holiday);

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      staffId: holiday?.staffId || "",
      holidayType: (holiday?.holidayType as HolidayTypeValue) || "holiday",
      startDate: holiday?.startDate ? new Date(holiday.startDate) : undefined,
      endDate: holiday?.endDate ? new Date(holiday.endDate) : undefined,
      halfDayStart: holiday?.halfDayStart ?? false,
      halfDayEnd: holiday?.halfDayEnd ?? false,
      notes: holiday?.notes || "",
    },
  });

  useEffect(() => {
    if (holiday) {
      setOpen(true);
      form.reset({
        staffId: holiday.staffId,
        holidayType: holiday.holidayType as HolidayTypeValue,
        startDate: new Date(holiday.startDate),
        endDate: new Date(holiday.endDate),
        halfDayStart: holiday.halfDayStart ?? false,
        halfDayEnd: holiday.halfDayEnd ?? false,
        notes: holiday.notes || "",
      });
    }
  }, [holiday, form]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff-holidays", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/requests"] });
      toast({
        title: "Success",
        description: "Staff holiday added successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add staff holiday",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/staff-holidays/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/requests"] });
      toast({
        title: "Success",
        description: "Staff holiday updated successfully",
      });
      setOpen(false);
      form.reset();
      onClose?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update staff holiday",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    const isHoliday = values.holidayType === "holiday";
    const payload = {
      staffId: values.staffId,
      holidayType: values.holidayType,
      startDate: values.startDate.toISOString(),
      endDate: values.endDate.toISOString(),
      halfDayStart: isHoliday ? values.halfDayStart : false,
      halfDayEnd: isHoliday ? values.halfDayEnd : false,
      notes: values.notes,
    };

    if (holiday) {
      updateMutation.mutate({ id: holiday.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {holiday ? "Edit Staff Holiday" : "Add Staff Holiday"}
          </DialogTitle>
          <DialogDescription>
            {holiday
              ? "Update the staff holiday details below"
              : "Add a new staff holiday or absence"}
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!holiday}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-staff-member">
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
              name="holidayType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-holiday-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-start-date"
                          >
                            {field.value ? (
                              format(field.value, "dd MMM yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-end-date"
                          >
                            {field.value ? (
                              format(field.value, "dd MMM yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.watch("holidayType") === "holiday" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="halfDayStart"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2 rounded-md border p-3">
                      <FormLabel className="text-sm font-normal">
                        Half day on first day
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-half-day-start"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="halfDayEnd"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2 rounded-md border p-3">
                      <FormLabel className="text-sm font-normal">
                        Half day on last day
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-half-day-end"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes..."
                      className="resize-none"
                      rows={3}
                      data-testid="input-notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : holiday
                  ? "Update"
                  : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

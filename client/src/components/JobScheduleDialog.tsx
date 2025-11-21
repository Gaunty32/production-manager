import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertJobScheduleSchema, type JobWithLineItems, type Staff, type JobLineItem } from "@shared/schema";
import { MACHINE_NAMES, suggestMachine } from "@shared/machines";
import { Plus, Loader2, AlertCircle } from "lucide-react";

// Helper to format minutes to HH:MM
const formatTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

const formSchema = z.object({
  jobId: z.string().min(1, "Job is required"),
  lineItemId: z.string().optional(), // Optional to allow submission without line item if using old workflow
  machineId: z.coerce.number(),
  staffId: z.string().min(1, "Staff member is required"),
  scheduledDate: z.string().min(1, "Date is required"),
  startTime: z.coerce.number().min(0).max(1439),
  endTime: z.coerce.number().min(0).max(1439),
  status: z.string().default("scheduled"),
  selectedSlot: z.string().optional(), // Optional - can use manual times instead
}).refine((data) => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"],
});

type FormData = z.infer<typeof formSchema>;

interface AvailableSlot {
  date: string;
  startTime: number;
  endTime: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  durationMinutes: number;
  availableMinutes: number;
}

interface JobScheduleDialogProps {
  preselectedJobId?: string;
  preselectedMachineId?: number;
  preselectedDate?: string;
  preselectedStartTime?: number;
  onScheduleCreated?: () => void;
}

export function JobScheduleDialog({
  preselectedJobId,
  preselectedMachineId,
  preselectedDate,
  preselectedStartTime,
  onScheduleCreated,
}: JobScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [useManualTime, setUseManualTime] = useState(false);
  const { toast } = useToast();

  const { data: jobs = [] } = useQuery<JobWithLineItems[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobId: preselectedJobId || "",
      lineItemId: "",
      machineId: preselectedMachineId || 1,
      staffId: "",
      scheduledDate: preselectedDate || new Date().toISOString().split("T")[0],
      startTime: 480,
      endTime: 540,
      status: "scheduled",
      selectedSlot: "",
    },
  });

  // Get selected job and its line items
  const selectedJobId = form.watch("jobId");
  const selectedLineItemId = form.watch("lineItemId");
  const selectedMachineId = form.watch("machineId");
  const selectedStaffId = form.watch("staffId");
  const selectedDate = form.watch("scheduledDate");

  const selectedJob = jobs.find(job => job.id === selectedJobId);
  const unscheduledJobs = jobs.filter(job => !job.completed);

  // Get line items for selected job
  const lineItems = selectedJob?.lineItems || [];
  const selectedLineItem = lineItems.find(item => item.id === selectedLineItemId);

  // Auto-suggest machine based on line item assignment or quantity
  useEffect(() => {
    if (selectedLineItem && !preselectedMachineId) {
      // First priority: use machine already assigned to the line item
      if (selectedLineItem.machineId) {
        form.setValue("machineId", selectedLineItem.machineId);
      } else {
        // Second priority: suggest based on quantity and job type
        const suggestedMachine = suggestMachine(selectedLineItem.quantity, selectedLineItem.jobType);
        if (suggestedMachine) {
          form.setValue("machineId", suggestedMachine);
        }
      }
    }
  }, [selectedLineItemId, selectedLineItem, preselectedMachineId, form]);

  // Fetch available slots when all parameters are ready AND not in manual mode
  const shouldFetchSlots = !useManualTime && selectedLineItemId && selectedMachineId && selectedStaffId && selectedDate;
  
  const { data: availableSlotsData, isLoading: isLoadingSlots, error: slotsError } = useQuery({
    queryKey: ["/api/scheduling/available-slots", selectedLineItemId, selectedMachineId, selectedStaffId, selectedDate],
    enabled: !!shouldFetchSlots,
    retry: 1,
    queryFn: async () => {
      const endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 7); // Look 7 days ahead
      
      const params = new URLSearchParams({
        lineItemId: selectedLineItemId!,
        machineId: selectedMachineId!.toString(),
        staffId: selectedStaffId!,
        startDate: selectedDate,
        endDate: endDate.toISOString().split('T')[0],
      });
      
      const response = await fetch(`/api/scheduling/available-slots?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch available slots');
      }
      return response.json();
    },
  });

  const availableSlots: AvailableSlot[] = availableSlotsData?.availableSlots || [];

  // Handle slot selection
  const handleSlotSelection = (slotKey: string) => {
    const slot = availableSlots.find(s => 
      `${s.date}-${s.startTime}-${s.endTime}` === slotKey
    );
    
    if (slot) {
      form.setValue("scheduledDate", slot.date);
      form.setValue("startTime", slot.startTime);
      form.setValue("endTime", slot.endTime);
      form.setValue("selectedSlot", slotKey);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { scheduledDate, selectedSlot, ...rest } = data;
      const payload = {
        ...rest,
        scheduledDate: new Date(scheduledDate).toISOString(),
      };
      return await apiRequest("POST", "/api/job-schedules", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-schedules"] });
      toast({
        title: "Success",
        description: "Job scheduled successfully",
      });
      setOpen(false);
      form.reset();
      onScheduleCreated?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule job",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-schedule-job">
          <Plus className="h-4 w-4 mr-2" />
          Schedule Job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-job-schedule">
        <DialogHeader>
          <DialogTitle>Schedule Job</DialogTitle>
          <DialogDescription>
            Assign a job to a machine, staff member, and time slot
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="jobId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-job">
                        <SelectValue placeholder="Select a job" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unscheduledJobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.jobName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedJobId && lineItems.length > 0 && (
              <FormField
                control={form.control}
                name="lineItemId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Line Item</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-line-item">
                          <SelectValue placeholder="Select a line item" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lineItems.map((item: JobLineItem) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.jobType} - {item.quantity} units, {item.stitchCount} stitches
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedLineItem && (
                      <FormDescription>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary">{selectedLineItem.quantity} units</Badge>
                          <Badge variant="secondary">{selectedLineItem.stitchCount} stitches</Badge>
                          {selectedLineItem.quantity && selectedLineItem.jobType && suggestMachine(selectedLineItem.quantity, selectedLineItem.jobType) && (
                            <Badge variant="outline">Suggested: {MACHINE_NAMES[suggestMachine(selectedLineItem.quantity, selectedLineItem.jobType)!]}</Badge>
                          )}
                        </div>
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="machineId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machine</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-machine">
                        <SelectValue placeholder="Select a machine" />
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
                      {staff.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
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
              name="scheduledDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date" />
                  </FormControl>
                  <FormDescription>
                    Select a date to search for available time slots
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Mode Toggle - Show when line item selected AND params ready for slot fetch */}
            {selectedLineItemId && selectedMachineId && selectedStaffId && selectedDate && (
              <div className="flex items-center gap-4 py-2 border-t pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useManualTime}
                    onChange={(e) => {
                      setUseManualTime(e.target.checked);
                      if (e.target.checked) {
                        form.setValue("selectedSlot", "");
                      }
                    }}
                    className="h-4 w-4"
                    data-testid="checkbox-manual-time"
                  />
                  <span className="text-sm font-medium">Use custom time entry (skip suggested slots)</span>
                </label>
              </div>
            )}

            {/* Available Slots Selection - Only when NOT in manual mode */}
            {shouldFetchSlots && (
              <FormField
                control={form.control}
                name="selectedSlot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Available Time Slots</FormLabel>
                    {isLoadingSlots ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span>Finding available slots...</span>
                      </div>
                    ) : slotsError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {slotsError instanceof Error ? slotsError.message : "Error loading slots"}. You can use custom time entry below.
                        </AlertDescription>
                      </Alert>
                    ) : availableSlots.length === 0 ? (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          No available slots found for the selected criteria. You can use custom time entry below.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleSlotSelection(value);
                          }}
                          value={field.value}
                          className="space-y-2 max-h-64 overflow-y-auto"
                        >
                          {availableSlots.slice(0, 20).map((slot) => {
                            const slotKey = `${slot.date}-${slot.startTime}-${slot.endTime}`;
                            return (
                              <div key={slotKey} className="flex items-center space-x-2 rounded-md border p-3 hover-elevate">
                                <RadioGroupItem value={slotKey} id={slotKey} data-testid={`slot-${slotKey}`} />
                                <label htmlFor={slotKey} className="flex-1 cursor-pointer">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{new Date(slot.date).toLocaleDateString()}</span>
                                      <span className="text-sm text-muted-foreground">
                                        {slot.startTimeFormatted} - {slot.endTimeFormatted}
                                      </span>
                                    </div>
                                    <Badge variant="secondary">{slot.durationMinutes}min</Badge>
                                  </div>
                                </label>
                              </div>
                            );
                          })}
                        </RadioGroup>
                      </FormControl>
                    )}
                    {availableSlots.length > 20 && (
                      <FormDescription className="text-xs text-muted-foreground mt-2">
                        Showing first 20 of {availableSlots.length} available slots
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Manual Time Entry - Show when: manual mode enabled OR no line item OR no slots/error */}
            {useManualTime || !selectedLineItemId || (selectedLineItemId && !isLoadingSlots && (availableSlots.length === 0 || slotsError)) ? (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    {useManualTime ? "Custom Time Entry" : !selectedLineItemId ? "Time Entry" : "Custom Time Entry (No slots available)"}
                  </h4>
                  {availableSlots.length > 0 && !useManualTime && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => form.setValue("selectedSlot", "")}
                    >
                      Use suggested slots
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time (minutes)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min="0" 
                            max="1439" 
                            data-testid="input-start-time"
                            onChange={(e) => {
                              field.onChange(e);
                              form.setValue("selectedSlot", "");
                            }}
                          />
                        </FormControl>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(field.value || 0)}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time (minutes)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min="0" 
                            max="1439" 
                            data-testid="input-end-time"
                            onChange={(e) => {
                              field.onChange(e);
                              form.setValue("selectedSlot", "");
                            }}
                          />
                        </FormControl>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(field.value || 0)}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
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
                disabled={createMutation.isPending}
                data-testid="button-save"
              >
                {createMutation.isPending ? "Scheduling..." : "Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

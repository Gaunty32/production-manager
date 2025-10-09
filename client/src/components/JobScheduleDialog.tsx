import { useState } from "react";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertJobScheduleSchema, type Job, type Staff } from "@shared/schema";
import { MACHINE_NAMES } from "@shared/machines";
import { Plus } from "lucide-react";

const formSchema = z.object({
  jobId: z.string().min(1, "Job is required"),
  machineId: z.coerce.number(),
  staffId: z.string().min(1, "Staff member is required"),
  scheduledDate: z.string().min(1, "Date is required"),
  startTime: z.coerce.number().min(0).max(1439),
  endTime: z.coerce.number().min(0).max(1439),
  status: z.string().default("scheduled"),
}).refine((data) => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"],
});

type FormData = z.infer<typeof formSchema>;

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
  const { toast } = useToast();

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const unscheduledJobs = jobs.filter(job => !job.completed);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobId: preselectedJobId || "",
      machineId: preselectedMachineId || 1,
      staffId: "",
      scheduledDate: preselectedDate || new Date().toISOString().split("T")[0],
      startTime: preselectedStartTime || 480,
      endTime: preselectedStartTime ? preselectedStartTime + 60 : 540,
      status: "scheduled",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { scheduledDate, ...rest } = data;
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

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
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
                          {job.jobName} - {jobs.find(j => j.id === job.id)?.customerId}
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
                    <FormLabel>Start Time (minutes)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" max="1439" data-testid="input-start-time" />
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
                      <Input {...field} type="number" min="0" max="1439" data-testid="input-end-time" />
                    </FormControl>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(field.value || 0)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

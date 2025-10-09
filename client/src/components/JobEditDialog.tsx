import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MACHINE_NAMES } from "@shared/machines";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  stitchCount: z.coerce.number().min(1, "Stitch count must be at least 1"),
  logoApproved: z.boolean(),
  dateReceived: z.string(),
  requiredDispatchDate: z.string(),
  machineId: z.number().nullable(),
  completed: z.boolean(),
  completedOnTime: z.boolean().nullable(),
  completedById: z.string().nullable(),
  notes: z.string().optional(),
});

interface JobEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    customerId: string;
    jobName: string;
    poNumber: string | null;
    logoApproved: boolean;
    quantity: number;
    stitchCount: number;
    dateReceived: Date;
    requiredDispatchDate: Date;
    machineId: number | null;
    completed: boolean;
    completedOnTime: boolean | null;
    completedById: string | null;
    notes?: string | null;
  } | null;
  customers: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  onSubmit: (id: string, data: z.infer<typeof formSchema>) => void;
}

export function JobEditDialog({ open, onOpenChange, job, customers, staff, onSubmit }: JobEditDialogProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      jobName: "",
      poNumber: "",
      logoApproved: false,
      quantity: 1,
      stitchCount: 5000,
      dateReceived: new Date().toISOString(),
      requiredDispatchDate: new Date().toISOString(),
      machineId: null,
      completed: false,
      completedOnTime: null,
      completedById: null,
      notes: "",
    },
  });

  useEffect(() => {
    if (job) {
      form.reset({
        customerId: job.customerId,
        jobName: job.jobName,
        poNumber: job.poNumber || "",
        logoApproved: job.logoApproved,
        quantity: job.quantity,
        stitchCount: job.stitchCount,
        dateReceived: job.dateReceived.toISOString(),
        requiredDispatchDate: job.requiredDispatchDate.toISOString(),
        machineId: job.machineId,
        completed: job.completed,
        completedOnTime: job.completedOnTime,
        completedById: job.completedById,
        notes: job.notes || "",
      });
    }
  }, [job, form]);

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    if (job) {
      onSubmit(job.id, data);
      onOpenChange(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Production Order</DialogTitle>
          <DialogDescription>
            Update the details for this production order
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
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
                name="jobName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-job-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} className="font-mono" data-testid="input-edit-po-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="font-mono" data-testid="input-edit-quantity" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stitchCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stitch Count</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="font-mono" data-testid="input-edit-stitch-count" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="logoApproved"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo Approved</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "true")}
                      value={field.value ? "true" : "false"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-logo-approved">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="completed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-edit-completed"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Order Completed</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="completedById"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Completed By</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "unassigned" ? null : value)}
                      value={field.value || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-completed-by">
                          <SelectValue placeholder="Select staff member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Not assigned</SelectItem>
                        {staff.map((staffMember) => (
                          <SelectItem key={staffMember.id} value={staffMember.id}>
                            {staffMember.name}
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
                      onValueChange={(value) => field.onChange(value === "unassigned" ? null : parseInt(value))}
                      value={field.value?.toString() || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-machine">
                          <SelectValue placeholder="Select machine" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="1">{MACHINE_NAMES[1]}</SelectItem>
                        <SelectItem value="2">{MACHINE_NAMES[2]}</SelectItem>
                        <SelectItem value="3">{MACHINE_NAMES[3]}</SelectItem>
                        <SelectItem value="4">{MACHINE_NAMES[4]}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="completedOnTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Completed On Time</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "null" ? null : value === "true")}
                      value={field.value === null ? "null" : field.value ? "true" : "false"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-completed-on-time">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">Not Completed</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateReceived"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date Received</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-edit-date-received"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(new Date(field.value), "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => field.onChange(date?.toISOString())}
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
                name="requiredDispatchDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Required Dispatch Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-edit-dispatch-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(new Date(field.value), "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => field.onChange(date?.toISOString())}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Add any additional notes about this order..."
                      className="resize-none min-h-[100px]"
                      data-testid="input-edit-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-edit-cancel">
                Cancel
              </Button>
              <Button type="submit" data-testid="button-edit-submit">
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

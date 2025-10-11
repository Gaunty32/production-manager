import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CelebrationDialog } from "@/components/CelebrationDialog";

type LineItem = {
  id?: string;
  quantity: number;
  description: string;
  stitchCount: number;
  logoApproved: boolean;
  completed: boolean;
};

const formSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
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
    quantity: number;
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
  const { toast } = useToast();
  const { user } = useAuth();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [deletedLineItemIds, setDeletedLineItemIds] = useState<string[]>([]);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [celebrationOnTime, setCelebrationOnTime] = useState(true);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      jobName: "",
      poNumber: "",
      dateReceived: new Date().toISOString(),
      requiredDispatchDate: new Date().toISOString(),
      machineId: null,
      completed: false,
      completedOnTime: null,
      completedById: null,
      notes: "",
    },
  });

  // Fetch line items for the job
  const { data: fetchedLineItems } = useQuery<Array<{
    id: string;
    quantity: number;
    description: string | null;
    stitchCount: number;
    logoApproved: boolean;
    completed: boolean;
  }>>({
    queryKey: ['/api/jobs', job?.id, 'line-items'],
    enabled: !!job?.id && open,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (job) {
      form.reset({
        customerId: job.customerId,
        jobName: job.jobName,
        poNumber: job.poNumber || "",
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

  useEffect(() => {
    if (fetchedLineItems && open) {
      if (fetchedLineItems.length > 0) {
        // Job has line items - use them
        setLineItems(fetchedLineItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          description: item.description || "",
          stitchCount: item.stitchCount,
          logoApproved: item.logoApproved,
          completed: item.completed,
        })));
      } else if (job && job.quantity > 0) {
        // Old job without line items - create a default line item from job quantity
        setLineItems([{
          quantity: job.quantity,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
        }]);
      } else {
        // No line items and no quantity
        setLineItems([{
          quantity: 1,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
        }]);
      }
      setDeletedLineItemIds([]);
    }
  }, [fetchedLineItems, open, job]);

  const addLineItem = () => {
    setLineItems([...lineItems, { quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false }]);
  };

  const removeLineItem = (index: number) => {
    const item = lineItems[index];
    if (item.id) {
      setDeletedLineItemIds([...deletedLineItemIds, item.id]);
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | boolean) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const getTotalQuantity = () => {
    return lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };
  
  const allLineItemsCompleted = () => {
    return lineItems.length > 0 && lineItems.every(item => item.completed);
  };

  const allLogosApproved = lineItems.length > 0 && lineItems.every(item => item.logoApproved);

  const toggleAllLogos = (checked: boolean) => {
    setLineItems(lineItems.map(item => ({ ...item, logoApproved: checked })));
  };
  
  const isOverdue = job && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = job && isToday(job.requiredDispatchDate);

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    if (job) {
      try {
        // Check if job is being marked as complete
        const wasNotCompleted = !job.completed;
        const isNowCompleted = data.completed;
        const justCompleted = wasNotCompleted && isNowCompleted;

        // Update the main job first
        // If job is being completed, set invoiceStatus to 'ready' for draft invoicing queue
        const updateData = justCompleted 
          ? { ...data, invoiceStatus: 'ready' }
          : data;
        await apiRequest("PATCH", `/api/jobs/${job.id}`, updateData);

        // Handle line item updates
        // Delete removed line items
        for (const id of deletedLineItemIds) {
          await apiRequest("DELETE", `/api/job-line-items/${id}`);
        }

        // Create or update line items
        for (const item of lineItems) {
          if (item.id) {
            // Update existing line item
            await apiRequest("PATCH", `/api/job-line-items/${item.id}`, {
              quantity: item.quantity,
              description: item.description || null,
              stitchCount: item.stitchCount,
              logoApproved: item.logoApproved,
              completed: item.completed,
            });
          } else {
            // Create new line item
            await apiRequest("POST", `/api/jobs/${job.id}/line-items`, {
              quantity: item.quantity,
              description: item.description || null,
              stitchCount: item.stitchCount,
              logoApproved: item.logoApproved,
              completed: item.completed,
            });
          }
        }

        // All updates successful, remove cached data to force refetch
        await queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        await queryClient.invalidateQueries({ queryKey: ['/api/jobs', job.id, 'line-items'] });
        
        // If job was just completed, show celebration and award star
        if (justCompleted) {
          const requiredDate = new Date(data.requiredDispatchDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          requiredDate.setHours(0, 0, 0, 0);
          
          const isLate = today > requiredDate;
          const starType = isLate ? "red" : "yellow";
          
          // Award the star only if user is authenticated
          if (user) {
            try {
              await apiRequest("POST", `/api/users/${user.id}/stars`, { starType });
            } catch (error) {
              console.error("Failed to award star:", error);
            }
          }
          
          // Show celebration dialog and close edit dialog after celebration
          setCelebrationOnTime(!isLate);
          setCelebrationOpen(true);
          
          // Close edit dialog after a delay to allow celebration to show
          // Celebration dialog auto-closes after 3 seconds
          setTimeout(() => {
            onOpenChange(false);
          }, 3500);
        } else {
          // No celebration, close immediately
          toast({
            title: "Success",
            description: "Order updated successfully",
          });
          onOpenChange(false);
        }
      } catch (error) {
        console.error('Error updating job or line items:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to update order",
          variant: "destructive",
        });
      }
    }
  };

  if (!job) return null;

  return (
    <>
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
              {/* Required Dispatch Date - TOP PRIORITY with color indicators */}
              <FormField
                control={form.control}
                name="requiredDispatchDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className={cn(
                      "text-base font-semibold",
                      isOverdue && "text-red-600 dark:text-red-500",
                      isDueToday && !isOverdue && "text-amber-600 dark:text-amber-500"
                    )}>
                      Required Dispatch Date
                      {isOverdue && " (OVERDUE)"}
                      {isDueToday && !isOverdue && " (DUE TODAY)"}
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
                              !field.value && "text-muted-foreground",
                              isOverdue && "border-red-500 bg-red-50 dark:bg-red-950/30",
                              isDueToday && !isOverdue && "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
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

              {/* Logos Approved - Master checkbox */}
              <div className="flex flex-col">
                <label className="text-base font-semibold mb-2">Logos Approved</label>
                <div className="flex items-center space-x-3 rounded-md border p-3 h-10">
                  <Checkbox
                    id="logos-approved-edit"
                    checked={allLogosApproved}
                    onCheckedChange={toggleAllLogos}
                    data-testid="checkbox-logos-approved"
                  />
                  <label htmlFor="logos-approved-edit" className="text-sm cursor-pointer">
                    All logos approved
                  </label>
                </div>
              </div>
            </div>

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

              <div className="md:col-span-2">
                <FormLabel>Line Items</FormLabel>
                <div className="space-y-3 mt-2">
                  {lineItems.map((item, index) => (
                    <div key={index} className="border rounded-md p-3 space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Quantity</label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              updateLineItem(index, 'quantity', Math.max(1, val));
                            }}
                            placeholder="Quantity"
                            className="font-mono mt-1"
                            data-testid={`input-edit-line-item-quantity-${index}`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Stitch Count</label>
                          <Input
                            type="number"
                            min="1"
                            value={item.stitchCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              updateLineItem(index, 'stitchCount', Math.max(1, val));
                            }}
                            placeholder="Stitch count"
                            className="font-mono mt-1"
                            data-testid={`input-edit-line-item-stitch-count-${index}`}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <Checkbox
                            id={`edit-completed-${index}`}
                            checked={item.completed}
                            onCheckedChange={(checked) => updateLineItem(index, 'completed', checked === true)}
                            data-testid={`checkbox-edit-line-item-completed-${index}`}
                          />
                          <label htmlFor={`edit-completed-${index}`} className="text-sm cursor-pointer">Done</label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          data-testid={`button-edit-remove-line-item-${index}`}
                          className="mt-5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Description (e.g., Size M, Color Red)"
                          className="mt-1"
                          data-testid={`input-edit-line-item-description-${index}`}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLineItem}
                    className="w-full"
                    data-testid="button-edit-add-line-item"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line Item
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Total Quantity: <span className="font-mono font-semibold">{getTotalQuantity()}</span>
                  </p>
                </div>
              </div>

              <FormField
                control={form.control}
                name="completed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!allLineItemsCompleted()}
                        data-testid="checkbox-edit-completed"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className={!allLineItemsCompleted() ? "text-muted-foreground" : ""}>
                        Order Completed
                      </FormLabel>
                      {!allLineItemsCompleted() && (
                        <p className="text-xs text-muted-foreground">
                          All line items must be completed first
                        </p>
                      )}
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
    <CelebrationDialog
      open={celebrationOpen}
      onOpenChange={setCelebrationOpen}
      onTime={celebrationOnTime}
      staffName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Staff Member'}
    />
    </>
  );
}

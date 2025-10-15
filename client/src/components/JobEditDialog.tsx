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
import { CalendarIcon, Plus, Trash2, Info } from "lucide-react";
import { format, isPast, isToday, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CelebrationDialog } from "@/components/CelebrationDialog";

type LineItem = {
  id?: string;
  jobType: string;
  quantity: number;
  description: string;
  stitchCount: number;
  logoApproved: boolean;
  completed: boolean;
  completedById: string | null;
  completedAt: string | null;
  machineId: number | null;
  scheduleSuggestion?: {
    staffId: string;
    staffName: string;
    date: string;
    startTime: number;
    endTime: number;
  } | null;
};

const JOB_TYPES = ["Embroidery", "Print", "Bagging", "Other"] as const;

const formSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  goodsReceived: z.union([z.string(), z.null()]),
  requiredDispatchDate: z.string(),
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
    goodsReceived: Date | null;
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
      goodsReceived: "",
      requiredDispatchDate: new Date().toISOString(),
      completed: false,
      completedOnTime: null,
      completedById: null,
      notes: "",
    },
  });

  // Fetch line items for the job
  const { data: fetchedLineItems } = useQuery<Array<{
    id: string;
    jobType: string;
    quantity: number;
    description: string | null;
    stitchCount: number;
    logoApproved: boolean;
    completed: boolean;
    completedById: string | null;
    completedAt: string | null;
    machineId: number | null;
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
        goodsReceived: job.goodsReceived ? job.goodsReceived.toISOString() : "",
        requiredDispatchDate: job.requiredDispatchDate.toISOString(),
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
          jobType: item.jobType || "Embroidery", // Default to Embroidery if missing (for existing data)
          quantity: item.quantity,
          description: item.description || "",
          stitchCount: item.stitchCount,
          logoApproved: item.logoApproved,
          completed: item.completed,
          completedById: item.completedById || null,
          completedAt: item.completedAt || null,
          machineId: item.machineId || null,
        })));
      } else if (job && job.quantity > 0) {
        // Old job without line items - create a default line item from job quantity
        setLineItems([{
          jobType: "Embroidery",
          quantity: job.quantity,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
          completedById: null,
          completedAt: null,
          machineId: null,
        }]);
      } else {
        // No line items and no quantity
        setLineItems([{
          jobType: "Embroidery",
          quantity: 1,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
          completedById: null,
          completedAt: null,
          machineId: null,
        }]);
      }
      setDeletedLineItemIds([]);
    }
  }, [fetchedLineItems, open, job]);

  const addLineItem = () => {
    setLineItems([...lineItems, { jobType: "Embroidery", quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null }]);
  };

  const removeLineItem = (index: number) => {
    const item = lineItems[index];
    if (item.id) {
      setDeletedLineItemIds([...deletedLineItemIds, item.id]);
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | boolean | null) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleSuggestLineItemSchedule = async (index: number) => {
    const values = form.getValues();
    const lineItem = lineItems[index];
    
    const requiredDispatchDate = values.requiredDispatchDate;
    
    if (!lineItem.machineId) {
      toast({
        title: "Machine Required",
        description: "Please select a machine for this line item first",
        variant: "destructive",
      });
      return;
    }
    
    if (!requiredDispatchDate) {
      toast({
        title: "Dispatch Date Required",
        description: "Please select a required dispatch date first",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const suggestResponse = await apiRequest("POST", "/api/suggest-schedule", {
        machineId: lineItem.machineId,
        quantity: lineItem.quantity,
        stitchCount: lineItem.stitchCount,
        requiredDispatchDate,
      });
      const response: any = await suggestResponse.json();
      
      if (response.available) {
        const updated = [...lineItems];
        updated[index] = {
          ...updated[index],
          scheduleSuggestion: {
            staffId: response.suggestion.staffId,
            staffName: response.suggestion.staffName,
            date: response.suggestion.date,
            startTime: response.suggestion.startTime,
            endTime: response.suggestion.endTime,
          }
        };
        setLineItems(updated);
        
        toast({
          title: "Schedule Found",
          description: `Available slot: ${response.suggestion.staffName} on ${format(new Date(response.suggestion.date), 'MMM d')}`,
        });
      } else {
        toast({
          title: "No Slots Available",
          description: response.message || "No available time slot found for this line item",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to suggest schedule",
        variant: "destructive",
      });
    }
  };

  const getTotalQuantity = () => {
    return lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };
  
  const allLineItemsCompleted = () => {
    return lineItems.length > 0 && lineItems.every(item => item.completed);
  };

  // Automatically reset completed to false if any line item becomes incomplete
  useEffect(() => {
    if (form.watch('completed') && !allLineItemsCompleted()) {
      form.setValue('completed', false);
      form.setValue('completedById', null);
      form.setValue('completedOnTime', null);
    }
  }, [lineItems, form]);

  const allLogosApproved = lineItems.length > 0 && lineItems.every(item => item.logoApproved);

  const toggleAllLogos = (checked: boolean) => {
    setLineItems(lineItems.map(item => ({ ...item, logoApproved: checked })));
  };
  
  const isOverdue = job && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = job && isToday(job.requiredDispatchDate);
  
  // Calculate Production Time (days between goods received and required dispatch date)
  const requiredDispatchDate = form.watch("requiredDispatchDate");
  const goodsReceived = form.watch("goodsReceived");
  const productionTime = goodsReceived && requiredDispatchDate 
    ? differenceInCalendarDays(new Date(requiredDispatchDate), new Date(goodsReceived))
    : null;
  const isUrgent = productionTime !== null && productionTime < 3;

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
              jobType: item.jobType,
              quantity: item.quantity,
              description: item.description || null,
              stitchCount: item.stitchCount,
              logoApproved: item.logoApproved,
              completed: item.completed,
              completedById: item.completedById || null,
              completedAt: item.completedAt || null,
              machineId: item.machineId || null,
            });
          } else {
            // Create new line item
            await apiRequest("POST", `/api/jobs/${job.id}/line-items`, {
              jobType: item.jobType,
              quantity: item.quantity,
              description: item.description || null,
              stitchCount: item.stitchCount,
              logoApproved: item.logoApproved,
              completed: item.completed,
              completedById: item.completedById || null,
              completedAt: item.completedAt || null,
              machineId: item.machineId || null,
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
                          onSelect={(date) => field.onChange(date?.toISOString() || "")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Embroidery Approved - Yes/No selector */}
              <div className="flex flex-col">
                <label className="text-base font-semibold mb-2">Embroidery Approved</label>
                <Select 
                  value={allLogosApproved ? "yes" : "no"} 
                  onValueChange={(value) => toggleAllLogos(value === "yes")}
                >
                  <SelectTrigger data-testid="select-embroidery-approved-edit">
                    <SelectValue placeholder="Select approval status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
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
                          <label className="text-xs text-muted-foreground">Job Type</label>
                          <Select 
                            value={item.jobType}
                            onValueChange={(value) => updateLineItem(index, 'jobType', value)}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-job-type-${index}`}>
                              <SelectValue placeholder="Select job type" />
                            </SelectTrigger>
                            <SelectContent>
                              {JOB_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Machine</label>
                          <Select 
                            value={item.machineId?.toString() || "unassigned"}
                            onValueChange={(value) => updateLineItem(index, 'machineId', value === "unassigned" ? null : parseInt(value))}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-machine-${index}`}>
                              <SelectValue placeholder="Select machine" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Not assigned</SelectItem>
                              {[1, 2, 3, 4].map((machineNum) => (
                                <SelectItem key={machineNum} value={machineNum.toString()}>
                                  {MACHINE_NAMES[machineNum]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                      
                      {/* Schedule Suggestion for Line Item */}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSuggestLineItemSchedule(index)}
                          disabled={!item.machineId}
                          data-testid={`button-suggest-edit-line-item-schedule-${index}`}
                        >
                          Find Slot
                        </Button>
                        {item.scheduleSuggestion && (
                          <div className="text-sm text-muted-foreground">
                            {item.scheduleSuggestion.staffName} • {format(new Date(item.scheduleSuggestion.date), 'MMM d')} • {minutesToTime(item.scheduleSuggestion.startTime)}-{minutesToTime(item.scheduleSuggestion.endTime)}
                          </div>
                        )}
                      </div>
                      
                      {/* Completion Tracking - Show when item is completed */}
                      {item.completed && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <div>
                            <label className="text-xs text-muted-foreground">Completed By</label>
                            <Select 
                              value={item.completedById || "unassigned"}
                              onValueChange={(value) => updateLineItem(index, 'completedById', value === "unassigned" ? null : value)}
                            >
                              <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-completed-by-${index}`}>
                                <SelectValue placeholder="Select staff" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Not assigned</SelectItem>
                                {staff.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Completed Date</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal mt-1",
                                    !item.completedAt && "text-muted-foreground"
                                  )}
                                  data-testid={`button-edit-line-item-completed-at-${index}`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {item.completedAt ? format(new Date(item.completedAt), "PPP") : "Pick date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={item.completedAt ? new Date(item.completedAt) : undefined}
                                  onSelect={(date) => updateLineItem(index, 'completedAt', date?.toISOString() || null)}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}
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
                name="goodsReceived"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Goods Received</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-edit-goods-received"
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
                          onSelect={(date) => field.onChange(date?.toISOString() || "")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                    
                    {/* Production Time Display */}
                    {productionTime !== null && (
                      <div className={cn(
                        "mt-2 p-3 rounded-md border-2",
                        isUrgent 
                          ? "border-red-500 bg-red-50 dark:bg-red-950/30" 
                          : "border-green-500 bg-green-50 dark:bg-green-950/30"
                      )}>
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-semibold",
                            isUrgent ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"
                          )}>
                            Production Time:
                          </span>
                          <span className={cn(
                            "text-2xl font-bold",
                            isUrgent ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500"
                          )}>
                            {productionTime} {productionTime === 1 ? 'day' : 'days'}
                          </span>
                        </div>
                        {isUrgent && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                            ⚠️ URGENT ORDER - Less than 3 days production time
                          </p>
                        )}
                      </div>
                    )}
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

            {!allLineItemsCompleted() && (
              <p className="text-sm text-muted-foreground bg-muted/50 border rounded-md p-3 flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span>Complete all line items above before marking the order as completed</span>
              </p>
            )}
            
            <input type="hidden" {...form.register('completed')} />
            
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-edit-cancel">
                Cancel
              </Button>
              <Button 
                type="button" 
                variant={form.watch('completed') ? "secondary" : "default"}
                onClick={() => {
                  const isCurrentlyCompleted = form.watch('completed');
                  if (!isCurrentlyCompleted) {
                    // Marking as complete - set metadata
                    form.setValue('completed', true);
                    if (user) {
                      form.setValue('completedById', user.id);
                    }
                  } else {
                    // Unmarking - clear completion metadata
                    form.setValue('completed', false);
                    form.setValue('completedById', null);
                    form.setValue('completedOnTime', null);
                  }
                }}
                disabled={!allLineItemsCompleted() && !form.watch('completed')}
                data-testid="button-edit-mark-completed"
              >
                {form.watch('completed') ? "Unmark as Completed" : "Mark Order as Completed"}
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
      staffName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Staff Member' : 'Staff Member'}
    />
    </>
  );
}

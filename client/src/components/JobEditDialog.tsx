import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { MACHINE_NAMES } from "@shared/machines";
import { minutesToTime } from "@shared/scheduling";
import { PRINT_SIZE_CODE, CODE_TO_PRINT_SIZE } from "@shared/pricing";
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
import { ShippingInfoDialog } from "@/components/ShippingInfoDialog";

type LineItem = {
  id?: string;
  jobType: string;
  position: string | null;
  positionOther: string | null;
  quantity: number;
  description: string;
  stitchCount: number;
  logoApproved: boolean;
  completed: boolean;
  completedById: string | null;
  completedAt: string | null;
  actualProductionTimeMinutes: number | null;
  machineId: number | null;
  scheduleSuggestion?: {
    staffId: string;
    staffName: string;
    date: string;
    startTime: number;
    endTime: number;
  } | null;
};

const JOB_TYPES = ["Embroidery", "Print", "Embroidery Initials/Name", "Print Initials/Name", "Bagging", "Other"] as const;
const POSITION_OPTIONS = ["left chest", "right chest", "left sleeve", "right sleeve", "rear", "other"] as const;

const formSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  goodsReceived: z.union([z.string(), z.null()]),
  requiredDispatchDate: z.union([z.string(), z.null()]),
  completed: z.boolean(),
  completedOnTime: z.boolean().nullable(),
  completedById: z.string().nullable(),
  notes: z.string().optional(),
  shippingMethod: z.string().nullable().optional(),
  dhlTrackingNumber: z.string().nullable().optional(),
  packageCount: z.number().nullable().optional(),
  packageType: z.string().nullable().optional(),
  deliveryAddressType: z.enum(["customer", "custom", "collection", "undecided"]).optional(),
  deliveryAddress: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
}).refine(
  (data) => {
    if (data.deliveryAddressType === "custom") {
      return !!data.deliveryAddress && data.deliveryAddress.trim().length > 0;
    }
    return true;
  },
  {
    message: "Delivery address is required when using custom delivery",
    path: ["deliveryAddress"],
  }
);

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
    requiredDispatchDate: Date | null;
    machineId: number | null;
    completed: boolean;
    completedOnTime: boolean | null;
    completedById: string | null;
    notes?: string | null;
    deliveryAddressType?: string | null;
    deliveryAddress?: string | null;
  } | null;
  customers: Array<{ id: string; name: string; address?: string | null; pricingTable2025?: boolean | null; pricingTable2026?: boolean | null }>;
  staff: Array<{ id: string; name: string }>;
  onSubmit: (id: string, data: z.infer<typeof formSchema>) => void;
}

export function JobEditDialog({ open, onOpenChange, job, customers, staff, onSubmit }: JobEditDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [deletedLineItemIds, setDeletedLineItemIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [celebrationOnTime, setCelebrationOnTime] = useState(true);
  const [celebrationStaffNames, setCelebrationStaffNames] = useState<string[]>([]);
  const [shippingDialogOpen, setShippingDialogOpen] = useState(false);
  
  // Find the staff member associated with the current user
  const { data: currentUserStaff } = useQuery<{ id: string; name: string; userId: string } | null>({
    queryKey: ['/api/staff/by-user', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await fetch(`/api/staff/by-user/${user.id}`, { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 404) return null; // No staff member for this user
        throw new Error('Failed to fetch staff member');
      }
      return response.json();
    },
  });

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
      deliveryAddressType: "customer",
      deliveryAddress: "",
    },
  });

  // Fetch line items for the job
  const { data: fetchedLineItems } = useQuery<Array<{
    id: string;
    jobType: string;
    position: string | null;
    positionOther: string | null;
    quantity: number;
    description: string | null;
    stitchCount: number;
    logoApproved: boolean;
    completed: boolean;
    completedById: string | null;
    completedAt: string | null;
    actualProductionTimeMinutes: number | null;
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
        goodsReceived: job.goodsReceived ? job.goodsReceived.toISOString() : null,
        requiredDispatchDate: job.requiredDispatchDate ? job.requiredDispatchDate.toISOString() : null,
        completed: job.completed,
        completedOnTime: job.completedOnTime,
        completedById: job.completedById,
        notes: job.notes || "",
        deliveryAddressType: (job.deliveryAddressType as "customer" | "custom" | "collection" | "undecided") || "customer",
        deliveryAddress: job.deliveryAddress || "",
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
          position: item.position || null,
          positionOther: item.positionOther || null,
          quantity: item.quantity,
          description: item.description || "",
          stitchCount: item.stitchCount,
          logoApproved: item.logoApproved,
          completed: item.completed,
          completedById: item.completedById || null,
          completedAt: item.completedAt || null,
          actualProductionTimeMinutes: item.actualProductionTimeMinutes || null,
          machineId: item.machineId || null,
        })));
      } else if (job && job.quantity > 0) {
        // Old job without line items - create a default line item from job quantity
        setLineItems([{
          jobType: "Embroidery",
          position: null,
          positionOther: null,
          quantity: job.quantity,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
          completedById: null,
          completedAt: null,
          actualProductionTimeMinutes: null,
          machineId: null,
        }]);
      } else {
        // No line items and no quantity
        setLineItems([{
          jobType: "Embroidery",
          position: null,
          positionOther: null,
          quantity: 1,
          description: "",
          stitchCount: 5000,
          logoApproved: false,
          completed: false,
          completedById: null,
          completedAt: null,
          actualProductionTimeMinutes: null,
          machineId: null,
        }]);
      }
      setDeletedLineItemIds([]);
    }
  }, [fetchedLineItems, open, job]);

  const addLineItem = () => {
    setLineItems([...lineItems, { jobType: "Embroidery", position: null, positionOther: null, quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false, completedById: null, completedAt: null, actualProductionTimeMinutes: null, machineId: null }]);
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
    
    // When marking as completed, auto-fill completedById and completedAt with current user/time
    if (field === 'completed' && value === true && !updated[index].completedById) {
      updated[index].completedById = currentUserStaff?.id || null;
      updated[index].completedAt = new Date().toISOString();
    }
    
    // When unmarking as completed, clear completedById, completedAt, and actualProductionTimeMinutes
    if (field === 'completed' && value === false) {
      updated[index].completedById = null;
      updated[index].completedAt = null;
      updated[index].actualProductionTimeMinutes = null;
    }
    
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
  
  const isOverdue = job && job.requiredDispatchDate && isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = job && job.requiredDispatchDate && isToday(job.requiredDispatchDate);
  
  // Calculate Production Time (days between goods received and required dispatch date)
  const requiredDispatchDate = form.watch("requiredDispatchDate");
  const goodsReceived = form.watch("goodsReceived");
  const productionTime = goodsReceived && requiredDispatchDate 
    ? differenceInCalendarDays(new Date(requiredDispatchDate), new Date(goodsReceived))
    : null;
  const isUrgent = productionTime !== null && productionTime < 3;

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    if (isSubmitting) return; // Prevent double submission
    
    if (job) {
      setIsSubmitting(true);
      try {
        // Check if job is being marked as complete
        const wasNotCompleted = !job.completed;
        const isNowCompleted = data.completed;
        const justCompleted = wasNotCompleted && isNowCompleted;

        // Update the main job first
        // Calculate total quantity from line items
        const totalQuantity = getTotalQuantity();
        
        // If job is being completed, set invoiceStatus to 'ready' for draft invoicing queue
        const updateData = justCompleted 
          ? { ...data, quantity: totalQuantity, invoiceStatus: 'ready' }
          : { ...data, quantity: totalQuantity };
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

        // All updates successful, refetch data to ensure UI is updated
        await queryClient.refetchQueries({ queryKey: ["/api/jobs"] });
        await queryClient.invalidateQueries({ queryKey: ['/api/jobs', job.id, 'line-items'] });
        
        // If job was just completed, award stars to employees who completed line items
        if (justCompleted && data.requiredDispatchDate) {
          const requiredDate = new Date(data.requiredDispatchDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          requiredDate.setHours(0, 0, 0, 0);
          
          const isLate = today > requiredDate;
          const starType = isLate ? "red" : "yellow";
          
          // Get all unique staff IDs who completed line items
          const completedByIds = lineItems
            .filter(item => item.completed && item.completedById)
            .map(item => item.completedById!);
          const staffIdsWhoCompleted = Array.from(new Set(completedByIds));
          
          // Award stars to each staff member who completed line items
          let allStaffNamesWhoCompleted: string[] = [];
          if (staffIdsWhoCompleted.length > 0) {
            try {
              // Get staff members to find their user IDs
              const staffResponse = await apiRequest("GET", "/api/staff");
              const allStaff: any[] = await staffResponse.json();
              
              // Award star to each staff member who completed a line item
              for (const staffId of staffIdsWhoCompleted) {
                const staffMember = allStaff.find((s: any) => s.id === staffId);
                if (staffMember) {
                  // Always add to celebration names
                  allStaffNamesWhoCompleted.push(staffMember.name);
                  
                  // Only award star if they have a linked user account
                  if (staffMember.userId) {
                    try {
                      await apiRequest("POST", `/api/users/${staffMember.userId}/stars`, { starType });
                    } catch (error) {
                      console.error(`Failed to award star to ${staffMember.name}:`, error);
                    }
                  } else {
                    console.warn(`Staff member ${staffMember.name} completed line items but has no linked user account - star not awarded`);
                  }
                }
              }
            } catch (error) {
              console.error("Failed to process star awards:", error);
            }
          }
          
          // Show celebration dialog with all staff names who completed work
          setCelebrationOnTime(!isLate);
          setCelebrationStaffNames(allStaffNamesWhoCompleted);
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
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!job) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-[95vw] md:max-w-2xl max-h-[90vh] overflow-y-auto">
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
                          onSelect={(date) => field.onChange(date?.toISOString() || null)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Bulk Logo Approval Toggle */}
              <div className="flex flex-col">
                <label className="text-base font-semibold mb-2">Quick Toggle - All Logos</label>
                <Select 
                  value={allLogosApproved ? "yes" : "no"} 
                  onValueChange={(value) => toggleAllLogos(value === "yes")}
                >
                  <SelectTrigger data-testid="select-embroidery-approved-edit">
                    <SelectValue placeholder="Select approval status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Mark All Approved</SelectItem>
                    <SelectItem value="no">Mark All Pending</SelectItem>
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

              {/* Delivery Address */}
              <FormField
                control={form.control}
                name="deliveryAddressType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Address</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "customer"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-delivery-address-type">
                          <SelectValue placeholder="Select delivery option" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="customer">Ship back to customer</SelectItem>
                        <SelectItem value="custom">Custom delivery address</SelectItem>
                        <SelectItem value="collection">Customer collection</SelectItem>
                        <SelectItem value="undecided">Undecided</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Show customer address or custom address field */}
              {form.watch("deliveryAddressType") === "customer" && form.watch("customerId") && (
                <div className="border rounded-lg p-3 bg-muted/20">
                  <p className="text-sm font-medium mb-1">Customer Address:</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {customers.find(c => c.id === form.watch("customerId"))?.address || "No address on file"}
                  </p>
                </div>
              )}

              {/* Custom delivery address field */}
              {form.watch("deliveryAddressType") === "custom" && (
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Delivery Address</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""} 
                          placeholder="Enter the delivery address..."
                          className="min-h-[80px]"
                          data-testid="input-edit-delivery-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                            onValueChange={(value) => {
                              // When switching to Print, set default print size to A4
                              if (value === "Print" && item.jobType !== "Print") {
                                const updated = [...lineItems];
                                updated[index] = { 
                                  ...updated[index], 
                                  jobType: value,
                                  stitchCount: PRINT_SIZE_CODE.A4 
                                };
                                setLineItems(updated);
                              } else {
                                updateLineItem(index, 'jobType', value);
                              }
                            }}
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
                          <label className="text-xs text-muted-foreground">Position</label>
                          <Select 
                            value={item.position || ""}
                            onValueChange={(value) => {
                              updateLineItem(index, 'position', value || null);
                              // Clear positionOther if not selecting "other"
                              if (value !== "other") {
                                updateLineItem(index, 'positionOther', null);
                              }
                            }}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-position-${index}`}>
                              <SelectValue placeholder="Select position" />
                            </SelectTrigger>
                            <SelectContent>
                              {POSITION_OPTIONS.map((pos) => (
                                <SelectItem key={pos} value={pos}>
                                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                </SelectItem>
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
                          {item.jobType === "Print" ? (
                            <>
                              <label className="text-xs text-muted-foreground">Print Size</label>
                              <Select 
                                value={item.stitchCount.toString()}
                                onValueChange={(value) => updateLineItem(index, 'stitchCount', parseInt(value))}
                              >
                                <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-print-size-${index}`}>
                                  <SelectValue placeholder="Select size" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={PRINT_SIZE_CODE.A6.toString()}>A6 (1/4 A4)</SelectItem>
                                  <SelectItem value={PRINT_SIZE_CODE.A5.toString()}>A5 (1/2 A4)</SelectItem>
                                  <SelectItem value={PRINT_SIZE_CODE.A4.toString()}>A4</SelectItem>
                                  <SelectItem value={PRINT_SIZE_CODE.A3.toString()}>A3</SelectItem>
                                </SelectContent>
                              </Select>
                            </>
                          ) : item.jobType === "Print Initials/Name" || item.jobType === "Embroidery Initials/Name" ? (
                            <>
                              <label className="text-xs text-muted-foreground">Price</label>
                              <div className="mt-1 px-3 py-2 rounded-md bg-muted/30 border text-sm font-semibold text-primary">
                                £2.50 per item
                              </div>
                            </>
                          ) : item.jobType === "Bagging" ? (
                            <>
                              <label className="text-xs text-muted-foreground">Price</label>
                              <div className="mt-1 px-3 py-2 rounded-md bg-muted/30 border text-sm font-semibold text-primary">
                                {customers.find(c => c.id === job?.customerId)?.pricingTable2025 ? "£0.30 per item" : "£0.40 per item"}
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="text-xs text-muted-foreground whitespace-nowrap">Stitch Count</label>
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
                            </>
                          )}
                        </div>
                        {item.jobType !== "Print" && item.jobType !== "Print Initials/Name" && item.jobType !== "Embroidery Initials/Name" && item.jobType !== "Bagging" && (
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground">
                              Machine
                              {item.completed && (item.jobType === "Embroidery" || item.jobType === "Embroidery Initials/Name") && (
                                <span className="text-destructive ml-1">*</span>
                              )}
                            </label>
                            <Select 
                              value={item.machineId?.toString() || "unassigned"}
                              onValueChange={(value) => updateLineItem(index, 'machineId', value === "unassigned" ? null : parseInt(value))}
                            >
                              <SelectTrigger className="mt-1" data-testid={`select-edit-line-item-machine-${index}`}>
                                <SelectValue placeholder="Select machine" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Not assigned</SelectItem>
                                {[1, 2, 3, 4, 5].map((machineNum) => (
                                  <SelectItem key={machineNum} value={machineNum.toString()}>
                                    {MACHINE_NAMES[machineNum]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="flex flex-col gap-3 pt-5">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`edit-logo-approved-${index}`}
                              checked={item.logoApproved}
                              onCheckedChange={(checked) => updateLineItem(index, 'logoApproved', checked === true)}
                              data-testid={`checkbox-edit-line-item-logo-approved-${index}`}
                            />
                            <label htmlFor={`edit-logo-approved-${index}`} className="text-sm cursor-pointer">Logo OK</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`edit-completed-${index}`}
                              checked={item.completed}
                              onCheckedChange={(checked) => updateLineItem(index, 'completed', checked === true)}
                              data-testid={`checkbox-edit-line-item-completed-${index}`}
                            />
                            <label htmlFor={`edit-completed-${index}`} className="text-sm cursor-pointer">Done</label>
                          </div>
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
                        <label className="text-xs text-muted-foreground">Additional Information</label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder=""
                          className="mt-1"
                          data-testid={`input-edit-line-item-description-${index}`}
                        />
                      </div>

                      {/* Position Other - Only show when "other" is selected */}
                      {item.position === "other" && (
                        <div>
                          <label className="text-xs text-muted-foreground">Position Details</label>
                          <Input
                            value={item.positionOther || ""}
                            onChange={(e) => updateLineItem(index, 'positionOther', e.target.value)}
                            placeholder="Please specify position..."
                            className="mt-1"
                            data-testid={`input-edit-line-item-position-other-${index}`}
                          />
                        </div>
                      )}
                      
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t">
                          <div>
                            <label className="text-xs text-muted-foreground">
                              Completed By
                              {(item.jobType === "Embroidery" || item.jobType === "Embroidery Initials/Name") && (
                                <span className="text-destructive ml-1">*</span>
                              )}
                            </label>
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
                          {(item.jobType === "Embroidery" || item.jobType === "Embroidery Initials/Name") && (
                            <div>
                              <label className="text-xs text-muted-foreground">
                                Production Time (mins)
                                <span className="text-destructive ml-1">*</span>
                              </label>
                              <Input
                                type="number"
                                min="1"
                                value={item.actualProductionTimeMinutes || ""}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || null;
                                  updateLineItem(index, 'actualProductionTimeMinutes', val);
                                }}
                                placeholder="Actual minutes"
                                className="font-mono mt-1"
                                data-testid={`input-edit-line-item-production-time-${index}`}
                              />
                            </div>
                          )}
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
                          onSelect={(date) => field.onChange(date?.toISOString() || null)}
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
                onClick={async () => {
                  const isCurrentlyCompleted = form.watch('completed');
                  if (!isCurrentlyCompleted) {
                    // Marking as complete - open shipping dialog first
                    setShippingDialogOpen(true);
                  } else {
                    // Unmarking - directly call handleSubmit with updated data
                    const currentData = form.getValues();
                    await handleSubmit({
                      ...currentData,
                      completed: false,
                      completedById: null,
                      completedOnTime: null,
                      shippingMethod: null,
                      dhlTrackingNumber: null,
                    });
                  }
                }}
                disabled={(!allLineItemsCompleted() && !form.watch('completed')) || isSubmitting}
                data-testid="button-edit-mark-completed"
              >
                {isSubmitting ? "Saving..." : (form.watch('completed') ? "Unmark as Completed" : "Mark Order as Completed")}
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-edit-submit">
                {isSubmitting ? "Saving..." : "Save Changes"}
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
      staffNames={celebrationStaffNames}
    />
    <ShippingInfoDialog
      open={shippingDialogOpen}
      onOpenChange={setShippingDialogOpen}
      isPending={isSubmitting}
      currentJobId={job.id}
      customerId={job.customerId}
      onSubmit={async (shippingData) => {
        const currentData = form.getValues();
        await handleSubmit({
          ...currentData,
          completed: true,
          completedById: currentUserStaff?.id || null,
          shippingMethod: shippingData.shippingMethod,
          dhlTrackingNumber: shippingData.dhlTrackingNumber || null,
          packageCount: shippingData.packageCount || null,
          packageType: shippingData.packageType || null,
          consolidatedJobIds: shippingData.consolidatedJobIds || [],
        } as any);
        setShippingDialogOpen(false);
      }}
    />
    </>
  );
}

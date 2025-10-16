import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertJobSchema, type Customer } from "@shared/schema";
import { MACHINE_NAMES } from "@shared/machines";
import { minutesToTime } from "@shared/scheduling";
import { getPrice, formatPrice, type PricingTable } from "@shared/pricing";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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

type LineItem = {
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

const formSchema = insertJobSchema.extend({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
});

interface JobFormDialogProps {
  trigger: React.ReactNode;
  customers: Customer[];
  staff: Array<{ id: string; name: string }>;
}

export function JobFormDialog({ trigger, customers, staff }: JobFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ jobType: "Embroidery", quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      jobName: "",
      poNumber: "",
      quantity: 1,
      goodsReceived: "",
      requiredDispatchDate: new Date().toISOString(),
      status: "pending",
      completed: false,
      completedById: null,
      completedOnTime: null,
      notes: "",
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { jobType: "Embroidery", quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number | boolean | null) => {
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
  
  const requiredDispatchDate = form.watch("requiredDispatchDate");
  const goodsReceived = form.watch("goodsReceived");
  const isOverdue = requiredDispatchDate && isPast(new Date(requiredDispatchDate)) && !isToday(new Date(requiredDispatchDate));
  const isDueToday = requiredDispatchDate && isToday(new Date(requiredDispatchDate));
  
  // Calculate Production Time (days between goods received and required dispatch date)
  const productionTime = goodsReceived && requiredDispatchDate 
    ? differenceInCalendarDays(new Date(requiredDispatchDate), new Date(goodsReceived))
    : null;
  const isUrgent = productionTime !== null && productionTime < 3;

  // Calculate pricing based on selected customer and line items
  const pricingData = useMemo(() => {
    const customerId = form.watch("customerId");
    const selectedCustomer = customers.find(c => c.id === customerId);
    
    if (!selectedCustomer) {
      return null;
    }

    // Determine pricing table
    let pricingTable: PricingTable;
    if (selectedCustomer.pricingTable2026) {
      pricingTable = "2026";
    } else if (selectedCustomer.pricingTable2025) {
      pricingTable = "2025";
    } else {
      // No pricing table selected
      return null;
    }

    // Calculate pricing only for Embroidery line items
    const lineItemPricing = lineItems.map(item => {
      // Only calculate pricing for Embroidery type - other types don't have pricing tables yet
      if (item.jobType !== "Embroidery") {
        return null;
      }
      
      try {
        const pricing = getPrice(item.quantity, item.stitchCount, pricingTable);
        return {
          ...pricing,
          lineTotal: pricing.totalPrice as number | "POA",
        };
      } catch (error) {
        return null;
      }
    });

    // Calculate job total (only from Embroidery items)
    let jobTotal: number | "POA" = 0;
    let hasPOA = false;
    let hasEmbroideryItems = false;
    
    for (const pricing of lineItemPricing) {
      if (!pricing) continue;
      hasEmbroideryItems = true;
      if (pricing.lineTotal === "POA") {
        hasPOA = true;
        break;
      }
      jobTotal = (jobTotal as number) + (pricing.lineTotal as number);
    }

    if (hasPOA) {
      jobTotal = "POA";
    }

    // Don't show pricing if there are no embroidery items
    if (!hasEmbroideryItems) {
      return null;
    }

    return {
      pricingTable,
      lineItemPricing,
      jobTotal,
    };
  }, [form.watch("customerId"), lineItems, customers]);

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

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    if (isSubmitting) return; // Prevent double submission
    
    setIsSubmitting(true);
    try {
      const totalQuantity = getTotalQuantity();
      
      if (totalQuantity <= 0) {
        toast({
          title: "Invalid Quantity",
          description: "Please add at least one line item with quantity greater than 0",
          variant: "destructive",
        });
        return;
      }

      const jobData = {
        ...data,
        quantity: totalQuantity,
      };
      
      const jobResponse = await apiRequest("POST", "/api/jobs", jobData);
      const createdJob: any = await jobResponse.json();
      
      for (const lineItem of lineItems) {
        if (lineItem.quantity > 0) {
          await apiRequest("POST", `/api/jobs/${createdJob.id}/line-items`, {
            jobType: lineItem.jobType,
            quantity: lineItem.quantity,
            description: lineItem.description || null,
            stitchCount: lineItem.stitchCount,
            logoApproved: lineItem.logoApproved,
            completed: lineItem.completed,
            completedById: lineItem.completedById || null,
            completedAt: lineItem.completedAt || null,
            machineId: lineItem.machineId || null,
          });
        }
      }
      
      toast({
        title: "Success",
        description: "Order created successfully with line items",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setOpen(false);
      form.reset();
      setLineItems([{ jobType: "Embroidery", quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null }]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create order",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Required Dispatch Date - HEADER - Full Width */}
            <FormField
              control={form.control}
              name="requiredDispatchDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className={cn(
                    "text-xl font-bold",
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
                            "pl-3 text-left font-normal justify-start w-full text-base h-12",
                            !field.value && "text-muted-foreground",
                            isOverdue && "border-red-500 bg-red-50 dark:bg-red-950/30",
                            isDueToday && !isOverdue && "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                          )}
                          data-testid="button-dispatch-date"
                        >
                          <CalendarIcon className="mr-2 h-5 w-5" />
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

            {/* Goods Received - Full Width with Production Time */}
            <FormField
              control={form.control}
              name="goodsReceived"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-base font-semibold">Goods Received</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal justify-start w-full",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-goods-received"
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

            {/* Customer - Full Width */}
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => {
                // Only show customers with pricing tables
                const customersWithPricing = customers.filter(c => c.pricingTable2025 || c.pricingTable2026);
                const customersWithoutPricing = customers.length - customersWithPricing.length;
                
                return (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customersWithPricing.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {customersWithoutPricing > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {customersWithoutPricing} customer{customersWithoutPricing !== 1 ? 's' : ''} hidden (no pricing table)
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* PO Number - Full Width */}
            <FormField
              control={form.control}
              name="poNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PO Number</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} className="font-mono" data-testid="input-po-number" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Job Name - Full Width */}
            <FormField
              control={form.control}
              name="jobName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-job-name" />
                  </FormControl>
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
                <SelectTrigger data-testid="select-embroidery-approved">
                  <SelectValue placeholder="Select approval status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <SelectTrigger className="mt-1" data-testid={`select-line-item-job-type-${index}`}>
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
                            data-testid={`input-line-item-quantity-${index}`}
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
                            data-testid={`input-line-item-stitch-count-${index}`}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Machine</label>
                          <Select 
                            value={item.machineId?.toString() || "unassigned"}
                            onValueChange={(value) => updateLineItem(index, 'machineId', value === "unassigned" ? null : parseInt(value))}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-line-item-machine-${index}`}>
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
                            id={`completed-${index}`}
                            checked={item.completed}
                            onCheckedChange={(checked) => updateLineItem(index, 'completed', checked === true)}
                            data-testid={`checkbox-line-item-completed-${index}`}
                          />
                          <label htmlFor={`completed-${index}`} className="text-sm cursor-pointer">Done</label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          data-testid={`button-remove-line-item-${index}`}
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
                          data-testid={`input-line-item-description-${index}`}
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
                          data-testid={`button-suggest-line-item-schedule-${index}`}
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
                              <SelectTrigger className="mt-1" data-testid={`select-line-item-completed-by-${index}`}>
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
                                  data-testid={`button-line-item-completed-at-${index}`}
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
                    data-testid="button-add-line-item"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Line Item
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Total Quantity: <span className="font-mono font-semibold">{getTotalQuantity()}</span>
                  </p>

                  {/* Pricing Display */}
                  {pricingData && (
                    <div className="border rounded-md p-3 bg-muted/30 space-y-2" data-testid="pricing-summary">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium">Pricing ({pricingData.pricingTable} Table)</h4>
                      </div>
                      
                      {lineItems.map((item, index) => {
                        const pricing = pricingData.lineItemPricing[index];
                        if (!pricing) {
                          // Show message for non-embroidery items
                          if (item.jobType !== "Embroidery") {
                            return (
                              <div key={index} className="text-xs space-y-1 pb-2 border-b last:border-b-0 last:pb-0">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Line {index + 1} ({item.jobType}): {item.quantity} units
                                  </span>
                                  <span className="text-muted-foreground italic">
                                    Pricing not available
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }
                        
                        return (
                          <div key={index} className="text-xs space-y-1 pb-2 border-b last:border-b-0 last:pb-0">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Line {index + 1} (Embroidery): {item.quantity} × {item.stitchCount.toLocaleString()} stitches
                              </span>
                            </div>
                            <div className="flex justify-between font-mono">
                              <span className="text-muted-foreground">
                                {formatPrice(pricing.unitPrice)}/unit
                              </span>
                              <span className="font-semibold" data-testid={`line-item-price-${index}`}>
                                {formatPrice(pricing.lineTotal)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Total Price (Embroidery Only):</span>
                        <span className="font-mono font-bold text-lg" data-testid="total-price">
                          {formatPrice(pricingData.jobTotal)}
                        </span>
                      </div>
                    </div>
                  )}

                  {!pricingData && form.watch("customerId") && (
                    <div className="border border-amber-500/50 rounded-md p-3 bg-amber-500/5">
                      <p className="text-sm text-amber-600 dark:text-amber-500">
                        {lineItems.every(item => item.jobType !== "Embroidery") 
                          ? "No embroidery items - pricing tables only apply to embroidery work."
                          : "No pricing table selected for this customer. Please update customer settings."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

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
                      value={field.value || ""}
                      placeholder="Add any additional notes about this order..."
                      className="resize-none min-h-[100px]"
                      data-testid="input-notes" 
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
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
                data-testid="button-mark-completed"
              >
                {form.watch('completed') ? "Unmark as Completed" : "Mark Order as Completed"}
              </Button>
              <Button 
                type="submit" 
                onClick={(e) => {
                  e.preventDefault();
                  form.handleSubmit(handleSubmit)();
                }}
                disabled={isSubmitting}
                data-testid="button-create-order"
              >
                {isSubmitting ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

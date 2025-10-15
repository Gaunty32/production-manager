import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertJobSchema, type Customer } from "@shared/schema";
import { MACHINE_NAMES } from "@shared/machines";
import { minutesToTime } from "@shared/scheduling";
import { getPrice, formatPrice, type PricingTable } from "@shared/pricing";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

type LineItem = {
  quantity: number;
  description: string;
  stitchCount: number;
  logoApproved: boolean;
  completed: boolean;
};

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
  const [scheduleSuggestion, setScheduleSuggestion] = useState<any>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false }]);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: "",
      jobName: "",
      poNumber: "",
      quantity: 1,
      dateReceived: new Date().toISOString(),
      requiredDispatchDate: new Date().toISOString(),
      machineId: null,
      status: "pending",
      completed: false,
      completedOnTime: null,
      completedById: null,
      notes: "",
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
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
  
  const requiredDispatchDate = form.watch("requiredDispatchDate");
  const isOverdue = requiredDispatchDate && isPast(new Date(requiredDispatchDate)) && !isToday(new Date(requiredDispatchDate));
  const isDueToday = requiredDispatchDate && isToday(new Date(requiredDispatchDate));

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

    // Calculate pricing for each line item
    const lineItemPricing = lineItems.map(item => {
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

    // Calculate job total
    let jobTotal: number | "POA" = 0;
    let hasPOA = false;
    
    for (const pricing of lineItemPricing) {
      if (!pricing) continue;
      if (pricing.lineTotal === "POA") {
        hasPOA = true;
        break;
      }
      jobTotal = (jobTotal as number) + (pricing.lineTotal as number);
    }

    if (hasPOA) {
      jobTotal = "POA";
    }

    return {
      pricingTable,
      lineItemPricing,
      jobTotal,
    };
  }, [form.watch("customerId"), lineItems, customers]);

  const handleSuggestSchedule = async () => {
    const values = form.getValues();
    
    const machineId = values.machineId ? Number(values.machineId) : null;
    const totalQuantity = getTotalQuantity();
    
    // Calculate weighted average stitch count from line items
    const weightedStitchCount = lineItems.reduce((sum, item) => 
      sum + (item.stitchCount * item.quantity), 0
    ) / Math.max(totalQuantity, 1);
    
    const requiredDispatchDate = values.requiredDispatchDate;
    
    if (!machineId || totalQuantity <= 0 || weightedStitchCount <= 0 || !requiredDispatchDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in Machine, Line Items (with stitch counts), and Required Dispatch Date first",
        variant: "destructive",
      });
      return;
    }
    
    setLoadingSuggestion(true);
    try {
      const suggestResponse = await apiRequest("POST", "/api/suggest-schedule", {
        machineId,
        quantity: totalQuantity,
        stitchCount: Math.round(weightedStitchCount),
        requiredDispatchDate,
      });
      const response: any = await suggestResponse.json();
      
      if (response.available) {
        setScheduleSuggestion(response.suggestion);
        toast({
          title: "Schedule Found",
          description: `Earliest available slot found for ${response.suggestion.staffName}`,
        });
      } else {
        setScheduleSuggestion(null);
        toast({
          title: "No Slots Available",
          description: response.message || "No available time slot found",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to suggest schedule",
        variant: "destructive",
      });
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
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
            quantity: lineItem.quantity,
            description: lineItem.description || null,
            stitchCount: lineItem.stitchCount,
            logoApproved: lineItem.logoApproved,
            completed: lineItem.completed,
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
      setLineItems([{ quantity: 1, description: "", stitchCount: 5000, logoApproved: false, completed: false }]);
      setScheduleSuggestion(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create order",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setScheduleSuggestion(null);
    }
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

            {/* Customer - Full Width */}
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-customer">
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
                        if (!pricing) return null;
                        
                        return (
                          <div key={index} className="text-xs space-y-1 pb-2 border-b last:border-b-0 last:pb-0">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Line {index + 1}: {item.quantity} × {item.stitchCount.toLocaleString()} stitches
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
                        <span className="font-medium">Total Price:</span>
                        <span className="font-mono font-bold text-lg" data-testid="total-price">
                          {formatPrice(pricingData.jobTotal)}
                        </span>
                      </div>
                    </div>
                  )}

                  {!pricingData && form.watch("customerId") && (
                    <div className="border border-amber-500/50 rounded-md p-3 bg-amber-500/5">
                      <p className="text-sm text-amber-600 dark:text-amber-500">
                        No pricing table selected for this customer. Please update customer settings.
                      </p>
                    </div>
                  )}
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
                        data-testid="checkbox-completed"
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
                      defaultValue={field.value || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-completed-by">
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
                      defaultValue={field.value?.toString() || "unassigned"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-machine">
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
                            data-testid="button-date-received"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(new Date(field.value), "PPP") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={new Date(field.value)}
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

            {/* Schedule Suggestion Section */}
            <div className="border rounded-md p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Schedule Suggestion</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestSchedule}
                  disabled={loadingSuggestion}
                  data-testid="button-suggest-schedule"
                >
                  {loadingSuggestion ? "Finding Slot..." : "Find Earliest Slot"}
                </Button>
              </div>
              
              {scheduleSuggestion && (
                <div className="space-y-2 text-sm" data-testid="schedule-suggestion-result">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Suggested Date:</span>
                    <span className="font-medium">
                      {format(new Date(scheduleSuggestion.date), "PPP")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time Slot:</span>
                    <span className="font-medium">
                      {minutesToTime(scheduleSuggestion.startTime)} - {minutesToTime(scheduleSuggestion.endTime)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Staff Member:</span>
                    <span className="font-medium">{scheduleSuggestion.staffName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="font-medium">{scheduleSuggestion.duration} minutes</span>
                  </div>
                </div>
              )}
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                type="submit" 
                onClick={(e) => {
                  e.preventDefault();
                  form.handleSubmit(handleSubmit)();
                }}
                data-testid="button-create-order"
              >
                Add Embroidery Order
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

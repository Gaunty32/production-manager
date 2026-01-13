import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertJobSchema, type Customer } from "@shared/schema";
import { MACHINE_NAMES, suggestMachine } from "@shared/machines";
import { minutesToTime } from "@shared/scheduling";
import { getPrice, getPrintPrice, formatPrice, type PricingTable, PRINT_SIZE_CODE, CODE_TO_PRINT_SIZE } from "@shared/pricing";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Info, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { format, isPast, isToday, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { QuackingDuckDialog } from "@/components/QuackingDuckDialog";

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
  position?: string | null;
  positionOther?: string | null;
};

const JOB_TYPES = ["Embroidery", "Print", "Embroidery Initials/Name", "Print Initials/Name", "Bagging", "Other"] as const;
const POSITION_OPTIONS = ["left chest", "right chest", "left sleeve", "right sleeve", "rear", "other"] as const;

const formSchema = insertJobSchema.extend({
  customerId: z.string().min(1, "Customer is required"),
  jobName: z.string().min(1, "Job name is required"),
  poNumber: z.preprocess(
    (val) => val === "" ? null : val,
    z.string().nullable().optional()
  ),
  requiredDispatchDate: z.preprocess(
    (val) => val === "" ? null : val,
    z.union([z.string(), z.null()]).optional()
  ),
  goodsReceived: z.preprocess(
    (val) => val === "" ? null : val,
    z.union([z.string(), z.null()]).optional()
  ),
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

interface JobFormDialogProps {
  trigger: React.ReactNode;
  customers: Customer[];
  staff: Array<{ id: string; name: string }>;
  onJobCreated?: (jobId: string) => void;
}

export function JobFormDialog({ trigger, customers, staff, onJobCreated }: JobFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ jobType: "Embroidery", quantity: 0, description: "", stitchCount: 0, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null, position: null, positionOther: null }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDuckDialog, setShowDuckDialog] = useState(false);
  const [duckConfirmed, setDuckConfirmed] = useState(false);
  const [showMachineWarning, setShowMachineWarning] = useState(false);
  const [machineWarningConfirmed, setMachineWarningConfirmed] = useState(false);
  const [showExpressWarning, setShowExpressWarning] = useState(false);
  const [expressWarningConfirmed, setExpressWarningConfirmed] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<z.infer<typeof formSchema> | null>(null);
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
      requiredDispatchDate: "",
      status: "pending",
      completed: false,
      completedById: null,
      completedOnTime: null,
      notes: "",
      deliveryAddressType: "customer",
      deliveryAddress: "",
    },
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { jobType: "Embroidery", quantity: 0, description: "", stitchCount: 0, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null, position: null, positionOther: null }]);
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

    // Calculate pricing for Embroidery, Print, and Bagging line items
    const lineItemPricing = lineItems.map(item => {
      // Skip items with no quantity
      if (!item.quantity || item.quantity === 0) {
        return null;
      }

      try {
        if (item.jobType === "Bagging") {
          // Use bagging pricing (30p for 2025, 40p for 2026)
          const unitPrice = pricingTable === "2025" ? 0.30 : 0.40;
          const totalPrice = unitPrice * item.quantity;
          return {
            unitPrice,
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            tier: "Flat Rate",
            lineTotal: parseFloat(totalPrice.toFixed(2)),
          };
        } else if (item.jobType === "Print Initials/Name" || item.jobType === "Embroidery Initials/Name") {
          // Use flat rate pricing (£2.50)
          const unitPrice = 2.50;
          const totalPrice = unitPrice * item.quantity;
          return {
            unitPrice,
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            tier: "Flat Rate",
            lineTotal: parseFloat(totalPrice.toFixed(2)),
          };
        } else if (item.jobType === "Print") {
          // Skip pricing if size is not set
          if (!item.stitchCount || item.stitchCount === 0) {
            return null;
          }
          // Use print pricing
          const pricing = getPrintPrice(item.quantity, item.stitchCount, pricingTable);
          return {
            ...pricing,
            lineTotal: pricing.totalPrice as number,
          };
        } else if (item.jobType === "Embroidery") {
          // Skip pricing if stitch count is not set (0 or missing)
          if (!item.stitchCount || item.stitchCount === 0) {
            return null;
          }
          // Use embroidery pricing
          const pricing = getPrice(item.quantity, item.stitchCount, pricingTable);
          return {
            ...pricing,
            lineTotal: pricing.totalPrice as number | "POA",
          };
        } else {
          // Other job types don't have pricing
          return null;
        }
      } catch (error) {
        return null;
      }
    });

    // Calculate job total (from Embroidery and Print items)
    let jobTotal: number | "POA" = 0;
    let hasPOA = false;
    let hasPricedItems = false;
    
    for (const pricing of lineItemPricing) {
      if (!pricing) continue;
      hasPricedItems = true;
      if (pricing.lineTotal === "POA") {
        hasPOA = true;
        break;
      }
      jobTotal = (jobTotal as number) + (pricing.lineTotal as number);
    }

    if (hasPOA) {
      jobTotal = "POA";
    }

    // Don't show pricing if there are no priced items
    if (!hasPricedItems) {
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

  const performActualSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const totalQuantity = getTotalQuantity();
      
      if (totalQuantity <= 0) {
        toast({
          title: "Invalid Quantity",
          description: "Please add at least one line item with quantity greater than 0",
          variant: "destructive",
        });
        setIsSubmitting(false);
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
            position: lineItem.position || null,
            positionOther: lineItem.positionOther || null,
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
      setCurrentStep(1);
      setLineItems([{ jobType: "Embroidery", quantity: 0, description: "", stitchCount: 0, logoApproved: false, completed: false, completedById: null, completedAt: null, machineId: null, position: null, positionOther: null }]);
      
      // Open the production worksheet after job creation
      if (onJobCreated) {
        onJobCreated(createdJob.id);
      }
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

  // Helper to check if express service is required
  const requiresExpressService = (dispatchDateStr: string | null | undefined) => {
    if (!dispatchDateStr) return false;
    const totalQuantity = getTotalQuantity();
    if (totalQuantity <= 0 || totalQuantity >= 300) return false;
    
    const dispatchDate = new Date(dispatchDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate working days between today and dispatch date
    let workingDays = 0;
    const checkDate = new Date(today);
    while (checkDate < dispatchDate) {
      checkDate.setDate(checkDate.getDate() + 1);
      const dayOfWeek = checkDate.getDay();
      // Count weekdays (Mon-Fri) as working days
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
    }
    
    return workingDays < 3;
  };

  // Validation chain with explicit confirmation flags passed as parameters
  // This avoids React state batching issues where setState updates don't take effect immediately
  const runValidationChain = async (
    data: z.infer<typeof formSchema>,
    confirmedDuck: boolean,
    confirmedMachine: boolean,
    confirmedExpress: boolean
  ) => {
    // Check for suspicious data: quantity > stitch count (likely swapped)
    const suspiciousItems = lineItems
      .map((item, index) => ({ ...item, index }))
      .filter(item => 
        item.quantity > 0 && 
        item.stitchCount > 0 && 
        item.quantity > item.stitchCount &&
        item.jobType !== "Bagging" && // Bagging doesn't use stitch count
        item.jobType !== "Print" && // Print doesn't use stitch count
        !item.jobType.includes("Initials/Name") // Flat-rate items don't compare these
      );
    
    // If suspicious data found and not yet confirmed, show duck dialog
    if (suspiciousItems.length > 0 && !confirmedDuck) {
      setPendingFormData(data);
      setShowDuckDialog(true);
      return;
    }
    
    // Check for unassigned machines on embroidery items
    const unassignedEmbroideryItems = lineItems
      .map((item, index) => ({ ...item, index }))
      .filter(item => 
        item.quantity > 0 &&
        (item.jobType === "Embroidery" || item.jobType === "Embroidery Initials/Name") &&
        item.machineId === null
      );
    
    // If unassigned machines found and not yet confirmed, show warning dialog
    if (unassignedEmbroideryItems.length > 0 && !confirmedMachine) {
      setPendingFormData(data);
      setShowMachineWarning(true);
      return;
    }
    
    // Check for express service requirement: < 300 items AND < 3 working days
    if (requiresExpressService(data.requiredDispatchDate) && !confirmedExpress) {
      setPendingFormData(data);
      setShowExpressWarning(true);
      return;
    }
    
    // All validations passed, perform actual submit
    await performActualSubmit(data);
  };

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    if (isSubmitting) return; // Prevent double submission
    
    // Start validation chain with current state values
    await runValidationChain(data, duckConfirmed, machineWarningConfirmed, expressWarningConfirmed);
  };

  const handleDuckConfirm = () => {
    setDuckConfirmed(true);
    setShowDuckDialog(false);
    // Continue validation chain with duck confirmed (pass true explicitly to avoid state batching)
    if (pendingFormData) {
      runValidationChain(pendingFormData, true, machineWarningConfirmed, expressWarningConfirmed);
    }
  };

  const handleMachineWarningConfirm = () => {
    setMachineWarningConfirmed(true);
    setShowMachineWarning(false);
    // Continue validation chain with machine warning confirmed (pass true explicitly)
    if (pendingFormData) {
      runValidationChain(pendingFormData, true, true, expressWarningConfirmed);
    }
  };

  const handleExpressConfirm = () => {
    setExpressWarningConfirmed(true);
    setShowExpressWarning(false);
    // Express warning is the final check, so submit directly
    if (pendingFormData) {
      performActualSubmit(pendingFormData);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setCurrentStep(1);
      setDuckConfirmed(false);
      setMachineWarningConfirmed(false);
      setShowMachineWarning(false);
      setExpressWarningConfirmed(false);
      setShowExpressWarning(false);
      setPendingFormData(null);
    }
  };

  const canProceedFromStep1 = () => {
    // Dates are optional - can always proceed
    return true;
  };

  const canProceedFromStep2 = () => {
    const customerId = form.watch("customerId");
    const jobName = form.watch("jobName");
    const deliveryAddressType = form.watch("deliveryAddressType");
    const deliveryAddress = form.watch("deliveryAddress");
    
    if (!customerId || !jobName) {
      return false;
    }
    
    if (deliveryAddressType === "custom") {
      return !!deliveryAddress && deliveryAddress.trim().length > 0;
    }
    
    return true;
  };

  const canProceedFromStep3 = () => {
    return lineItems.length > 0 && lineItems.some(item => item.quantity > 0);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-full max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new production order
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6 px-4">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold transition-colors",
                currentStep === step && "border-primary bg-primary text-primary-foreground",
                currentStep > step && "border-green-500 bg-green-500 text-white",
                currentStep < step && "border-muted-foreground/30 text-muted-foreground"
              )}>
                {currentStep > step ? <Check className="h-5 w-5" /> : step}
              </div>
              {step < 4 && (
                <div className={cn(
                  "h-0.5 w-16 mx-2 transition-colors",
                  currentStep > step ? "bg-green-500" : "bg-muted-foreground/30"
                )} />
              )}
            </div>
          ))}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Step 1: Dates */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 1: Dates (Optional)</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select when the goods arrived and when the order needs to be dispatched. You can skip this and add dates later. Orders enter the production queue only when they have both dates and embroidery approval.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Required Dispatch Date */}
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
                                  "pl-3 text-left font-normal justify-start w-full h-auto py-3",
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

                  {/* Goods Received */}
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
                                  "pl-3 text-left font-normal justify-start w-full h-auto py-3",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-goods-received"
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
                </div>

                {/* Production Time Display */}
                {productionTime !== null && (
                  <div className={cn(
                    "p-4 rounded-lg border-2",
                    isUrgent 
                      ? "border-red-500 bg-red-50 dark:bg-red-950/30" 
                      : "border-green-500 bg-green-50 dark:bg-green-950/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-base font-semibold",
                        isUrgent ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"
                      )}>
                        Production Time:
                      </span>
                      <span className={cn(
                        "text-3xl font-bold",
                        isUrgent ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500"
                      )}>
                        {productionTime} {productionTime === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                    {isUrgent && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                        ⚠️ URGENT ORDER - Less than 3 days production time
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    disabled={!canProceedFromStep1()}
                    data-testid="button-next-step-1"
                  >
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Customer & Job Details */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 2: Customer & Job Details</h3>
                </div>

                {/* Customer */}
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => {
                    // Only show active customers with pricing tables
                    const activeCustomers = customers.filter(c => c.active !== false);
                    const customersWithPricing = activeCustomers.filter(c => c.pricingTable2025 || c.pricingTable2026);
                    const activeWithoutPricing = activeCustomers.length - customersWithPricing.length;
                    const inactiveCount = customers.length - activeCustomers.length;
                    
                    return (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-customer">
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent position="popper" className="max-h-[300px]">
                            {customersWithPricing.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(activeWithoutPricing > 0 || inactiveCount > 0) && (
                          <FormDescription>
                            {activeWithoutPricing > 0 && `${activeWithoutPricing} customer${activeWithoutPricing !== 1 ? 's' : ''} hidden (no pricing table)`}
                            {activeWithoutPricing > 0 && inactiveCount > 0 && ', '}
                            {inactiveCount > 0 && `${inactiveCount} inactive`}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {/* Job Name */}
                <FormField
                  control={form.control}
                  name="jobName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Company Logo Polo Shirts" data-testid="input-job-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* PO Number */}
                <FormField
                  control={form.control}
                  name="poNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Number (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="Purchase order number" className="font-mono" data-testid="input-po-number" />
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
                          <SelectTrigger data-testid="select-delivery-address-type">
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

                {/* Show customer address when "customer" is selected */}
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
                            data-testid="input-delivery-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Bulk Logo Approval Toggle */}
                <div className="flex flex-col space-y-2">
                  <FormLabel>Quick Toggle - All Logos</FormLabel>
                  <Select 
                    value={allLogosApproved ? "yes" : "no"} 
                    onValueChange={(value) => toggleAllLogos(value === "yes")}
                  >
                    <SelectTrigger data-testid="select-embroidery-approved">
                      <SelectValue placeholder="Select approval status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Mark All Approved</SelectItem>
                      <SelectItem value="no">Mark All Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                    data-testid="button-back-step-2"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    disabled={!canProceedFromStep2()}
                    data-testid="button-next-step-2"
                  >
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Line Items */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 3: Line Items</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add items to this order with quantities, types, and specifications
                  </p>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-3 bg-muted/20">
                      <div className="flex gap-3 items-start">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground font-medium">Job Type</label>
                          <Select 
                            value={item.jobType}
                            onValueChange={(value) => {
                              const updated = [...lineItems];
                              const currentMachine = updated[index].machineId;
                              
                              if (value === "Print" && item.jobType !== "Print") {
                                updated[index] = { 
                                  ...updated[index], 
                                  jobType: value,
                                  stitchCount: PRINT_SIZE_CODE.A4 
                                };
                              } else if (currentMachine === null) {
                                const suggested = suggestMachine(item.quantity, value, item.stitchCount);
                                updated[index] = { 
                                  ...updated[index], 
                                  jobType: value,
                                  machineId: suggested
                                };
                              } else {
                                updated[index] = { 
                                  ...updated[index], 
                                  jobType: value
                                };
                              }
                              setLineItems(updated);
                            }}
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
                          <label className="text-xs text-muted-foreground font-medium">Position</label>
                          <Select 
                            value={item.position || undefined}
                            onValueChange={(value) => {
                              const updated = [...lineItems];
                              updated[index] = { 
                                ...updated[index], 
                                position: value || null,
                                positionOther: value !== "other" ? null : updated[index].positionOther
                              };
                              setLineItems(updated);
                            }}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-line-item-position-${index}`}>
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
                          <label className="text-xs text-muted-foreground font-medium">Quantity</label>
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const updated = [...lineItems];
                              const currentMachine = updated[index].machineId;
                              
                              if (currentMachine === null) {
                                const suggested = suggestMachine(val, item.jobType, item.stitchCount);
                                updated[index] = { 
                                  ...updated[index], 
                                  quantity: val,
                                  machineId: suggested
                                };
                              } else {
                                updated[index] = { 
                                  ...updated[index], 
                                  quantity: val
                                };
                              }
                              setLineItems(updated);
                            }}
                            placeholder="0"
                            className="font-mono mt-1"
                            data-testid={`input-line-item-quantity-${index}`}
                          />
                        </div>
                        <div className="flex-1">
                          {item.jobType === "Print" ? (
                            <>
                              <label className="text-xs text-muted-foreground font-medium">Print Size</label>
                              <Select 
                                value={item.stitchCount.toString()}
                                onValueChange={(value) => updateLineItem(index, 'stitchCount', parseInt(value))}
                              >
                                <SelectTrigger className="mt-1" data-testid={`select-line-item-print-size-${index}`}>
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
                              <label className="text-xs text-muted-foreground font-medium">Price</label>
                              <div className="mt-1 px-3 py-2 rounded-md bg-muted/30 border text-sm font-semibold text-primary">
                                £2.50 per item
                              </div>
                            </>
                          ) : item.jobType === "Bagging" ? (
                            <>
                              <label className="text-xs text-muted-foreground font-medium">Price</label>
                              <div className="mt-1 px-3 py-2 rounded-md bg-muted/30 border text-sm font-semibold text-primary">
                                {(() => {
                                  const customerId = form.watch("customerId");
                                  const customer = customers.find(c => c.id === customerId);
                                  return customer?.pricingTable2025 ? "£0.30 per item" : "£0.40 per item";
                                })()}
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="text-xs text-muted-foreground font-medium">Stitch Count</label>
                              <Input
                                type="number"
                                min="0"
                                value={item.stitchCount || ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const updated = [...lineItems];
                                  const currentMachine = updated[index].machineId;
                                  
                                  if (currentMachine === null) {
                                    const suggested = suggestMachine(item.quantity, item.jobType, val);
                                    updated[index] = { 
                                      ...updated[index], 
                                      stitchCount: val,
                                      machineId: suggested
                                    };
                                  } else {
                                    updated[index] = { 
                                      ...updated[index], 
                                      stitchCount: val
                                    };
                                  }
                                  setLineItems(updated);
                                }}
                                placeholder="0"
                                className="font-mono mt-1"
                                data-testid={`input-line-item-stitch-count-${index}`}
                              />
                            </>
                          )}
                        </div>
                        {item.jobType !== "Print" && item.jobType !== "Print Initials/Name" && item.jobType !== "Embroidery Initials/Name" && item.jobType !== "Bagging" && (
                          <div className="flex-1">
                            <label className="text-xs text-muted-foreground font-medium">Machine</label>
                            <Select 
                              value={item.machineId?.toString() || "unassigned"}
                              onValueChange={(value) => updateLineItem(index, 'machineId', value === "unassigned" ? null : parseInt(value))}
                            >
                              <SelectTrigger className="mt-1" data-testid={`select-line-item-machine-${index}`}>
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
                        <div className="flex items-center gap-2 pt-5">
                          <Checkbox
                            id={`logo-approved-${index}`}
                            checked={item.logoApproved}
                            onCheckedChange={(checked) => updateLineItem(index, 'logoApproved', checked === true)}
                            data-testid={`checkbox-line-item-logo-approved-${index}`}
                          />
                          <label htmlFor={`logo-approved-${index}`} className="text-sm cursor-pointer">Logo OK</label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                          data-testid={`button-remove-line-item-${index}`}
                          className="mt-6"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground font-medium">Additional Information</label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          placeholder=""
                          className="mt-1"
                          data-testid={`input-line-item-description-${index}`}
                        />
                      </div>

                      {/* Position Other - Only show when "other" is selected */}
                      {item.position === "other" && (
                        <div>
                          <label className="text-xs text-muted-foreground font-medium">Position Details</label>
                          <Input
                            value={item.positionOther || ""}
                            onChange={(e) => {
                              const updated = [...lineItems];
                              updated[index] = { 
                                ...updated[index], 
                                positionOther: e.target.value
                              };
                              setLineItems(updated);
                            }}
                            placeholder="Please specify position..."
                            className="mt-1"
                            data-testid={`input-line-item-position-other-${index}`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addLineItem}
                  className="w-full"
                  data-testid="button-add-line-item"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Line Item
                </Button>

                {/* Pricing Summary - Only visible to super admins */}
                {pricingData && user?.role === 'super_admin' && (
                  <div className="border rounded-lg p-4 bg-primary/5">
                    <h4 className="font-semibold mb-2">Pricing Summary ({pricingData.pricingTable} Table)</h4>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Estimated Total:</span>
                      <span className="text-xl font-bold">
                        {typeof pricingData.jobTotal === "number" 
                          ? formatPrice(pricingData.jobTotal)
                          : pricingData.jobTotal}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCurrentStep(2)}
                    data-testid="button-back-step-3"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    disabled={!canProceedFromStep3()}
                    data-testid="button-next-step-3"
                  >
                    Next <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Notes & Review */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Step 4: Notes & Review</h3>
                </div>

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""} 
                          placeholder="Any special instructions or notes about this order..."
                          className="min-h-[100px]"
                          data-testid="input-notes" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Order Summary */}
                <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                  <h4 className="font-semibold">Order Summary</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Customer:</div>
                    <div className="font-medium">{customers.find(c => c.id === form.watch("customerId"))?.name || "-"}</div>
                    
                    <div className="text-muted-foreground">Job Name:</div>
                    <div className="font-medium">{form.watch("jobName") || "-"}</div>
                    
                    <div className="text-muted-foreground">PO Number:</div>
                    <div className="font-medium font-mono">{form.watch("poNumber") || "None"}</div>
                    
                    <div className="text-muted-foreground">Dispatch Date:</div>
                    <div className="font-medium">
                      {requiredDispatchDate ? format(new Date(requiredDispatchDate), "PPP") : "-"}
                    </div>
                    
                    <div className="text-muted-foreground">Goods Received:</div>
                    <div className="font-medium">
                      {goodsReceived ? format(new Date(goodsReceived), "PPP") : "-"}
                    </div>
                    
                    {productionTime !== null && (
                      <>
                        <div className="text-muted-foreground">Production Time:</div>
                        <div className={cn(
                          "font-bold",
                          isUrgent ? "text-red-600" : "text-green-600"
                        )}>
                          {productionTime} {productionTime === 1 ? 'day' : 'days'}
                        </div>
                      </>
                    )}
                    
                    {/* Quantity breakdown by job type */}
                    {(() => {
                      const breakdown: Record<string, number> = {};
                      lineItems.forEach(item => {
                        const type = item.jobType || "Embroidery";
                        breakdown[type] = (breakdown[type] || 0) + item.quantity;
                      });
                      return Object.entries(breakdown).map(([type, qty], idx) => (
                        <div key={idx} className="contents">
                          <div className="text-muted-foreground">Total {type}:</div>
                          <div className="font-medium">{qty}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Pricing Summary - Only visible to super admins */}
                {pricingData && user?.role === 'super_admin' && (
                  <div className="border rounded-lg p-4 bg-primary/5">
                    <h4 className="font-semibold mb-2">Pricing Summary ({pricingData.pricingTable} Table)</h4>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Estimated Total:</span>
                      <span className="text-xl font-bold">
                        {typeof pricingData.jobTotal === "number" 
                          ? formatPrice(pricingData.jobTotal)
                          : pricingData.jobTotal}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCurrentStep(3)}
                    data-testid="button-back-step-4"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="button-create-job"
                  >
                    {isSubmitting ? "Creating..." : "Create Order"}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>

      <QuackingDuckDialog
        open={showDuckDialog}
        onOpenChange={setShowDuckDialog}
        onConfirm={handleDuckConfirm}
        suspiciousItems={lineItems
          .map((item, index) => ({ ...item, index }))
          .filter(item => 
            item.quantity > 0 && 
            item.stitchCount > 0 && 
            item.quantity > item.stitchCount &&
            item.jobType !== "Bagging" &&
            item.jobType !== "Print" &&
            !item.jobType.includes("Initials/Name")
          )
          .map(item => ({
            index: item.index,
            quantity: item.quantity,
            stitchCount: item.stitchCount
          }))}
      />

      <Dialog open={showMachineWarning} onOpenChange={(open) => {
        setShowMachineWarning(open);
        if (!open) {
          setPendingFormData(null);
          setMachineWarningConfirmed(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Machine Not Assigned</DialogTitle>
            <DialogDescription>
              The following embroidery items don't have a machine assigned. Are you sure you want to continue without assigning machines?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 my-4">
            {lineItems
              .map((item, index) => ({ ...item, index }))
              .filter(item => 
                item.quantity > 0 &&
                (item.jobType === "Embroidery" || item.jobType === "Embroidery Initials/Name") &&
                item.machineId === null
              )
              .map((item, idx) => (
                <div key={idx} className="p-3 bg-muted rounded-md text-sm">
                  <div className="font-semibold">{item.jobType}</div>
                  <div className="text-muted-foreground">
                    Quantity: {item.quantity}
                    {item.description && ` • ${item.description}`}
                  </div>
                </div>
              ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMachineWarning(false);
                setPendingFormData(null);
                setMachineWarningConfirmed(false);
              }}
              data-testid="button-cancel-machine-warning"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMachineWarningConfirm}
              data-testid="button-confirm-machine-warning"
            >
              Continue Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpressWarning} onOpenChange={setShowExpressWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-amber-500">48-Hour Express Service</span>
            </DialogTitle>
            <DialogDescription>
              Based on the dispatch date and quantity, this order qualifies for our express production service.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
            <div className="flex items-start gap-3">
              <div className="text-3xl">&#9889;</div>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                  Express Service with 100% Surcharge
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Orders under 300 items with less than 3 working days until dispatch will be booked onto our 48-hour express production service. This incurs a 100% surcharge on the standard embroidery price.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowExpressWarning(false);
                setPendingFormData(null);
                setExpressWarningConfirmed(false);
              }}
              data-testid="button-cancel-express-warning"
            >
              Go Back
            </Button>
            <Button
              onClick={handleExpressConfirm}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-express-warning"
            >
              I Understand, Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

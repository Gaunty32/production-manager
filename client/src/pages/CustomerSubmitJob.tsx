import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileText, X, AlertTriangle } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { customerJobSubmissionSchema } from "@shared/schema";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { addDays, isSaturday, isSunday, format } from "date-fns";

type CustomerUser = {
  id: string;
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

type Customer = {
  id: string;
  name: string;
  address: string | null;
};

const formSchema = customerJobSubmissionSchema.extend({
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
});

type FormData = z.infer<typeof formSchema>;

type UploadedFile = {
  objectKey: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

// UK Bank Holidays 2024-2026
const UK_BANK_HOLIDAYS = [
  // 2024
  "2024-01-01", // New Year's Day
  "2024-03-29", // Good Friday
  "2024-04-01", // Easter Monday
  "2024-05-06", // Early May bank holiday
  "2024-05-27", // Spring bank holiday
  "2024-08-26", // Summer bank holiday
  "2024-12-25", // Christmas Day
  "2024-12-26", // Boxing Day
  // 2025
  "2025-01-01", // New Year's Day
  "2025-04-18", // Good Friday
  "2025-04-21", // Easter Monday
  "2025-05-05", // Early May bank holiday
  "2025-05-26", // Spring bank holiday
  "2025-08-25", // Summer bank holiday
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
  // 2026
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May bank holiday
  "2026-05-25", // Spring bank holiday
  "2026-08-31", // Summer bank holiday
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day (substitute day)
  "2026-12-28", // Boxing Day substitute
];

// Helper function to check if a date is a UK bank holiday
const isUKBankHoliday = (date: Date): boolean => {
  const dateStr = format(date, "yyyy-MM-dd");
  return UK_BANK_HOLIDAYS.includes(dateStr);
};

// Helper function to check if a date is a working day (Monday-Friday, excluding UK bank holidays)
const isWorkingDay = (date: Date): boolean => {
  const dayOfWeek = date.getDay();
  // Sunday = 0, Saturday = 6
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  return !isUKBankHoliday(date);
};

// Helper function to add working days (Mon-Fri, excluding UK bank holidays)
const addWorkingDays = (date: Date, days: number): Date => {
  let result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result = addDays(result, 1);
    if (isWorkingDay(result)) {
      addedDays++;
    }
  }
  
  return result;
};

// Helper function to calculate working days between two dates
// Counts from the day AFTER startDate to endDate (exclusive start, inclusive end)
const getWorkingDaysBetween = (startDate: Date, endDate: Date): number => {
  let count = 0;
  let current = addDays(new Date(startDate), 1); // Start counting from next day
  
  while (current <= endDate) {
    if (isWorkingDay(current)) {
      count++;
    }
    current = addDays(current, 1);
  }
  
  return count;
};

export default function CustomerSubmitJob() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showExpressDialog, setShowExpressDialog] = useState(false);
  const [pendingDispatchDate, setPendingDispatchDate] = useState<string>("");

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  // Calculate default dispatch date (7 working days from now)
  const defaultDispatchDate = format(addWorkingDays(new Date(), 7), "yyyy-MM-dd");
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobName: "",
      poNumber: "",
      quantity: 1,
      notes: "",
      deliveryAddress: "",
      requiredDispatchDate: defaultDispatchDate,
    },
  });

  // Handle dispatch date change with validation
  const handleDispatchDateChange = (dateStr: string, onChange: (value: string) => void) => {
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const workingDaysFromNow = getWorkingDaysBetween(today, selectedDate);
    
    // Check if it's 2 working days - show express dialog
    if (workingDaysFromNow === 2) {
      setPendingDispatchDate(dateStr);
      setShowExpressDialog(true);
      return;
    }
    
    // Check if it's less than 2 working days (today or tomorrow)
    if (workingDaysFromNow < 2) {
      toast({
        title: "Invalid date",
        description: "Minimum dispatch time is 2 working days (with express surcharge)",
        variant: "destructive",
      });
      return;
    }
    
    onChange(dateStr);
  };

  const handleExpressConfirm = () => {
    form.setValue("requiredDispatchDate", pendingDispatchDate);
    setShowExpressDialog(false);
    toast({
      title: "Express delivery selected",
      description: "A 100% surcharge will apply to this order",
    });
  };

  const submitJobMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/customer-portal/jobs", data);
      const job = await res.json();
      
      // Attach files to the job
      if (uploadedFiles.length > 0) {
        await Promise.all(
          uploadedFiles.map((file) =>
            apiRequest("POST", `/api/customer-portal/jobs/${job.id}/files`, {
              objectKey: file.objectKey,
              fileName: file.fileName,
              fileSize: file.fileSize,
              fileType: file.fileType,
            })
          )
        );
      }
      
      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/jobs/pending"] });
      toast({
        title: "Job Submitted Successfully",
        description: "We will review and confirm your order within 24 Hours",
      });
      setLocation("/customer/pending");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit job",
        variant: "destructive",
      });
    },
  });

  const handleFileUploaded = (file: UploadedFile) => {
    setUploadedFiles((prev) => [...prev, file]);
  };

  const removeFile = (objectKey: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.objectKey !== objectKey));
  };

  const onSubmit = (data: FormData) => {
    submitJobMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/customer/dashboard")}
              data-testid="button-back-to-dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Submit New Job</h1>
              <p className="text-sm text-muted-foreground">
                Request a new production order
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="jobName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Company Logo Polo Shirts"
                          autoComplete="off"
                          {...field}
                          data-testid="input-job-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Garment Quantity *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 50"
                            {...field}
                            data-testid="input-quantity"
                          />
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
                        <FormLabel>PO Number (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., PO-12345"
                            {...field}
                            data-testid="input-po-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="requiredDispatchDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Required Dispatch Date *</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value}
                          onChange={(e) => handleDispatchDateChange(e.target.value, field.onChange)}
                          min={format(addWorkingDays(new Date(), 2), "yyyy-MM-dd")}
                          data-testid="input-dispatch-date"
                        />
                      </FormControl>
                      <FormDescription>
                        Standard delivery: 3+ working days. Express (2 days) incurs 100% surcharge.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Address (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Leave blank to use your default address"
                          rows={3}
                          {...field}
                          data-testid="input-delivery-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any special instructions or notes..."
                          rows={4}
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <div>
                    <FormLabel>Attach Files (Optional)</FormLabel>
                    <p className="text-sm text-muted-foreground mb-3">
                      Upload logos, artwork, or reference images
                    </p>
                    
                    {uploadedFiles.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {uploadedFiles.map((file) => (
                          <div
                            key={file.objectKey}
                            className="flex items-center justify-between p-3 bg-muted rounded-md"
                            data-testid={`file-${file.fileName}`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{file.fileName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({Math.round(file.fileSize / 1024)} KB)
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(file.objectKey)}
                              data-testid={`button-remove-${file.fileName}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <ObjectUploader
                      maxNumberOfFiles={10}
                      onGetUploadParameters={async () => {
                        const res = await apiRequest("POST", "/api/customer-portal/objects/upload", {
                          prefix: "job-submissions",
                        });
                        const data = await res.json();
                        return {
                          method: "PUT" as const,
                          url: data.url,
                        };
                      }}
                      onComplete={(result) => {
                        setIsUploading(false);
                        result.successful?.forEach((file: any) => {
                          const objectKey = file.meta.key as string;
                          handleFileUploaded({
                            objectKey,
                            fileName: file.name,
                            fileSize: file.size,
                            fileType: file.type || "application/octet-stream",
                          });
                        });
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Files
                    </ObjectUploader>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/customer/dashboard")}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitJobMutation.isPending || isUploading}
                    data-testid="button-submit"
                  >
                    {submitJobMutation.isPending ? "Submitting..." : "Submit Job"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showExpressDialog} onOpenChange={setShowExpressDialog}>
        <AlertDialogContent data-testid="dialog-express-delivery">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Express Delivery Service
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have requested our express delivery service with a dispatch date of 2 working days.
              </p>
              <p className="font-semibold text-foreground">
                This will incur a 100% surcharge on your order total.
              </p>
              <p className="text-sm text-muted-foreground">
                Standard delivery (3+ working days) has no additional charges.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExpressDialog(false)} data-testid="button-express-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExpressConfirm} data-testid="button-express-confirm">
              Confirm Express Delivery
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

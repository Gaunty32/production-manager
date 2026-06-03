import { useState, useRef, useEffect } from "react";
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
import { ArrowLeft, Upload, FileText, X, AlertTriangle, Loader2, RefreshCw, Sparkles, Layers, History, CheckCircle2 } from "lucide-react";
import { customerJobSubmissionSchema } from "@shared/schema";
import { z } from "zod";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
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
import { addDays, format } from "date-fns";

type PreviousJobName = {
  jobName: string;
  jobNumber: number | null;
  completedAt: string | null;
};

type CustomerUser = {
  id: string;
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  customerCreditAccount: boolean;
};

const formSchema = customerJobSubmissionSchema.extend({
  quantity: z.coerce.number().int().min(1).optional().nullable().or(z.literal("")),
});

type FormData = z.infer<typeof formSchema>;

type UploadedFile = {
  objectKey: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

const UK_BANK_HOLIDAYS = [
  "2024-01-01","2024-03-29","2024-04-01","2024-05-06","2024-05-27","2024-08-26","2024-12-25","2024-12-26",
  "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-08-25","2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-26","2026-12-28",
];

const isUKBankHoliday = (date: Date): boolean =>
  UK_BANK_HOLIDAYS.includes(format(date, "yyyy-MM-dd"));

const isWorkingDay = (date: Date): boolean => {
  const d = date.getDay();
  return d !== 0 && d !== 6 && !isUKBankHoliday(date);
};

const addWorkingDays = (date: Date, days: number): Date => {
  let result = new Date(date);
  let added = 0;
  while (added < days) {
    result = addDays(result, 1);
    if (isWorkingDay(result)) added++;
  }
  return result;
};

const getWorkingDaysBetween = (startDate: Date, endDate: Date): number => {
  let count = 0;
  let current = addDays(new Date(startDate), 1);
  while (current <= endDate) {
    if (isWorkingDay(current)) count++;
    current = addDays(current, 1);
  }
  return count;
};

export default function CustomerSubmitJob() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showExpressDialog, setShowExpressDialog] = useState(false);
  const [pendingDispatchDate, setPendingDispatchDate] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [repeatHint, setRepeatHint] = useState<string | null>(null);
  const jobNameWrapperRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: overdueData } = useQuery<{
    overdueInvoices: Array<{
      invoiceNumber: string;
      date: string;
      dueDate: string;
      amountDue: number;
      total: number;
      daysOld: number;
    }>;
    hasOverdue: boolean;
    xeroConnected: boolean;
  }>({
    queryKey: ["/api/customer-portal/overdue-invoices"],
  });

  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [overdueAcknowledged, setOverdueAcknowledged] = useState(false);

  useEffect(() => {
    if (overdueData?.hasOverdue && !overdueAcknowledged) {
      setShowOverdueDialog(true);
    }
  }, [overdueData?.hasOverdue, overdueAcknowledged]);

  const { data: previousJobNames = [] } = useQuery<PreviousJobName[]>({
    queryKey: ["/api/customer-portal/jobs/previous-names"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jobNameWrapperRef.current && !jobNameWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [pendingDispatchWorkingDays, setPendingDispatchWorkingDays] = useState<number>(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobName: "",
      poNumber: "",
      quantity: undefined,
      notes: "",
      deliveryAddress: "",
      requiredDispatchDate: format(addDays(new Date(), 7), "yyyy-MM-dd"),
      logoType: "repeat_logo" as const,
    },
  });

  const watchedQuantity = form.watch("quantity");
  const watchedDispatch = form.watch("requiredDispatchDate");

  const { data: capacityInfo } = useQuery<{ earliestDate: string | null; quantity: number }>({
    queryKey: ["/api/scheduling/earliest-dispatch", Number(watchedQuantity) || 0],
    queryFn: async () => {
      const qty = Number(watchedQuantity) || 0;
      if (qty <= 0) return { earliestDate: null, quantity: 0 };
      const res = await fetch(`/api/scheduling/earliest-dispatch?quantity=${qty}`, { credentials: "include" });
      if (!res.ok) return { earliestDate: null, quantity: qty };
      return res.json();
    },
    enabled: Number(watchedQuantity) > 0,
    staleTime: 60 * 1000,
  });

  const dispatchCapacityWarning = (() => {
    if (!capacityInfo?.earliestDate || !watchedDispatch) return null;
    const selected = new Date(watchedDispatch as string);
    const earliest = new Date(capacityInfo.earliestDate);
    selected.setHours(0, 0, 0, 0);
    earliest.setHours(0, 0, 0, 0);
    return selected < earliest ? capacityInfo.earliestDate : null;
  })();

  const handleDispatchDateChange = (dateStr: string, onChange: (value: string) => void) => {
    if (!dateStr) {
      onChange("");
      return;
    }
    const selectedDate = new Date(dateStr);
    selectedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysFromNow = Math.round((selectedDate.getTime() - today.getTime()) / msPerDay);
    // Hard floor: 3 days (express service minimum)
    if (daysFromNow < 3) {
      toast({
        title: "Lead time too short",
        description: "Required dispatch date must be at least 3 days from today.",
        variant: "destructive",
      });
      return;
    }
    // 3–6 days = Priority Production Service: confirm 100% surcharge
    if (daysFromNow < 7) {
      setPendingDispatchDate(dateStr);
      setPendingDispatchWorkingDays(daysFromNow);
      setShowExpressDialog(true);
      return;
    }
    onChange(dateStr);
  };

  const handleExpressConfirm = () => {
    form.setValue("requiredDispatchDate", pendingDispatchDate);
    setShowExpressDialog(false);
    toast({
      title: "Priority Production Service selected",
      description: "A 100% production surcharge will apply to this order",
    });
  };

  const handleSessionExpired = () => {
    toast({
      title: "Session expired",
      description: "Your session timed out. Please log in again — your form details will need to be re-entered.",
      variant: "destructive",
    });
    setLocation("/customer/login");
  };

  const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB — generous cap; files upload directly to object storage
  const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — safety net so the spinner can never hang forever, but generous enough for large files on slow/mobile connections

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Reject oversized files up front. Without this, an over-limit upload stalls
    // the connection server-side and the spinner appears to hang indefinitely.
    const tooBig = fileArray.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const okFiles = fileArray.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (tooBig.length > 0) {
      toast({
        title: "File too large",
        description: `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the 100MB limit. Please upload a smaller file.`,
        variant: "destructive",
      });
    }
    if (okFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      for (const file of okFiles) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
        try {
          // Upload directly to object storage via a presigned URL. Routing the
          // file through our server hits the deployment's ~32MB request body
          // limit, which silently stalls/fails large uploads.
          const urlRes = await fetch("/api/customer-portal/objects/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            credentials: "include",
          });
          if (urlRes.status === 401) {
            handleSessionExpired();
            return;
          }
          if (!urlRes.ok) {
            const err = await urlRes.json().catch(() => ({}));
            throw new Error(err?.error || `Upload failed with status ${urlRes.status}`);
          }
          const { url, key } = await urlRes.json();
          const putRes = await fetch(url, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
            signal: controller.signal,
          });
          if (!putRes.ok) {
            throw new Error(`Upload failed with status ${putRes.status}`);
          }
          setUploadedFiles(prev => [...prev, {
            objectKey: key,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || "application/octet-stream",
          }]);
        } catch (err: any) {
          if (err?.name === "AbortError") {
            throw new Error(`"${file.name}" took too long to upload. Please check your connection and try again.`);
          }
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "One or more files could not be uploaded",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  const submitJobMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        quantity: data.quantity ? Number(data.quantity) : undefined,
      };
      const res = await apiRequest("POST", "/api/customer-portal/jobs", payload);
      const job = await res.json();
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
      const msg: string = error?.message || "";
      if (msg.toLowerCase().includes("authentication required") || msg.toLowerCase().includes("unauthorized")) {
        handleSessionExpired();
        return;
      }
      toast({
        title: "Error",
        description: msg || "Failed to submit job",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    submitJobMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && customerUser && (
        <ImpersonationBanner customerEmail={customerUser.email} />
      )}

      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          {customerUser?.customerLogoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={customerUser.customerLogoUrl}
                alt={customerUser.customerName || "Customer logo"}
                className="max-h-16 max-w-[200px] object-contain"
                data-testid="img-customer-logo"
              />
            </div>
          )}
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
              <p className="text-sm text-muted-foreground">Request a new production order</p>
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
                  render={({ field }) => {
                    const inputVal = field.value ?? "";
                    const filtered = (inputVal.trim().length > 0
                      ? previousJobNames.filter(p =>
                          p.jobName.toLowerCase().includes(inputVal.toLowerCase())
                        )
                      : [...previousJobNames]
                    ).sort((a, b) => a.jobName.localeCompare(b.jobName)).slice(0, 8);

                    return (
                      <FormItem>
                        <FormLabel>Job Name *</FormLabel>
                        <div ref={jobNameWrapperRef} className="relative">
                          <FormControl>
                            <Input
                              placeholder="e.g., Company Logo Polo Shirts"
                              autoComplete="off"
                              {...field}
                              onFocus={() => setShowSuggestions(true)}
                              onChange={(e) => {
                                field.onChange(e);
                                setRepeatHint(null);
                                setShowSuggestions(true);
                              }}
                              data-testid="input-job-name"
                            />
                          </FormControl>
                          {showSuggestions && filtered.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-md overflow-hidden">
                              <p className="px-3 py-2 text-[11px] text-muted-foreground border-b flex items-center gap-1.5">
                                <History className="h-3 w-3" />
                                Previous jobs — select to auto-fill
                              </p>
                              <ul className="max-h-56 overflow-y-auto">
                                {filtered.map((prev) => (
                                  <li key={prev.jobName}>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-muted/60 transition-colors"
                                      data-testid={`suggestion-${prev.jobName}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        field.onChange(prev.jobName);
                                        form.setValue("logoType", "repeat_logo");
                                        setRepeatHint(prev.jobName);
                                        setShowSuggestions(false);
                                      }}
                                    >
                                      <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="text-sm flex-1 truncate">{prev.jobName}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        {repeatHint && (
                          <p className="flex items-center gap-1.5 text-xs text-primary mt-1">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Matched a previous job — Logo Type set to <strong>Repeat Logo</strong>
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="logoType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo Type *</FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2 pt-1">
                          {([
                            {
                              value: "repeat_logo",
                              icon: RefreshCw,
                              label: "Repeat Logo",
                              description: "We already have this logo set up and ready to go",
                              testId: "button-logo-type-repeat",
                            },
                            {
                              value: "new_logo",
                              icon: Sparkles,
                              label: "Digitising Required",
                              description: "New logo setup — £12 charge, allow 48 hours for a sample",
                              testId: "button-logo-type-new",
                            },
                            {
                              value: "new_logo_files_supplied",
                              icon: Layers,
                              label: "New Logo — Embroidery files & Madeira thread colours supplied",
                              description: "You are providing your own embroidery files and thread colour references",
                              testId: "button-logo-type-files-supplied",
                            },
                          ] as const).map(({ value, icon: Icon, label, description, testId }) => {
                            const selected = field.value === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => field.onChange(value)}
                                data-testid={testId}
                                className={`flex items-center gap-4 w-full p-4 rounded-md border text-left transition-colors ${
                                  selected
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                                }`}
                              >
                                <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  selected ? "border-primary" : "border-muted-foreground/40"
                                }`}>
                                  {selected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                                </div>
                                <Icon className={`h-5 w-5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                                <div className="min-w-0">
                                  <p className={`font-medium text-sm ${selected ? "text-primary" : "text-foreground"}`}>{label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
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
                        <FormLabel>Garment Quantity (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 50"
                            {...field}
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
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
                          min={format(addDays(new Date(), 3), "yyyy-MM-dd")}
                          data-testid="input-dispatch-date"
                        />
                      </FormControl>
                      <FormDescription className="space-y-2">
                        <span className="block">Please tell us when you need us to despatch the order.</span>
                        <span className="block">We will always schedule production to meet your requested despatch date wherever possible.</span>
                        <span className="block">Please remember that production time begins once all garments have been received and all artwork has been approved.</span>
                        <span className="block">Most orders are completed within 3–4 working days; however, larger, specialist, or incomplete orders may require additional time.</span>
                        <span className="block font-medium text-foreground pt-1">Priority Production Service Available</span>
                        <span className="block">Need it urgently? Orders of up to 100 units may be eligible for our Priority Production Service, with despatch within 2 working days of garments being received and artwork approval.</span>
                        <span className="block">A 100% production surcharge applies, and the service is subject to capacity. Please contact us before submitting your order to confirm availability.</span>
                      </FormDescription>
                      {dispatchCapacityWarning && (
                        <div
                          className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 flex items-start gap-3"
                          data-testid="warning-capacity"
                        >
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                          <div className="flex-1 text-sm">
                            <p className="font-medium text-amber-900 dark:text-amber-200">
                              Selected date may be too soon for current production capacity
                            </p>
                            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                              Based on current machine load and staff shifts, the earliest realistic dispatch date is <strong>{format(new Date(dispatchCapacityWarning), "EEE d MMM yyyy")}</strong>. You can still keep your chosen date — we'll do our best, but it may not be guaranteed.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={() => form.setValue("requiredDispatchDate", dispatchCapacityWarning, { shouldValidate: true })}
                              data-testid="button-use-suggested-date"
                            >
                              Use suggested date
                            </Button>
                          </div>
                        </div>
                      )}
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
                          autoResize
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
                          autoResize
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <div>
                    <FormLabel>Attach Files (Optional)</FormLabel>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Upload logos, artwork, or reference images
                    </p>
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div
                          key={file.objectKey}
                          className="flex items-center justify-between p-3 bg-muted rounded-md"
                          data-testid={`file-${file.fileName}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">{file.fileName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              ({Math.round(file.fileSize / 1024)} KB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setUploadedFiles(prev => prev.filter(f => f.objectKey !== file.objectKey))}
                            data-testid={`button-remove-${file.fileName}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`relative border-2 border-dashed rounded-md p-8 text-center transition-colors ${
                      isDragOver
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/40"
                    }`}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const files = e.dataTransfer?.files;
                      if (files && files.length > 0) uploadFiles(files);
                    }}
                    data-testid="dropzone-files"
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2 pointer-events-none">
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                        <p className="text-sm text-muted-foreground">Uploading…</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 pointer-events-none">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Drop your files here or <span className="text-primary underline">browse</span></p>
                        <p className="text-xs text-muted-foreground">Any file type accepted</p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          uploadFiles(e.target.files);
                          e.target.value = "";
                        }
                      }}
                      data-testid="input-file-upload"
                    />
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

      <AlertDialog open={showOverdueDialog} onOpenChange={setShowOverdueDialog}>
        <AlertDialogContent data-testid="dialog-overdue-invoices">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unpaid Invoice Reminder
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Our records show you have {overdueData?.overdueInvoices?.length === 1 ? "an invoice" : `${overdueData?.overdueInvoices?.length} invoices`} that {overdueData?.overdueInvoices?.length === 1 ? "is" : "are"} more than 30 days old and still unpaid.
              </p>
              <p className="font-semibold text-foreground">
                We may not be able to process this order until your outstanding invoices are paid.
              </p>
              {overdueData?.overdueInvoices && overdueData.overdueInvoices.length > 0 && (
                <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
                  {overdueData.overdueInvoices.map((inv) => (
                    <div
                      key={inv.invoiceNumber}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-testid={`row-overdue-invoice-${inv.invoiceNumber}`}
                    >
                      <span className="font-medium text-foreground">{inv.invoiceNumber || "Invoice"}</span>
                      <span className="text-muted-foreground">{inv.daysOld} days old</span>
                      <span className="font-medium text-foreground">£{inv.amountDue.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                If you have already paid, please disregard this message. For any queries, please get in touch with our team.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setOverdueAcknowledged(true);
                setShowOverdueDialog(false);
              }}
              data-testid="button-overdue-acknowledge"
            >
              I understand, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showExpressDialog} onOpenChange={setShowExpressDialog}>
        <AlertDialogContent data-testid="dialog-express-delivery">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Priority Production Service
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have requested a despatch date of {pendingDispatchWorkingDays} day{pendingDispatchWorkingDays === 1 ? "" : "s"} from today, which requires our Priority Production Service.
              </p>
              <p className="font-semibold text-foreground">
                This will incur a 100% production surcharge on your order total.
              </p>
              <p className="text-sm text-muted-foreground">
                Standard production (7+ days lead time) has no additional charges. This service is subject to capacity.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExpressDialog(false)} data-testid="button-express-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExpressConfirm} data-testid="button-express-confirm">
              Confirm Priority Production
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { insertCustomerSchema, type Customer } from "@shared/schema";
import { Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertCustomerSchema
  .omit({ pricingTable2025: true, pricingTable2026: true })
  .extend({
    name: z.string().min(1, "Customer name is required"),
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    telephone: z.string().optional(),
    address: z.string().optional(),
    logoUrl: z.string().optional().or(z.literal("")),
    active: z.boolean().default(true),
    xeroContactId: z.string().optional(),
  });

interface CustomerFormDialogProps {
  trigger?: React.ReactNode;
  customer?: Customer;
  onSubmit: (data: Omit<z.infer<typeof formSchema>, never> & { pricingTable2025: boolean; pricingTable2026: boolean; logoUrl?: string; active: boolean }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  canDeactivateCustomers?: boolean;
}

export function CustomerFormDialog({ trigger, customer, onSubmit, open: controlledOpen, onOpenChange, canDeactivateCustomers = false }: CustomerFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const isEditMode = !!customer;
  const { toast } = useToast();

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contactFirstName: "",
      contactLastName: "",
      email: "",
      telephone: "",
      address: "",
      logoUrl: "",
      active: true,
    },
  });

  useEffect(() => {
    if (customer && open) {
      form.reset({
        name: customer.name,
        contactFirstName: customer.contactFirstName || "",
        contactLastName: customer.contactLastName || "",
        email: customer.email || "",
        telephone: customer.telephone || "",
        address: customer.address || "",
        logoUrl: customer.logoUrl || "",
        active: customer.active !== false,
        xeroContactId: customer.xeroContactId || "",
      });
      setPreviewUrl(customer.logoUrl || "");
    } else if (!open) {
      form.reset({
        name: "",
        contactFirstName: "",
        contactLastName: "",
        email: "",
        telephone: "",
        address: "",
        logoUrl: "",
        active: true,
        xeroContactId: "",
      });
      setPreviewUrl("");
    }
  }, [customer, open, form]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/staff/upload-logo", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-file-type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });
      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      form.setValue("logoUrl", url);
      setPreviewUrl(url);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the logo. Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    const { active, ...rest } = data;
    const submitData = {
      ...rest,
      pricingTable2025: isEditMode ? (customer?.pricingTable2025 ?? false) : false,
      pricingTable2026: isEditMode ? (customer?.pricingTable2026 ?? true) : true,
      active: active !== false,
    };
    onSubmit(submitData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Customer" : "Add Customer"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update customer information" : "Add a new customer to the system"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter customer name" data-testid="input-customer-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactFirstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact First Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="First name" data-testid="input-contact-first-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactLastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Last name" data-testid="input-contact-last-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="contact@example.com" data-testid="input-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telephone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telephone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter phone number" data-testid="input-telephone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Enter customer address" rows={3} data-testid="input-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Logo field — URL input with inline upload button */}
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo</FormLabel>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    data-testid="input-logo-file"
                  />
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://example.com/logo.png or upload →"
                        data-testid="input-logo-url"
                        onChange={e => { field.onChange(e); setPreviewUrl(e.target.value); }}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title="Upload image file"
                      data-testid="button-upload-logo"
                    >
                      {uploading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Upload className="h-4 w-4" />}
                    </Button>
                    {previewUrl && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => { form.setValue("logoUrl", ""); setPreviewUrl(""); }}
                        title="Clear logo"
                        data-testid="button-clear-logo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                  {previewUrl && (
                    <div className="mt-2 p-2 border rounded-md bg-muted">
                      <img
                        src={previewUrl}
                        alt="Logo preview"
                        className="max-h-16 max-w-full object-contain mx-auto"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </div>
                  )}
                </FormItem>
              )}
            />

            {isEditMode && (
              <FormField
                control={form.control}
                name="xeroContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Xero Contact ID <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. abc12345-..." data-testid="input-xero-contact-id" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Paste the Xero Contact ID to link this customer directly. Invoices will appear in their portal automatically.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isEditMode && canDeactivateCustomers && (
              <div className="space-y-3 pt-2 border-t">
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3">
                      <FormControl>
                        <Checkbox
                          checked={!field.value}
                          onCheckedChange={(checked) => field.onChange(!checked)}
                          data-testid="checkbox-inactive"
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        Inactive (dormant account)
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-customer">
                {isEditMode ? "Update Customer" : "Add Customer"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

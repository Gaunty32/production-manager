import { useState, useEffect } from "react";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { insertCustomerSchema, type Customer } from "@shared/schema";

const formSchema = insertCustomerSchema
  .omit({ pricingTable2025: true, pricingTable2026: true })
  .extend({
    name: z.string().min(1, "Customer name is required"),
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
    telephone: z.string().optional(),
    address: z.string().optional(),
    pricingTable: z.enum(["none", "2025", "2026"]).default("none"),
  });

interface CustomerFormDialogProps {
  trigger?: React.ReactNode;
  customer?: Customer;
  onSubmit: (data: z.infer<typeof formSchema>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CustomerFormDialog({ trigger, customer, onSubmit, open: controlledOpen, onOpenChange }: CustomerFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const isEditMode = !!customer;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contactFirstName: "",
      contactLastName: "",
      email: "",
      telephone: "",
      address: "",
      pricingTable: "none",
    },
  });

  useEffect(() => {
    if (customer && open) {
      // Determine which pricing table is set
      const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : "none";
      
      form.reset({
        name: customer.name,
        contactFirstName: customer.contactFirstName || "",
        contactLastName: customer.contactLastName || "",
        email: customer.email || "",
        telephone: customer.telephone || "",
        address: customer.address || "",
        pricingTable,
      });
    } else if (!open) {
      form.reset({
        name: "",
        contactFirstName: "",
        contactLastName: "",
        email: "",
        telephone: "",
        address: "",
        pricingTable: "none",
      });
    }
  }, [customer, open, form]);

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    // Convert radio button selection to boolean fields
    const { pricingTable, ...rest } = data;
    const submitData = {
      ...rest,
      pricingTable2025: pricingTable === "2025",
      pricingTable2026: pricingTable === "2026",
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
            
            <div className="space-y-3 pt-2 border-t">
              <FormField
                control={form.control}
                name="pricingTable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pricing Table</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="none" id="pricing-none" data-testid="radio-pricing-none" />
                          <label htmlFor="pricing-none" className="text-sm font-normal cursor-pointer">
                            No Pricing Table
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="2025" id="pricing-2025" data-testid="radio-pricing-2025" />
                          <label htmlFor="pricing-2025" className="text-sm font-normal cursor-pointer">
                            Pricing Table 2025
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="2026" id="pricing-2026" data-testid="radio-pricing-2026" />
                          <label htmlFor="pricing-2026" className="text-sm font-normal cursor-pointer">
                            Pricing Table 2026
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

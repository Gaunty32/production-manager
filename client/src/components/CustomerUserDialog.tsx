import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import type { Customer } from "@shared/schema";

const customerUserSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

interface CustomerUserDialogProps {
  trigger?: React.ReactNode;
  customers: Customer[];
  onSubmit: (data: z.infer<typeof customerUserSchema>) => Promise<void> | void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isPending?: boolean;
}

export function CustomerUserDialog({ 
  trigger, 
  customers,
  onSubmit, 
  open: controlledOpen, 
  onOpenChange,
  isPending = false,
}: CustomerUserDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof customerUserSchema>>({
    resolver: zodResolver(customerUserSchema),
    defaultValues: {
      customerId: "",
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        customerId: "",
        email: "",
        firstName: "",
        lastName: "",
      });
      setIsSubmitting(false);
    }
  }, [open, form]);

  const selectedCustomerId = form.watch("customerId");
  useEffect(() => {
    if (selectedCustomerId) {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      if (selectedCustomer) {
        if (selectedCustomer.email) {
          form.setValue("email", selectedCustomer.email);
        }
        if (selectedCustomer.contactFirstName) {
          form.setValue("firstName", selectedCustomer.contactFirstName);
        }
        if (selectedCustomer.contactLastName) {
          form.setValue("lastName", selectedCustomer.contactLastName);
        }
      }
    }
  }, [selectedCustomerId, customers, form]);

  const handleSubmit = async (data: z.infer<typeof customerUserSchema>) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      // Error is handled by the mutation, keep dialog open
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Create Customer Portal Login</DialogTitle>
          <DialogDescription>
            Create a login account for a customer. They'll receive an email with a secure link to set their own password.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-customer">
                        <SelectValue placeholder="Select a customer" />
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
                  <FormDescription>
                    The company this login will be associated with
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address *</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="customer@example.com" 
                      {...field} 
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormDescription>
                    An invite link will be sent to this address
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="John" 
                        {...field} 
                        data-testid="input-first-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Smith" 
                        {...field} 
                        data-testid="input-last-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isPending} data-testid="button-create-login">
                <UserPlus className="mr-2 h-4 w-4" />
                {isSubmitting ? "Creating..." : "Create & Send Invite"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

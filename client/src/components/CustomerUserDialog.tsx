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
import { UserPlus, Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react";
import type { Customer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const customerUserSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

// Generate a cryptographically secure random password with guaranteed character variety
function generatePassword(): string {
  const length = 12;
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const special = "!@#$%^&*";
  
  // Helper function to pick a random character from a set using rejection sampling
  const pickRandom = (charset: string): string => {
    const charsetLength = charset.length;
    const maxValid = 256 - (256 % charsetLength);
    
    while (true) {
      const randomValue = new Uint8Array(1);
      window.crypto.getRandomValues(randomValue);
      
      if (randomValue[0] < maxValid) {
        return charset.charAt(randomValue[0] % charsetLength);
      }
    }
  };
  
  // Ensure at least one character from each required category
  const password: string[] = [
    pickRandom(lowercase),
    pickRandom(uppercase),
    pickRandom(digits),
    pickRandom(special),
  ];
  
  // Fill remaining slots with random characters from all categories
  const allChars = lowercase + uppercase + digits + special;
  while (password.length < length) {
    password.push(pickRandom(allChars));
  }
  
  // Shuffle the password array using Fisher-Yates with rejection sampling
  for (let i = password.length - 1; i > 0; i--) {
    const maxValid = 256 - (256 % (i + 1));
    let j: number;
    
    while (true) {
      const randomValue = new Uint8Array(1);
      window.crypto.getRandomValues(randomValue);
      
      if (randomValue[0] < maxValid) {
        j = randomValue[0] % (i + 1);
        break;
      }
    }
    
    [password[i], password[j]] = [password[j], password[i]];
  }
  
  return password.join("");
}

export function CustomerUserDialog({ 
  trigger, 
  customers,
  onSubmit, 
  open: controlledOpen, 
  onOpenChange,
  isPending = false,
}: CustomerUserDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const form = useForm<z.infer<typeof customerUserSchema>>({
    resolver: zodResolver(customerUserSchema),
    defaultValues: {
      customerId: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        customerId: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
      });
      setIsSubmitting(false);
    }
  }, [open, form]);

  // Watch for customer selection changes and auto-fill email
  const selectedCustomerId = form.watch("customerId");
  useEffect(() => {
    if (selectedCustomerId) {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      if (selectedCustomer?.email) {
        // Only auto-fill if email is currently empty or matches a previous customer's email
        const currentEmail = form.getValues("email");
        const previousCustomerEmail = customers.find(c => c.email === currentEmail)?.email;
        if (!currentEmail || previousCustomerEmail) {
          form.setValue("email", selectedCustomer.email);
        }
      }
    }
  }, [selectedCustomerId, customers, form]);

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    form.setValue("password", newPassword);
    setShowPassword(true);
    setPasswordCopied(false);
  };

  const handleCopyPassword = async () => {
    const password = form.getValues("password");
    if (password) {
      await navigator.clipboard.writeText(password);
      setPasswordCopied(true);
      toast({
        title: "Password Copied",
        description: "Password has been copied to clipboard",
      });
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

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
            Create a login account for a customer to access the customer portal and view their orders.
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
                    This will be used to log in to the customer portal
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <div className="relative flex-1">
                        <Input 
                          type={showPassword ? "text" : "password"}
                          placeholder="Minimum 8 characters" 
                          {...field} 
                          data-testid="input-password"
                          className="pr-20"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleCopyPassword}
                            disabled={!field.value}
                            data-testid="button-copy-password"
                          >
                            {passwordCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGeneratePassword}
                      data-testid="button-generate-password"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Generate
                    </Button>
                  </div>
                  <FormDescription>
                    Click "Generate" for a secure password, then copy it to share with the customer
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
              <Button type="submit" disabled={isSubmitting} data-testid="button-create-login">
                <UserPlus className="mr-2 h-4 w-4" />
                {isSubmitting ? "Creating..." : "Create Login"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

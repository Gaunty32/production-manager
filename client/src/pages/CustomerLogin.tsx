import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LogIn, HelpCircle, MapPin, Clock, Zap } from "lucide-react";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PRICING_2026 } from "@shared/pricing";
import selectLogo from "@assets/Logo350px_180px_1773835583737.jpg";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface CustomerInfo {
  found: boolean;
  customerName?: string;
  logoUrl?: string | null;
  address?: string | null;
}

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLookedUpEmailRef = useRef<string>("");

  const lookupCustomer = useCallback((email: string) => {
    if (!email || !email.includes('@') || !email.includes('.')) {
      setCustomerInfo(null);
      return;
    }
    
    // Don't lookup the same email again
    if (email.toLowerCase() === lastLookedUpEmailRef.current.toLowerCase()) {
      return;
    }
    
    // Clear any pending lookup
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce the lookup by 500ms
    debounceTimerRef.current = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const response = await fetch(`/api/customer-auth/lookup?email=${encodeURIComponent(email)}`);
        if (response.ok) {
          const data = await response.json();
          setCustomerInfo(data);
          lastLookedUpEmailRef.current = email;
        }
      } catch (error) {
        console.error('Failed to lookup customer:', error);
        setCustomerInfo(null);
      } finally {
        setIsLookingUp(false);
      }
    }, 500);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/customer-auth/login", data);
      return await response.json();
    },
    onSuccess: (customerUser: any) => {
      // Check if password reset is required
      if (customerUser.mustResetPassword) {
        toast({
          title: "Password Reset Required",
          description: "Please set a new password to continue",
        });
        setLocation("/customer/reset-password");
      } else {
        toast({
          title: "Success",
          description: "You have been logged in successfully",
        });
        setLocation("/customer/dashboard");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setIsLoading(true);
    loginMutation.mutate(data);
  };

  // Get unique stitch count headers from the pricing table
  const stitchHeaders = PRICING_2026[0].prices
    .filter(p => p.maxStitches !== null)
    .map(p => p.maxStitches as number);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background p-4 pt-8 overflow-y-auto">
      <Card className="w-full max-w-4xl mb-6" data-testid="card-pricing-info">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl text-center">Embroidery Pricing 2026</CardTitle>
          <CardDescription className="text-center">
            Price per item (excluding VAT)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" data-testid="table-pricing">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border px-2 py-1.5 text-left font-medium">Quantity</th>
                  {stitchHeaders.map(stitches => (
                    <th key={stitches} className="border border-border px-2 py-1.5 text-center font-medium whitespace-nowrap">
                      {stitches >= 1000 ? `${stitches / 1000}k` : stitches}
                    </th>
                  ))}
                  <th className="border border-border px-2 py-1.5 text-center font-medium">50k+</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_2026.filter(tier => tier.maxQty !== null || tier.minQty < 1000).map((tier, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border border-border px-2 py-1.5 font-medium whitespace-nowrap">
                      {tier.maxQty === null 
                        ? `${tier.minQty}+` 
                        : `${tier.minQty}-${tier.maxQty}`}
                    </td>
                    {stitchHeaders.map(stitches => {
                      const priceEntry = tier.prices.find(p => p.maxStitches === stitches);
                      const price = priceEntry?.price;
                      return (
                        <td key={stitches} className="border border-border px-2 py-1.5 text-center">
                          {typeof price === "number" ? `£${price.toFixed(2)}` : price || "-"}
                        </td>
                      );
                    })}
                    <td className="border border-border px-2 py-1.5 text-center text-muted-foreground">
                      POA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md" data-testid="info-production-time">
              <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Standard Production</p>
                <p className="text-sm text-muted-foreground">3-4 working days for orders under 300 items</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md" data-testid="info-express-service">
              <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">48-Hour Express</p>
                <p className="text-sm text-muted-foreground">Available with 100% surcharge</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <img
              src={selectLogo}
              alt="Select Branding Solutions"
              className="max-h-16 max-w-full object-contain"
              data-testid="img-select-logo"
            />
          </div>
          {customerInfo?.found && customerInfo.logoUrl ? (
            <div className="flex items-center justify-center mb-4">
              <img 
                src={customerInfo.logoUrl} 
                alt={customerInfo.customerName || "Customer logo"}
                className="max-h-20 max-w-full object-contain"
                data-testid="img-customer-logo"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center mb-2">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
          )}
          <CardTitle className="text-2xl text-center">
            {customerInfo?.found ? `Welcome, ${customerInfo.customerName}` : "Customer Portal"}
          </CardTitle>
          <CardDescription className="text-center">
            Sign in to view your orders and track production
          </CardDescription>
          {customerInfo?.found && customerInfo.address && (
            <div className="mt-4 p-3 bg-muted rounded-md" data-testid="customer-address-info">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">Default Delivery Address:</p>
                  <p className="whitespace-pre-line">{customerInfo.address}</p>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        data-testid="input-email"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          lookupCustomer(e.target.value);
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          lookupCustomer(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  data-testid="link-forgot-password"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Forgot your password?
                </button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forgot Your Password?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                If you've forgotten your password, please contact Select Uniforms and we'll help you reset it.
              </p>
              <div className="bg-muted p-3 rounded-md">
                <p className="font-medium text-foreground mb-1">Contact Information:</p>
                <p className="text-sm">Email: info@selectuniforms.co.uk</p>
                <p className="text-sm">Phone: 01482 211 211</p>
              </div>
              <p className="text-sm">
                Our team will generate a new password for you and send it to your registered email address.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction data-testid="button-close-forgot-password">
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

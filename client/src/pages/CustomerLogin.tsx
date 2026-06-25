import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle, Package, Clock, CheckCircle2, Eye, EyeOff, Mail, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { MobileInstallBanner } from "@/components/MobileInstallBanner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const FEATURES = [
  {
    icon: Package,
    title: "Track your orders",
    description: "See real-time production status for every job",
  },
  {
    icon: Clock,
    title: "Dispatch dates",
    description: "Know exactly when your order is due to leave us",
  },
  {
    icon: CheckCircle2,
    title: "Logo approvals",
    description: "Review and approve artwork before it goes to production",
  },
];

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Read ?redirect= query param so we can send the customer back to where they
  // came from (e.g. clicking "View & Reply" in an email while not logged in)
  const redirectTo = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("redirect");
      if (r && r.startsWith("/customer/")) return r;
    } catch {}
    return "/customer/dashboard";
  })();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Email one-time code (passwordless) sign-in
  const [mode, setMode] = useState<"password" | "code">("password");
  const [codeStep, setCodeStep] = useState<"email" | "code">("email");
  const [codeEmail, setCodeEmail] = useState("");
  const [code, setCode] = useState("");

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const requestCodeMutation = useMutation({
    mutationFn: async (email: string) => {
      return await apiRequest("POST", "/api/customer-auth/request-code", { email });
    },
    onSuccess: () => {
      setCodeStep("code");
      toast({ title: "Code sent", description: "Check your email for a 6-digit sign-in code." });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't send code",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/customer-auth/verify-code", { email: codeEmail, code });
    },
    onSuccess: () => {
      toast({ title: "Welcome back!", description: "You've been signed in successfully." });
      setLocation(redirectTo);
    },
    onError: (error: any) => {
      toast({
        title: "Sign in failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
    },
  });

  const resetCodeFlow = () => {
    setMode("password");
    setCodeStep("email");
    setCode("");
  };

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLookedUpEmailRef = useRef<string>("");

  const lookupCustomer = useCallback((email: string) => {
    if (!email || !email.includes("@") || !email.includes(".")) {
      setCustomerInfo(null);
      return;
    }
    if (email.toLowerCase() === lastLookedUpEmailRef.current.toLowerCase()) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const response = await fetch(
          `/api/customer-auth/lookup?email=${encodeURIComponent(email)}`
        );
        if (response.ok) {
          const data = await response.json();
          setCustomerInfo(data);
          lastLookedUpEmailRef.current = email;
        }
      } catch {
        setCustomerInfo(null);
      } finally {
        setIsLookingUp(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/customer-auth/login", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome back!", description: "You've been signed in successfully." });
      setLocation(redirectTo);
    },
    onError: (error: any) => {
      toast({
        title: "Sign in failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
    onSettled: () => setIsLoading(false),
  });

  const onSubmit = (data: LoginFormData) => {
    setIsLoading(true);
    loginMutation.mutate(data);
  };

  const hasCustomer = customerInfo?.found && customerInfo.customerName;

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/70 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-white transform -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white transform translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative z-10 max-w-sm text-center">
          <div className="mb-8 inline-flex items-center justify-center">
            <div className="bg-white/15 rounded-2xl p-4 backdrop-blur-sm">
              <img
                src={selectLogo}
                alt="Select Branding Solutions"
                className="h-14 w-auto object-contain brightness-0 invert"
                data-testid="img-select-logo-panel"
              />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
            Your orders, at a glance
          </h2>
          <p className="text-white/75 text-base leading-relaxed mb-10">
            The Select Branding Solutions customer portal gives you live visibility
            into every job we're working on for you.
          </p>

          <div className="space-y-5 text-left">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{title}</p>
                  <p className="text-white/65 text-sm mt-0.5">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center lg:hidden mb-8">
            <img
              src={selectLogo}
              alt="Select Branding Solutions"
              className="h-12 w-auto object-contain"
              data-testid="img-select-logo"
            />
          </div>

          {hasCustomer && customerInfo.logoUrl && (
            <div className="flex justify-center mb-6">
              <div className="p-3 rounded-xl bg-muted/50 border">
                <img
                  src={customerInfo.logoUrl}
                  alt={customerInfo.customerName!}
                  className="max-h-14 max-w-[160px] object-contain"
                  data-testid="img-customer-logo"
                />
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "code"
                ? "Sign in with a code"
                : hasCustomer
                  ? `Welcome back, ${customerInfo.customerName}`
                  : "Sign in"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              {mode === "code"
                ? "We'll email you a 6-digit code — no password needed"
                : hasCustomer
                  ? "Enter your password to access your orders"
                  : "Sign in to your customer portal account"}
            </p>
          </div>

          {mode === "code" ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={resetCodeFlow}
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                data-testid="button-back-to-password"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to password sign-in
              </button>

              {codeStep === "email" ? (
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!codeEmail.trim() || requestCodeMutation.isPending) return;
                    requestCodeMutation.mutate(codeEmail.trim());
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="code-email">Email address</Label>
                    <Input
                      id="code-email"
                      type="email"
                      placeholder="you@company.com"
                      value={codeEmail}
                      onChange={(e) => setCodeEmail(e.target.value)}
                      data-testid="input-code-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!codeEmail.trim() || requestCodeMutation.isPending}
                    data-testid="button-send-code"
                  >
                    {requestCodeMutation.isPending ? "Sending…" : "Send me a code"}
                  </Button>
                </form>
              ) : (
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim().length !== 6 || verifyCodeMutation.isPending) return;
                    verifyCodeMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="code-input">Enter your code</Label>
                    <Input
                      id="code-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      className="text-center text-2xl tracking-[0.5em] font-semibold"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      data-testid="input-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      We sent a 6-digit code to {codeEmail}. It expires in 10 minutes.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={code.trim().length !== 6 || verifyCodeMutation.isPending}
                    data-testid="button-verify-code"
                  >
                    {verifyCodeMutation.isPending ? "Signing in…" : "Sign in"}
                  </Button>
                  <div className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-sm"
                      onClick={() => requestCodeMutation.mutate(codeEmail.trim())}
                      disabled={requestCodeMutation.isPending}
                      data-testid="button-resend-code"
                    >
                      {requestCodeMutation.isPending ? "Sending…" : "Resend code"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@company.com"
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
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          data-testid="input-password"
                          className="pr-10"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
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
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    const email = form.getValues("email");
                    if (email) setForgotEmail(email);
                    setShowForgotPassword(true);
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                  data-testid="link-forgot-password"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Forgot your password?
                </button>
              </div>
            </form>
          </Form>
          )}

          {mode === "password" && (
            <div className="mt-5 pt-5 border-t">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setCodeEmail(form.getValues("email"));
                  setMode("code");
                  setCodeStep("email");
                }}
                data-testid="button-use-code"
              >
                <Mail className="h-4 w-4" />
                Sign in with an email code
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground/60 mt-10">
            &copy; {new Date().getFullYear()} Select Branding Solutions
          </p>
        </div>
      </div>

      <MobileInstallBanner />

      <AlertDialog open={showForgotPassword} onOpenChange={(open) => {
        setShowForgotPassword(open);
        if (!open) { setForgotEmail(""); setForgotSent(false); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your password</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {forgotSent ? (
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <p className="font-medium text-foreground">Check your inbox</p>
                    <p className="text-muted-foreground">
                      If that email is registered, we've sent a password reset link. It expires in 48 hours.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Enter your email address and we'll send you a link to reset your password.
                    </p>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!forgotEmail || forgotSubmitting) return;
                          setForgotSubmitting(true);
                          try {
                            await apiRequest("POST", "/api/customer-auth/forgot-password", { email: forgotEmail });
                          } catch {}
                          setForgotSubmitting(false);
                          setForgotSent(true);
                        }
                      }}
                      data-testid="input-forgot-email"
                    />
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {forgotSent ? (
              <AlertDialogAction data-testid="button-close-forgot-password">
                Done
              </AlertDialogAction>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowForgotPassword(false)} data-testid="button-cancel-forgot-password">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!forgotEmail || forgotSubmitting) return;
                    setForgotSubmitting(true);
                    try {
                      await apiRequest("POST", "/api/customer-auth/forgot-password", { email: forgotEmail });
                    } catch {}
                    setForgotSubmitting(false);
                    setForgotSent(true);
                  }}
                  disabled={!forgotEmail || forgotSubmitting}
                  data-testid="button-send-reset"
                >
                  {forgotSubmitting ? "Sending…" : "Send reset link"}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

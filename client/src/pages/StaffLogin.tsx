import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogIn, LayoutDashboard, MonitorSmartphone, ExternalLink, Mail, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import sbsLogo from "@assets/logo_transparent.png";

const loginSchema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function StaffLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Email one-time code (passwordless) sign-in
  const [mode, setMode] = useState<"password" | "code">("password");
  const [codeStep, setCodeStep] = useState<"email" | "code">("email");
  const [codeEmail, setCodeEmail] = useState("");
  const [code, setCode] = useState("");

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const requestCodeMutation = useMutation({
    mutationFn: async (email: string) => {
      return await apiRequest("POST", "/api/staff-auth/request-code", { email });
    },
    onSuccess: () => {
      setCodeStep("code");
      toast({
        title: "Code sent",
        description: "Check your email for a 6-digit sign-in code.",
      });
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
      return await apiRequest("POST", "/api/staff-auth/verify-code", {
        email: codeEmail,
        code,
      });
    },
    onSuccess: async () => {
      try {
        await fetch("/api/customer-auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      toast({ title: "Welcome back", description: "You have been logged in successfully" });
      window.location.href = "/";
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

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest("POST", "/api/staff-auth/login", data);
    },
    onSuccess: async () => {
      try {
        await fetch("/api/customer-auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      toast({
        title: "Welcome back",
        description: "You have been logged in successfully",
      });
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-6">

      {/* Logo */}
      <img
        src={sbsLogo}
        alt="Select Branding Solutions"
        className="object-contain mb-2"
        style={{ maxHeight: "72px", maxWidth: "260px", width: "100%" }}
      />

      {/* Login card */}
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-1">
            <LogIn className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Production Management</CardTitle>
          <CardDescription className="text-center">
            Sign in to manage orders and production
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "password" ? (
            <>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username or Email</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="username or email"
                            data-testid="input-email"
                            {...field}
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
                  <div className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-sm"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </Button>
                  </div>
                </form>
              </Form>

              <div className="mt-4 pt-4 border-t">
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
            </>
          ) : (
            <div className="space-y-4">
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
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!codeEmail.trim() || requestCodeMutation.isPending) return;
                    requestCodeMutation.mutate(codeEmail.trim());
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="code-email">Username or Email</Label>
                    <Input
                      id="code-email"
                      type="text"
                      placeholder="username or email"
                      value={codeEmail}
                      onChange={(e) => setCodeEmail(e.target.value)}
                      data-testid="input-code-email"
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll email you a 6-digit code to sign in — no password needed.
                    </p>
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
                  className="space-y-4"
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
                      We sent a 6-digit code to your email. It expires in 10 minutes.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={code.trim().length !== 6 || verifyCodeMutation.isPending}
                    data-testid="button-verify-code"
                  >
                    {verifyCodeMutation.isPending ? "Signing in…" : "Sign In"}
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
          )}
          <div className="mt-6 pt-5 border-t text-center">
            <p className="text-sm text-muted-foreground mb-2">Are you a customer?</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/customer/login")}
              data-testid="link-customer-portal"
            >
              Go to Customer Portal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Demo pages */}
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center mb-3">
          Demo Pages
        </p>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="/demo-access"
            className="flex flex-col items-center gap-2.5 rounded-md border bg-card p-4 text-center hover-elevate transition-colors"
            data-testid="link-landing-page"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Landing Page</p>
              <p className="text-xs text-muted-foreground mt-0.5">Staff production portal demo</p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
          </a>
          <a
            href="/portal-preview"
            className="flex flex-col items-center gap-2.5 rounded-md border bg-card p-4 text-center hover-elevate transition-colors"
            data-testid="link-portal-preview"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Portal Preview</p>
              <p className="text-xs text-muted-foreground mt-0.5">Customer portal interactive demo</p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
          </a>
        </div>
      </div>

    </div>
  );
}

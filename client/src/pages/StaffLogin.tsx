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
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";
import { useLocation } from "wouter";

const loginSchema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function StaffLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest("POST", "/api/staff-auth/login", data);
    },
    onSuccess: async () => {
      // Clear any stale customer session before navigating to staff portal
      try {
        await fetch("/api/customer-auth/logout", { method: "POST" });
      } catch {
        // Ignore — clearing stale session is best-effort
      }
      toast({
        title: "Welcome back",
        description: "You have been logged in successfully",
      });
      // Force reload to ensure session is recognized
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Production Management</CardTitle>
          <CardDescription className="text-center">
            Sign in to manage orders and production
          </CardDescription>
        </CardHeader>
        <CardContent>
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
    </div>
  );
}

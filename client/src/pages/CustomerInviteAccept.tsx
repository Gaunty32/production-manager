import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { LockKeyhole, AlertCircle, CheckCircle2 } from "lucide-react";

const schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type TokenState = "loading" | "valid" | "invalid" | "expired";

export default function CustomerInviteAccept() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const token = new URLSearchParams(search).get("token") ?? "";

  const [tokenState, setTokenState] = useState<TokenState>("loading");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState("");
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      setErrorMessage("No invite token found in this link.");
      return;
    }
    fetch(`/api/customer-invite?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: "Invalid link" }));
          const msg: string = body.error || "Invalid link";
          setErrorMessage(msg);
          setTokenState(msg.toLowerCase().includes("expired") ? "expired" : "invalid");
        } else {
          const data = await r.json();
          setFirstName(data.firstName ?? null);
          setEmail(data.email ?? "");
          setTokenState("valid");
        }
      })
      .catch(() => {
        setErrorMessage("Unable to validate link. Please try again.");
        setTokenState("invalid");
      });
  }, [token]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const handleSubmit = async (values: z.infer<typeof schema>) => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/customer-invite", {
        token,
        newPassword: values.newPassword,
      });
      setDone(true);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to set password",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Card className="w-full max-w-md">
        {tokenState === "loading" && (
          <>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-muted rounded-full animate-pulse" />
              <CardTitle>Validating your link…</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-24 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
            </CardContent>
          </>
        )}

        {(tokenState === "invalid" || tokenState === "expired") && (
          <>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>{tokenState === "expired" ? "Link Expired" : "Invalid Link"}</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
                Ask your team administrator to send you a new invite link.
              </p>
              <Button className="w-full mt-4" variant="outline" onClick={() => setLocation("/customer/login")}>
                Go to Login
              </Button>
            </CardContent>
          </>
        )}

        {tokenState === "valid" && done && (
          <>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle>Password Set</CardTitle>
              <CardDescription>
                Your password has been set. You can now log in to the customer portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setLocation("/customer/login")} data-testid="button-go-login">
                Go to Login
              </Button>
            </CardContent>
          </>
        )}

        {tokenState === "valid" && !done && (
          <>
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <LockKeyhole className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {firstName ? `Welcome, ${firstName}` : "Welcome"}
                </CardTitle>
                {email && (
                  <CardDescription className="mt-1">Setting password for {email}</CardDescription>
                )}
                <CardDescription className="mt-2">
                  Choose a password to access your customer portal account.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField control={form.control} name="newPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 8 characters" {...field} data-testid="input-new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat your password" {...field} data-testid="input-confirm-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-set-password">
                    {isSubmitting ? "Setting password…" : "Set Password & Continue"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

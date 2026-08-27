import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2 } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(7, "Phone number is required"),
  company: z.string().min(1, "Company name is required"),
});

type FormValues = z.infer<typeof schema>;

export default function DemoLeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", company: "" },
  });

  const requestMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/demo/request-access", data);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Unable to send request");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  const onSubmit = (data: FormValues) => requestMutation.mutate(data);

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Book a Discovery Call</h2>
        <p className="text-muted-foreground">
          Leave your details and we'll send you instant demo access, then follow up to find a time that works.
        </p>
      </div>

      <div className="bg-card border rounded-lg p-8 shadow-sm">
        {submitted ? (
          <div className="flex flex-col items-center text-center gap-5 py-6">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">You're all set!</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We've sent a link to your inbox so you can explore the customer portal right away. Someone from the team will also be in touch shortly to book your discovery call.
              </p>
              <p className="text-muted-foreground text-sm">
                Can't see the email? Check your spam folder or request again below.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => { setSubmitted(false); form.reset(); }}
              data-testid="button-try-again"
            >
              Send again
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" data-testid="input-first-name" {...field} />
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
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input placeholder="Smith" data-testid="input-last-name" {...field} />
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
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@yourcompany.com" data-testid="input-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="07700 900000" data-testid="input-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Ltd" data-testid="input-company" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {requestMutation.isError && (
                <p className="text-sm text-destructive">
                  {(requestMutation.error as Error)?.message || "Something went wrong. Please try again."}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={requestMutation.isPending}
                data-testid="button-request-demo"
              >
                {requestMutation.isPending ? "Sending..." : "Book a Discovery Call"}
              </Button>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By submitting, you agree that Select Branding Solutions may follow up with you.
                No spam, ever.
              </p>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
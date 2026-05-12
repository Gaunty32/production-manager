import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, CheckCircle2 } from "lucide-react";

const schema = z.object({
  title: z.string().min(3, "Please give your idea a short title").max(200),
  description: z.string().min(10, "Please describe your idea in a bit more detail").max(2000),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitterType: "staff" | "customer";
  endpoint?: string; // defaults to /api/feature-requests
}

export function FeatureRequestDialog({ open, onOpenChange, submitterType, endpoint = "/api/feature-requests" }: Props) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", endpoint, data),
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleClose = (open: boolean) => {
    if (!open) { setSubmitted(false); form.reset(); }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-semibold">Thanks for the suggestion!</p>
              <p className="text-sm text-muted-foreground mt-1">Your idea has been sent for review. We'll prioritise it alongside other requests.</p>
            </div>
            <Button onClick={() => handleClose(false)} className="mt-2">Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                <DialogTitle>Suggest a Feature</DialogTitle>
              </div>
              <DialogDescription>
                Got an idea for an improvement? We'd love to hear it.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pt-1">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What's the idea? <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Show estimated completion time on each job" data-testid="input-feature-title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tell us more <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the problem it would solve or how it would work…"
                          rows={4}
                          data-testid="input-feature-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
                  <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-feature">
                    {mutation.isPending ? "Sending…" : "Send Suggestion"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

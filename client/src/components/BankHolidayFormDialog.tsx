import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BankHoliday } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  date: z.date({ required_error: "Date is required" }),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface BankHolidayFormDialogProps {
  holiday?: BankHoliday | null;
  trigger?: React.ReactNode;
  onClose?: () => void;
}

export function BankHolidayFormDialog({
  holiday,
  trigger,
  onClose,
}: BankHolidayFormDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(!!holiday);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: holiday?.name || "",
      date: holiday?.date ? new Date(holiday.date) : undefined,
      description: holiday?.description || "",
    },
  });

  useEffect(() => {
    if (holiday) {
      setOpen(true);
      form.reset({
        name: holiday.name,
        date: new Date(holiday.date),
        description: holiday.description || "",
      });
    }
  }, [holiday, form]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bank-holidays", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      toast({
        title: "Success",
        description: "Bank holiday added successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add bank holiday",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/bank-holidays/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-holidays"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-holidays/me"] });
      toast({
        title: "Success",
        description: "Bank holiday updated successfully",
      });
      setOpen(false);
      form.reset();
      onClose?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update bank holiday",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      name: values.name,
      date: values.date.toISOString(),
      description: values.description,
    };

    if (holiday) {
      updateMutation.mutate({ id: holiday.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {holiday ? "Edit Bank Holiday" : "Add Bank Holiday"}
          </DialogTitle>
          <DialogDescription>
            {holiday
              ? "Update the bank holiday details below"
              : "Add a new company-wide bank holiday"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Christmas Day"
                      data-testid="input-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-date"
                        >
                          {field.value ? (
                            format(field.value, "dd MMM yyyy")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details..."
                      className="resize-none"
                      rows={3}
                      data-testid="input-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : holiday
                  ? "Update"
                  : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

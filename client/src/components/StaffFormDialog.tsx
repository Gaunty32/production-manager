import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { insertStaffSchema, type Staff } from "@shared/schema";

const formSchema = insertStaffSchema.extend({
  name: z.string().min(1, "Staff name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  telephone: z.string().optional(),
});

interface StaffFormDialogProps {
  trigger?: React.ReactNode;
  staff?: Staff;
  onSubmit: (data: z.infer<typeof formSchema>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StaffFormDialog({ trigger, staff, onSubmit, open: controlledOpen, onOpenChange }: StaffFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const isEditMode = !!staff;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      telephone: "",
    },
  });

  useEffect(() => {
    if (staff && open) {
      form.reset({
        name: staff.name,
        email: staff.email || "",
        telephone: staff.telephone || "",
      });
    } else if (!open) {
      form.reset({
        name: "",
        email: "",
        telephone: "",
      });
    }
  }, [staff, open, form]);

  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    onSubmit(data);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update staff member information" : "Add a new staff member to the system"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Staff Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter staff name" data-testid="input-staff-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="email@example.com" data-testid="input-staff-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telephone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telephone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Phone number" data-testid="input-staff-telephone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-staff">
                {isEditMode ? "Update Staff Member" : "Add Staff Member"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

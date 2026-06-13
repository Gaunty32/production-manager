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
import { Switch } from "@/components/ui/switch";
import { insertStaffSchema, type Staff, UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

const formSchema = insertStaffSchema.extend({
  name: z.string().min(1, "Staff name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  telephone: z.string().optional(),
  holidayAllowance: z.coerce.number().min(0, "Allowance must be 0 or more"),
  canApproveHolidays: z.boolean(),
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
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      telephone: "",
      holidayAllowance: 23,
      canApproveHolidays: false,
    },
  });

  useEffect(() => {
    if (staff && open) {
      form.reset({
        name: staff.name,
        email: staff.email || "",
        telephone: staff.telephone || "",
        holidayAllowance: staff.holidayAllowance ?? 23,
        canApproveHolidays: staff.canApproveHolidays ?? false,
      });
    } else if (!open) {
      form.reset({
        name: "",
        email: "",
        telephone: "",
        holidayAllowance: 23,
        canApproveHolidays: false,
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
            <FormField
              control={form.control}
              name="holidayAllowance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Holiday Allowance (days per year)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      {...field}
                      value={field.value ?? 23}
                      data-testid="input-staff-holiday-allowance"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isSuperAdmin && (
              <FormField
                control={form.control}
                name="canApproveHolidays"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <FormLabel className="text-sm font-normal">Can approve holidays</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Allow this staff member to approve or decline others' holiday requests.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-staff-can-approve"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
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

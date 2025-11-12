import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MACHINE_NAMES } from "@shared/machines";
import type { MachineScheduleBlock } from "@shared/schema";
import { WrenchIcon } from "lucide-react";

const MACHINES = [1, 2, 3, 4, 5];

const BLOCK_TYPES = [
  { value: "maintenance", label: "Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "downtime", label: "Downtime" },
  { value: "other", label: "Other" },
];

const blockFormSchema = z.object({
  machineId: z.string().min(1, "Please select a machine"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().regex(/^\d{1,4}$/, "Start time must be in minutes (0-1439)"),
  endTime: z.string().regex(/^\d{1,4}$/, "End time must be in minutes (0-1439)"),
  blockType: z.string().min(1, "Block type is required"),
  notes: z.string().optional(),
}).refine(
  (data) => {
    const start = parseInt(data.startTime);
    const end = parseInt(data.endTime);
    return start < end && start >= 0 && end <= 1439;
  },
  {
    message: "End time must be after start time and within 0-1439 minutes",
    path: ["endTime"],
  }
);

type BlockFormValues = z.infer<typeof blockFormSchema>;

interface MachineBlockDialogProps {
  trigger?: React.ReactNode;
  block?: MachineScheduleBlock;
  onSuccess?: () => void;
}

export function MachineBlockDialog({ trigger, block, onSuccess }: MachineBlockDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<BlockFormValues>({
    resolver: zodResolver(blockFormSchema),
    defaultValues: block
      ? {
          machineId: block.machineId.toString(),
          date: new Date(block.date).toISOString().split('T')[0],
          startTime: block.startTime.toString(),
          endTime: block.endTime.toString(),
          blockType: block.blockType,
          notes: block.notes || "",
        }
      : {
          machineId: "",
          date: new Date().toISOString().split('T')[0],
          startTime: "540",
          endTime: "1020",
          blockType: "maintenance",
          notes: "",
        },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/machine-schedule-blocks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine-schedule-blocks"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Machine block created successfully",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create machine block",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/machine-schedule-blocks/${block?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine-schedule-blocks"] });
      setOpen(false);
      toast({
        title: "Success",
        description: "Machine block updated successfully",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update machine block",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: BlockFormValues) => {
    const data = {
      machineId: parseInt(values.machineId),
      date: values.date,
      startTime: parseInt(values.startTime),
      endTime: parseInt(values.endTime),
      blockType: values.blockType,
      notes: values.notes || null,
      jobId: null,
    };

    if (block) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-add-machine-block">
            <WrenchIcon className="mr-2 h-4 w-4" />
            Block Machine
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-machine-block">
        <DialogHeader>
          <DialogTitle>{block ? "Edit" : "Add"} Machine Block</DialogTitle>
          <DialogDescription>
            {block ? "Update" : "Create"} a maintenance or downtime block for a machine. Time is in minutes from midnight.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="machineId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machine</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-machine">
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MACHINES.map((id) => (
                        <SelectItem key={id} value={id.toString()}>
                          {MACHINE_NAMES[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="blockType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Block Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-block-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BLOCK_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time (minutes)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" max="1439" data-testid="input-start-time" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {field.value && formatTime(parseInt(field.value))}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (minutes)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" max="1439" data-testid="input-end-time" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {field.value && formatTime(parseInt(field.value))}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} data-testid="textarea-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save"
              >
                {block ? "Update" : "Create"} Block
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MachineBlockDialog } from "@/components/MachineBlockDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit } from "lucide-react";
import { MACHINE_NAMES } from "@shared/machines";
import type { MachineScheduleBlock } from "@shared/schema";
import { format } from "date-fns";

export function MachineBlocksManagement() {
  const { toast } = useToast();

  const { data: blocks = [], isLoading } = useQuery<MachineScheduleBlock[]>({
    queryKey: ["/api/machine-schedule-blocks"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/machine-schedule-blocks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine-schedule-blocks"] });
      toast({
        title: "Success",
        description: "Machine block deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete machine block",
        variant: "destructive",
      });
    },
  });

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Machine Blocks</h2>
        <MachineBlockDialog />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Machine</TableHead>
              <TableHead>Block Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading machine blocks...
                </TableCell>
              </TableRow>
            ) : blocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No machine blocks found. Add a block to schedule maintenance or downtime.
                </TableCell>
              </TableRow>
            ) : (
              blocks.map((block) => (
                <TableRow key={block.id}>
                  <TableCell className="font-medium">{MACHINE_NAMES[block.machineId]}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-1 rounded capitalize">
                      {block.blockType}
                    </span>
                  </TableCell>
                  <TableCell>{format(new Date(block.date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{formatTime(block.startTime)}</TableCell>
                  <TableCell>{formatTime(block.endTime)}</TableCell>
                  <TableCell className="max-w-xs truncate">{block.notes || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <MachineBlockDialog
                        block={block}
                        trigger={
                          <Button variant="ghost" size="icon" data-testid={`button-edit-${block.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(block.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${block.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

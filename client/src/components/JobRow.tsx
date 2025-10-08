import { format, isPast, isToday } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineBadge } from "./MachineBadge";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { calculateProductionMetrics } from "@shared/machines";
import { getCustomerColorClasses } from "@shared/colors";

interface JobRowProps {
  job: {
    id: string;
    customerId: string;
    customerName: string;
    jobName: string;
    poNumber: string;
    logoApproved: boolean;
    quantity: number;
    stitchCount: number;
    dateReceived: Date;
    requiredDispatchDate: Date;
    completedOnTime: boolean | null;
    machineId: number | null;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function JobRow({ job, onEdit, onDelete }: JobRowProps) {
  const isOverdue = isPast(job.requiredDispatchDate) && !isToday(job.requiredDispatchDate);
  const isDueToday = isToday(job.requiredDispatchDate);
  
  const metrics = calculateProductionMetrics(job.quantity, job.stitchCount, job.machineId);

  return (
    <tr
      className={cn(
        "hover-elevate",
        // Overdue takes priority over customer colors
        isOverdue && "border-l-4 border-l-destructive",
        // Customer color coding (only if not overdue)
        !isOverdue && getCustomerColorClasses(job.customerId),
        // Due today gets yellow background
        isDueToday && "bg-amber-50 dark:bg-amber-950/20"
      )}
      data-testid={`row-job-${job.id}`}
    >
      <td className="py-3 px-4 text-sm">{job.customerName}</td>
      <td className="py-3 px-4 text-sm">{job.jobName}</td>
      <td className="py-3 px-4 text-sm font-mono">{job.poNumber}</td>
      <td className="py-3 px-4">
        <StatusBadge status={job.logoApproved} type="logo" />
      </td>
      <td className="py-3 px-4 text-sm font-mono">{job.quantity}</td>
      <td className="py-3 px-4 text-sm font-mono">{job.stitchCount.toLocaleString()}</td>
      <td className="py-3 px-4">
        <MachineBadge machineId={job.machineId} />
      </td>
      <td className="py-3 px-4 text-sm font-mono">
        {metrics ? metrics.runs : "-"}
      </td>
      <td className="py-3 px-4 text-sm font-mono">
        {metrics ? `${metrics.timePerRunMinutes}m` : "-"}
      </td>
      <td className="py-3 px-4 text-sm font-mono">
        {metrics ? `${metrics.totalTimeMinutes}m` : "-"}
      </td>
      <td className="py-3 px-4 text-sm font-mono">{format(job.requiredDispatchDate, "PP")}</td>
      <td className="py-3 px-4">
        <StatusBadge status={job.completedOnTime} type="ontime" />
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(job.id)}
            data-testid={`button-edit-${job.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(job.id)}
            data-testid={`button-delete-${job.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

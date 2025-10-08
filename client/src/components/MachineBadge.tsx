import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMachineName } from "@shared/machines";

const MACHINE_STYLES = [
  "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300",
  "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
  "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
  "bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300",
];

interface MachineBadgeProps {
  machineId: number | null;
}

export function MachineBadge({ machineId }: MachineBadgeProps) {
  if (!machineId) {
    return (
      <Badge variant="outline" className="font-mono text-xs">
        Unassigned
      </Badge>
    );
  }

  const machineIndex = machineId - 1;
  const colorClass = MACHINE_STYLES[machineIndex] || MACHINE_STYLES[0];

  return (
    <Badge className={cn("font-mono text-xs no-default-hover-elevate no-default-active-elevate", colorClass)}>
      {getMachineName(machineId)}
    </Badge>
  );
}

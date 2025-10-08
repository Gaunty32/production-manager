import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface StatusBadgeProps {
  status: boolean | null;
  type: "logo" | "ontime";
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  if (status === null) {
    return (
      <Badge variant="outline" className="text-xs">
        N/A
      </Badge>
    );
  }

  if (status) {
    return (
      <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 no-default-hover-elevate no-default-active-elevate text-xs gap-1">
        <Check className="h-3 w-3" />
        Yes
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 no-default-hover-elevate no-default-active-elevate text-xs gap-1">
      <X className="h-3 w-3" />
      No
    </Badge>
  );
}

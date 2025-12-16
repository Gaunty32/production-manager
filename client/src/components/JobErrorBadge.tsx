import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, Check } from "lucide-react";

interface JobError {
  id: string;
  jobId: string;
  errorDescription: string;
  resolved: boolean;
  assignedToId: string | null;
}

interface JobErrorBadgeProps {
  errors: JobError[];
  onClick?: () => void;
}

export function JobErrorBadge({ errors, onClick }: JobErrorBadgeProps) {
  if (errors.length === 0) return null;

  const unresolvedCount = errors.filter(e => !e.resolved).length;
  const resolvedCount = errors.filter(e => e.resolved).length;
  const hasUnresolved = unresolvedCount > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="inline-flex focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
          data-testid="badge-job-errors"
        >
          <Badge
            variant={hasUnresolved ? "destructive" : "secondary"}
            className="h-5 px-1.5 text-xs gap-1 cursor-pointer"
          >
            {hasUnresolved ? (
              <>
                <AlertTriangle className="h-3 w-3" />
                <span>{unresolvedCount}</span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-green-600">{resolvedCount}</span>
              </>
            )}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="text-xs space-y-1">
          {hasUnresolved && (
            <p className="text-destructive font-medium">
              {unresolvedCount} unresolved error{unresolvedCount !== 1 ? 's' : ''}
            </p>
          )}
          {resolvedCount > 0 && (
            <p className="text-green-600">
              {resolvedCount} resolved error{resolvedCount !== 1 ? 's' : ''}
            </p>
          )}
          <p className="text-muted-foreground">Click to view details</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Check, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { User } from "@shared/schema";

interface JobError {
  id: string;
  jobId: string;
  description: string;
  resolved: boolean;
  reportedById: string;
  resolvedById: string | null;
  reportedAt: Date | string;
  resolvedAt: Date | string | null;
}

interface JobErrorsDialogProps {
  jobId: string;
  jobName: string;
  trigger?: React.ReactNode;
  users?: User[];
}

export function JobErrorsDialog({ jobId, jobName, trigger, users = [] }: JobErrorsDialogProps) {
  const [open, setOpen] = useState(false);
  const [newErrorDescription, setNewErrorDescription] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const { toast } = useToast();

  const { data: errors = [], isLoading } = useQuery<JobError[]>({
    queryKey: ['/api/jobs', jobId, 'errors'],
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const createErrorMutation = useMutation({
    mutationFn: async (description: string) => {
      return await apiRequest('POST', `/api/jobs/${jobId}/errors`, { description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'errors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-errors/unresolved'] });
      setNewErrorDescription("");
      setShowAddForm(false);
      toast({
        title: "Error Reported",
        description: "The error has been recorded against this job.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not record the error. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resolveErrorMutation = useMutation({
    mutationFn: async (errorId: string) => {
      return await apiRequest('PATCH', `/api/job-errors/${errorId}`, { resolved: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'errors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-errors/unresolved'] });
      toast({
        title: "Error Resolved",
        description: "The error has been marked as resolved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not resolve the error. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteErrorMutation = useMutation({
    mutationFn: async (errorId: string) => {
      return await apiRequest('DELETE', `/api/job-errors/${errorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'errors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/job-errors/unresolved'] });
      toast({
        title: "Error Deleted",
        description: "The error record has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not delete the error. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : "Unknown";
  };

  const handleSubmitError = () => {
    if (!newErrorDescription.trim()) return;
    createErrorMutation.mutate(newErrorDescription);
  };

  const unresolvedCount = errors.filter(e => !e.resolved).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs gap-1"
            data-testid={`button-job-errors-${jobId}`}
          >
            <AlertTriangle className="h-3 w-3" />
            Errors
            {unresolvedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                {unresolvedCount}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Job Errors: {jobName}
          </DialogTitle>
          <DialogDescription>
            Record and track errors or issues for this completed order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!showAddForm ? (
            <Button 
              variant="outline" 
              onClick={() => setShowAddForm(true)}
              className="w-full"
              data-testid="button-add-error"
            >
              <Plus className="h-4 w-4 mr-2" />
              Report New Error
            </Button>
          ) : (
            <div className="space-y-3 border rounded-md p-3 bg-muted/50">
              <Label htmlFor="error-description">Error Description</Label>
              <Textarea
                id="error-description"
                placeholder="Describe the error or issue..."
                value={newErrorDescription}
                onChange={(e) => setNewErrorDescription(e.target.value)}
                className="min-h-[80px]"
                data-testid="input-error-description"
              />
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewErrorDescription("");
                  }}
                  data-testid="button-cancel-error"
                >
                  Cancel
                </Button>
                <Button 
                  size="sm"
                  onClick={handleSubmitError}
                  disabled={!newErrorDescription.trim() || createErrorMutation.isPending}
                  data-testid="button-submit-error"
                >
                  {createErrorMutation.isPending ? "Saving..." : "Save Error"}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Error History</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading errors...</p>
            ) : errors.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-md p-4 text-center">
                No errors recorded for this job.
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {errors.map((error) => (
                  <div 
                    key={error.id} 
                    className={`border rounded-md p-3 ${error.resolved ? 'bg-muted/30' : 'bg-destructive/5 border-destructive/20'}`}
                    data-testid={`error-item-${error.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{error.description}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span>
                            Reported by {getUserName(error.reportedById)} on {format(new Date(error.reportedAt), 'dd/MM/yyyy HH:mm')}
                          </span>
                          {error.resolved && error.resolvedById && error.resolvedAt && (
                            <span className="text-green-600">
                              Resolved by {getUserName(error.resolvedById)} on {format(new Date(error.resolvedAt), 'dd/MM/yyyy HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {error.resolved ? (
                          <Badge variant="secondary" className="text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Resolved
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => resolveErrorMutation.mutate(error.id)}
                            disabled={resolveErrorMutation.isPending}
                            data-testid={`button-resolve-${error.id}`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteErrorMutation.mutate(error.id)}
                          disabled={deleteErrorMutation.isPending}
                          data-testid={`button-delete-error-${error.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

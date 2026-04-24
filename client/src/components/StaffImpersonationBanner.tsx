import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface StaffImpersonationBannerProps {
  impersonatedUser: User;
  realUser: User;
}

export function StaffImpersonationBanner({ impersonatedUser, realUser }: StaffImpersonationBannerProps) {
  const { toast } = useToast();

  const exitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/staff/impersonate/staff");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to exit impersonation",
        variant: "destructive",
      });
    },
  });

  const impersonatedName = [impersonatedUser.firstName, impersonatedUser.lastName].filter(Boolean).join(" ") || impersonatedUser.username;
  const realName = [realUser.firstName, realUser.lastName].filter(Boolean).join(" ") || realUser.username;

  return (
    <div
      className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-2 flex items-center justify-between gap-2 sticky top-0 z-50"
      data-testid="staff-impersonation-banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium truncate">
          Viewing as <span className="font-bold">{impersonatedName}</span>
          <span className="font-normal opacity-80"> (you are {realName})</span>
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-white hover:bg-amber-600 dark:hover:bg-amber-700 hover:text-white"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        data-testid="button-exit-staff-impersonation"
      >
        <X className="h-4 w-4 mr-1" />
        Return to my account
      </Button>
    </div>
  );
}

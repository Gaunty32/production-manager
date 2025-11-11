import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImpersonationBannerProps {
  customerEmail: string;
}

export function ImpersonationBanner({ customerEmail }: ImpersonationBannerProps) {
  const { toast } = useToast();

  const exitImpersonationMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/customer-impersonation");
    },
    onSuccess: () => {
      // Redirect to staff customers page
      window.location.href = "/customers";
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to exit impersonation",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-2 flex items-center justify-between shadow-md sticky top-0 z-50" data-testid="impersonation-banner">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          Viewing as customer: <span className="font-bold">{customerEmail}</span>
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-white hover:bg-orange-600 dark:hover:bg-orange-700 hover:text-white"
        onClick={() => exitImpersonationMutation.mutate()}
        disabled={exitImpersonationMutation.isPending}
        data-testid="button-exit-impersonation"
      >
        <X className="h-4 w-4 mr-1" />
        Exit View
      </Button>
    </div>
  );
}

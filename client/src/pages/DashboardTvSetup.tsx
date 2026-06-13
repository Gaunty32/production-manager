import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw, ExternalLink, Tv } from "lucide-react";

interface TvConfig {
  token: string;
  dailyTarget: number;
  path: string;
}

export default function DashboardTvSetup() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [target, setTarget] = useState("");

  const { data, isLoading } = useQuery<TvConfig>({
    queryKey: ["/api/dashboard-tv/config"],
    enabled: user?.role === "super_admin",
  });

  useEffect(() => {
    if (data?.dailyTarget != null) setTarget(String(data.dailyTarget));
  }, [data?.dailyTarget]);

  const fullUrl = data ? `${window.location.origin}${data.path}` : "";

  const save = async (body: { dailyTarget?: number; regenerateToken?: boolean }) => {
    try {
      await apiRequest("POST", "/api/dashboard-tv/config", body);
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard-tv/config"] });
      toast({ title: "Saved", description: "Dashboard settings updated." });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied", description: "Display link copied to clipboard." });
  };

  if (authLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (user?.role !== "super_admin") {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Only administrators can manage the TV dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Tv className="h-7 w-7" />
        <div>
          <h1 className="text-2xl font-bold">Production TV Dashboard</h1>
          <p className="text-muted-foreground">
            A read-only live display for the production wall. Open the link below on the TV — no login needed.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Display link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              readOnly
              value={isLoading ? "Loading…" : fullUrl}
              data-testid="input-tv-link"
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={copyLink} disabled={!data} data-testid="button-copy-link">
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(fullUrl, "_blank")}
                disabled={!data}
                data-testid="button-open-link"
              >
                <ExternalLink className="h-4 w-4 mr-2" /> Open
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view the dashboard. Regenerate it if the link is shared outside the workshop —
            the old link will stop working immediately.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("Regenerate the link? The current TV link will stop working until updated.")) {
                save({ regenerateToken: true });
              }
            }}
            data-testid="button-regenerate-token"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Regenerate link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily garment target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="target">Target (garments per day)</Label>
            <Input
              id="target"
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              data-testid="input-daily-target"
            />
          </div>
          <Button
            onClick={() => {
              const n = parseInt(target, 10);
              if (!Number.isFinite(n) || n < 1) {
                toast({ title: "Invalid", description: "Enter a positive number.", variant: "destructive" });
                return;
              }
              save({ dailyTarget: n });
            }}
            data-testid="button-save-target"
          >
            Save target
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

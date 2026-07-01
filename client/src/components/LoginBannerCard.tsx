import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Info, AlertTriangle, CheckCircle2 } from "lucide-react";

interface LoginBanner {
  enabled: boolean;
  message: string;
  variant: string;
}

const VARIANT_STYLES: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200",
  warning:
    "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200",
  success:
    "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-900 dark:text-green-200",
};

const VARIANT_ICONS: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
};

export function LoginBannerCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState("info");

  const { data, isLoading } = useQuery<LoginBanner>({
    queryKey: ["/api/customer-portal/login-banner"],
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setMessage(data.message);
      setVariant(data.variant || "info");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/login-banner", {
        enabled,
        message,
        variant,
      });
      return res.json() as Promise<LoginBanner>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/login-banner"] });
      toast({ title: "Banner saved", description: "The customer login banner has been updated." });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save banner", description: e.message, variant: "destructive" }),
  });

  const PreviewIcon = VARIANT_ICONS[variant] || Info;
  const trimmed = message.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Customer Login Banner
        </CardTitle>
        <CardDescription>
          Show a message at the top of the customer portal login page. Turn it on when you need to
          announce something, then turn it off again — no code changes needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="banner-enabled" className="text-sm font-medium">
              Show banner
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, customers won't see any banner.
            </p>
          </div>
          <Switch
            id="banner-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="switch-banner-enabled"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="banner-message">Message</Label>
          <Textarea
            id="banner-message"
            placeholder="e.g. Our office will be closed Friday 25th December for the holidays."
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="input-banner-message"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="banner-variant">Style</Label>
          <Select value={variant} onValueChange={setVariant}>
            <SelectTrigger id="banner-variant" className="w-full" data-testid="select-banner-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info (blue)</SelectItem>
              <SelectItem value="warning">Warning (amber)</SelectItem>
              <SelectItem value="success">Success (green)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {trimmed && (
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className={`rounded-md border p-3 flex items-start gap-2.5 text-sm ${VARIANT_STYLES[variant] || VARIANT_STYLES.info}`}
              data-testid="preview-banner"
            >
              <PreviewIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="leading-relaxed whitespace-pre-line">{trimmed}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={isLoading || saveMutation.isPending}
            data-testid="button-save-banner"
          >
            {saveMutation.isPending ? "Saving…" : "Save banner"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

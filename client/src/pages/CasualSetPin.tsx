import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sun } from "lucide-react";

export default function CasualSetPin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== confirm) {
      toast({ title: "PINs don't match", description: "Please enter the same PIN twice.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/casual/set-pin", { token, pin });
      toast({ title: "All set!", description: "Your PIN is saved. You can now pick up shifts." });
      navigate("/casual");
    } catch (err: any) {
      toast({ title: "Couldn't set PIN", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>This invite link is missing or broken. Please ask the office for a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/casual/login")} data-testid="button-go-login">
              Go to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sun className="h-6 w-6 text-primary" />
          </div>
          <CardTitle data-testid="text-setpin-title">Set your PIN</CardTitle>
          <CardDescription>Choose a 4–8 digit PIN to log in and pick up shifts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">New PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                placeholder="Choose a PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                data-testid="input-new-pin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm PIN</Label>
              <Input
                id="confirm"
                type="password"
                inputMode="numeric"
                placeholder="Re-enter your PIN"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                data-testid="input-confirm-pin"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-set-pin">
              {loading ? "Saving..." : "Save PIN"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

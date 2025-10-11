import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Shield, Download, QrCode, Key } from "lucide-react";
import type { User } from "@shared/schema";

export default function TwoFactorSetup() {
  const { toast } = useToast();
  const [verificationCode, setVerificationCode] = useState("");
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  } | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/2fa/setup");
      return response.json();
    },
    onSuccess: (data) => {
      setSetupData(data);
      toast({
        title: "2FA Setup Started",
        description: "Scan the QR code with your authenticator app",
      });
    },
    onError: () => {
      toast({
        title: "Setup Failed",
        description: "Failed to initialize 2FA setup",
        variant: "destructive",
      });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      if (!setupData) throw new Error("No setup data");
      
      const response = await apiRequest("POST", "/api/auth/2fa/enable", {
        secret: setupData.secret,
        token: verificationCode,
        backupCodes: setupData.backupCodes,
      });
      return response.json();
    },
    onSuccess: () => {
      setShowBackupCodes(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication is now active",
      });
    },
    onError: () => {
      toast({
        title: "Verification Failed",
        description: "Invalid verification code",
        variant: "destructive",
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/2fa/disable", {
        token: verificationCode,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setSetupData(null);
      setVerificationCode("");
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });
    },
    onError: () => {
      toast({
        title: "Disable Failed",
        description: "Invalid verification code",
        variant: "destructive",
      });
    },
  });

  const downloadBackupCodes = () => {
    if (!setupData) return;
    
    const text = setupData.backupCodes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (userLoading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!user || user.role !== "super_admin") {
    return (
      <div className="p-8">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Two-factor authentication is only available for super administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Two-Factor Authentication
        </h1>
        <p className="text-muted-foreground mt-2">
          Add an extra layer of security to your account
        </p>
      </div>

      {!user.twoFactorEnabled && !setupData && (
        <Card>
          <CardHeader>
            <CardTitle>Enable Two-Factor Authentication</CardTitle>
            <CardDescription>
              Protect your account with time-based one-time passwords (TOTP)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              data-testid="button-setup-2fa"
            >
              <QrCode className="mr-2 h-4 w-4" />
              Start Setup
            </Button>
          </CardContent>
        </Card>
      )}

      {setupData && !user.twoFactorEnabled && !showBackupCodes && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Scan QR Code</CardTitle>
              <CardDescription>
                Use Google Authenticator, Authy, or any TOTP app
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <img
                src={setupData.qrCodeUrl}
                alt="2FA QR Code"
                className="w-64 h-64"
                data-testid="img-qr-code"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2: Verify Setup</CardTitle>
              <CardDescription>
                Enter the 6-digit code from your authenticator app
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="verification-code">Verification Code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="000000"
                  data-testid="input-verification-code"
                />
              </div>
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={enableMutation.isPending || verificationCode.length !== 6}
                data-testid="button-enable-2fa"
              >
                Enable 2FA
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showBackupCodes && setupData && (
        <Card>
          <CardHeader>
            <CardTitle>Save Your Backup Codes</CardTitle>
            <CardDescription>
              Store these codes safely. Each can be used once if you lose access to your authenticator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg font-mono text-sm">
              {setupData.backupCodes.map((code, i) => (
                <div key={i} data-testid={`text-backup-code-${i}`}>{code}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={downloadBackupCodes} variant="outline" data-testid="button-download-codes">
                <Download className="mr-2 h-4 w-4" />
                Download Codes
              </Button>
              <Button onClick={() => {
                setShowBackupCodes(false);
                setSetupData(null);
                setVerificationCode("");
              }} data-testid="button-done">
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user.twoFactorEnabled && !setupData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              2FA Enabled
            </CardTitle>
            <CardDescription>
              Your account is protected with two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                You'll need to enter a verification code each time you sign in
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold">Disable 2FA</h3>
              <div>
                <Label htmlFor="disable-code">Verification Code</Label>
                <Input
                  id="disable-code"
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="000000"
                  data-testid="input-disable-code"
                />
              </div>
              <Button
                onClick={() => disableMutation.mutate()}
                disabled={disableMutation.isPending || verificationCode.length !== 6}
                variant="destructive"
                data-testid="button-disable-2fa"
              >
                Disable 2FA
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

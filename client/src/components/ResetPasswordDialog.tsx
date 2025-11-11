import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Copy, Check, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Generate a cryptographically secure random password with guaranteed character variety
function generatePassword(): string {
  const length = 12;
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const special = "!@#$%^&*";
  
  // Helper function to pick a random character from a set using rejection sampling
  const pickRandom = (charset: string): string => {
    const charsetLength = charset.length;
    const maxValid = 256 - (256 % charsetLength);
    
    while (true) {
      const randomValue = new Uint8Array(1);
      window.crypto.getRandomValues(randomValue);
      
      if (randomValue[0] < maxValid) {
        return charset.charAt(randomValue[0] % charsetLength);
      }
    }
  };
  
  // Ensure at least one character from each required category
  const password: string[] = [
    pickRandom(lowercase),
    pickRandom(uppercase),
    pickRandom(digits),
    pickRandom(special),
  ];
  
  // Fill remaining slots with random characters from all categories
  const allChars = lowercase + uppercase + digits + special;
  while (password.length < length) {
    password.push(pickRandom(allChars));
  }
  
  // Shuffle the password array using Fisher-Yates with rejection sampling
  for (let i = password.length - 1; i > 0; i--) {
    const maxValid = 256 - (256 % (i + 1));
    let j: number;
    
    while (true) {
      const randomValue = new Uint8Array(1);
      window.crypto.getRandomValues(randomValue);
      
      if (randomValue[0] < maxValid) {
        j = randomValue[0] % (i + 1);
        break;
      }
    }
    
    [password[i], password[j]] = [password[j], password[i]];
  }
  
  return password.join("");
}

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerEmail: string;
  onResetPassword: (password: string) => Promise<void>;
  isResetting?: boolean;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  customerEmail,
  onResetPassword,
  isResetting = false,
}: ResetPasswordDialogProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    setPassword(newPassword);
    setShowPassword(true);
    setPasswordCopied(false);
  };

  const handleCopyPassword = async () => {
    if (password) {
      await navigator.clipboard.writeText(password);
      setPasswordCopied(true);
      toast({
        title: "Password Copied",
        description: "Password has been copied to clipboard",
      });
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  const handleResetPassword = async () => {
    if (password.length < 8) {
      toast({
        title: "Invalid Password",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    try {
      await onResetPassword(password);
      onOpenChange(false);
      setPassword("");
      setShowPassword(false);
      setPasswordCopied(false);
    } catch (error) {
      // Error is handled by parent mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Customer Portal Password</DialogTitle>
          <DialogDescription>
            Generate a new password for {customerEmail}. The customer will be required to change it on first login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="pr-20"
                  data-testid="input-reset-password"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-reset-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopyPassword}
                    disabled={!password}
                    data-testid="button-copy-reset-password"
                  >
                    {passwordCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGeneratePassword}
                data-testid="button-generate-reset-password"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Click "Generate" for a secure password, then copy it to share with the customer
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isResetting}
            data-testid="button-cancel-reset"
          >
            Cancel
          </Button>
          <Button
            onClick={handleResetPassword}
            disabled={isResetting || !password}
            data-testid="button-confirm-reset"
          >
            {isResetting ? "Resetting..." : "Reset Password"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

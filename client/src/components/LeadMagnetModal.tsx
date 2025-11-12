import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minimize2, ExternalLink } from "lucide-react";

interface LeadMagnetModalProps {
  delaySeconds?: number;
}

export function LeadMagnetModal({ delaySeconds = 10 }: LeadMagnetModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // Check if modal was previously minimized in this session
    const wasMinimized = sessionStorage.getItem('demoLeadMagnetMinimized') === 'true';
    
    if (wasMinimized) {
      setIsMinimized(true);
      return;
    }

    // Show modal after delay
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delaySeconds * 1000);

    return () => clearTimeout(timer);
  }, [delaySeconds]);

  const handleMinimize = () => {
    setIsOpen(false);
    setIsMinimized(true);
    sessionStorage.setItem('demoLeadMagnetMinimized', 'true');
  };

  const handleRestore = () => {
    setIsOpen(true);
    setIsMinimized(false);
  };

  const handleCTA = () => {
    window.open('https://scoreapp.selectuniforms.co.uk/outsourceproduction', '_blank');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          handleMinimize();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enjoyed this demo?</DialogTitle>
            <DialogDescription>
              Would you like to find out more about how partnering with Select Uniforms as your outsourced production partner can help take your business to the next level?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button
              onClick={handleCTA}
              className="w-full"
              data-testid="button-lead-magnet-cta"
            >
              Learn More About Outsourced Production
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={handleMinimize}
              className="w-full"
              data-testid="button-minimize-lead-magnet"
            >
              <Minimize2 className="mr-2 h-4 w-4" />
              Continue Browsing Demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Minimized indicator - sticky at bottom right */}
      {isMinimized && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={handleRestore}
            className="shadow-lg"
            data-testid="button-restore-lead-magnet"
          >
            Learn About Outsourced Production
          </Button>
        </div>
      )}
    </>
  );
}

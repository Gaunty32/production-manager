import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Star, Smile, Meh } from "lucide-react";
import { useEffect, useState } from "react";

interface CelebrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTime: boolean;
  staffName: string;
}

export function CelebrationDialog({ open, onOpenChange, onTime, staffName }: CelebrationDialogProps) {
  const [showStar, setShowStar] = useState(false);

  useEffect(() => {
    if (open) {
      setShowStar(false);
      const timer = setTimeout(() => setShowStar(true), 300);
      
      const autoCloseTimer = setTimeout(() => {
        onOpenChange(false);
      }, 3000);

      return () => {
        clearTimeout(timer);
        clearTimeout(autoCloseTimer);
      };
    }
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md border-0 shadow-2xl"
        data-testid="dialog-celebration"
      >
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          {onTime ? (
            <>
              <Smile className="w-24 h-24 text-green-500" strokeWidth={1.5} />
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-green-600">Great Job!</h2>
                <p className="text-lg text-muted-foreground">Order completed on time</p>
                <p className="text-sm font-medium">{staffName}</p>
              </div>
              <div 
                className={`transition-all duration-500 ${
                  showStar 
                    ? 'scale-100 rotate-0 opacity-100' 
                    : 'scale-0 rotate-180 opacity-0'
                }`}
              >
                <Star 
                  className="w-20 h-20 fill-yellow-400 text-yellow-500" 
                  strokeWidth={2}
                />
              </div>
              <p className="text-sm text-yellow-600 font-semibold">+1 Yellow Star!</p>
            </>
          ) : (
            <>
              <Meh className="w-24 h-24 text-orange-500" strokeWidth={1.5} />
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-orange-600">Well Done!</h2>
                <p className="text-lg text-muted-foreground">But it was late...</p>
                <p className="text-sm font-medium">{staffName}</p>
              </div>
              <div 
                className={`transition-all duration-500 ${
                  showStar 
                    ? 'scale-100 rotate-0 opacity-100' 
                    : 'scale-0 rotate-180 opacity-0'
                }`}
              >
                <Star 
                  className="w-20 h-20 fill-red-400 text-red-500" 
                  strokeWidth={2}
                />
              </div>
              <p className="text-sm text-red-600 font-semibold">+1 Red Star</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

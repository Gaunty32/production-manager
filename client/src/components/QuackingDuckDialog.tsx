import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface QuackingDuckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  suspiciousItems: Array<{ index: number; quantity: number; stitchCount: number }>;
}

export function QuackingDuckDialog({ open, onOpenChange, onConfirm, suspiciousItems }: QuackingDuckDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex flex-col items-center gap-4 mb-4">
            <div className="text-8xl animate-bounce" role="img" aria-label="Duck">
              🦆
            </div>
            <AlertDialogTitle className="text-2xl text-center">
              Quack! Hold On! 🦆
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-center space-y-4">
            <p className="text-lg font-semibold">
              Something looks a bit... fishy! 🐟
            </p>
            <p>
              I noticed that the <span className="font-bold text-foreground">quantity</span> is greater than the <span className="font-bold text-foreground">stitch count</span> on {suspiciousItems.length === 1 ? 'one line item' : `${suspiciousItems.length} line items`}:
            </p>
            <div className="bg-muted p-3 rounded-md text-left space-y-1">
              {suspiciousItems.map((item) => (
                <div key={item.index} className="text-sm">
                  <span className="font-mono">Line Item #{item.index + 1}:</span>{" "}
                  <span className="text-red-500 font-semibold">{item.quantity} items</span> but only{" "}
                  <span className="text-amber-500 font-semibold">{item.stitchCount} stitches</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Did you perhaps swap the quantity and stitch count fields? 🤔
            </p>
            <p className="font-semibold text-foreground">
              Are you sure you want to continue?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel data-testid="button-duck-cancel">
            No, Let Me Fix That! 🛠️
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            data-testid="button-duck-confirm"
            className="bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700"
          >
            Yes, I'm Sure! 🦆
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

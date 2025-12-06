import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Clock, Zap, PoundSterling } from "lucide-react";
import { PRICING_2026 } from "@shared/pricing";

interface PricingTableDialogProps {
  trigger?: React.ReactNode;
}

export function PricingTableDialog({ trigger }: PricingTableDialogProps) {
  const stitchHeaders = PRICING_2026[0].prices
    .filter(p => p.maxStitches !== null)
    .map(p => p.maxStitches as number);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-view-pricing">
            <PoundSterling className="h-4 w-4 mr-2" />
            View Pricing
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl text-center">Embroidery Pricing 2026</DialogTitle>
          <DialogDescription className="text-center">
            Price per item (excluding VAT)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" data-testid="table-pricing-dialog">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border px-2 py-1.5 text-left font-medium">Quantity</th>
                  {stitchHeaders.map(stitches => (
                    <th key={stitches} className="border border-border px-2 py-1.5 text-center font-medium whitespace-nowrap">
                      {stitches >= 1000 ? `${stitches / 1000}k` : stitches}
                    </th>
                  ))}
                  <th className="border border-border px-2 py-1.5 text-center font-medium">50k+</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_2026.filter(tier => tier.maxQty !== null || tier.minQty < 1000).map((tier, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="border border-border px-2 py-1.5 font-medium whitespace-nowrap">
                      {tier.maxQty === null 
                        ? `${tier.minQty}+` 
                        : `${tier.minQty}-${tier.maxQty}`}
                    </td>
                    {stitchHeaders.map(stitches => {
                      const priceEntry = tier.prices.find(p => p.maxStitches === stitches);
                      const price = priceEntry?.price;
                      return (
                        <td key={stitches} className="border border-border px-2 py-1.5 text-center">
                          {typeof price === "number" ? `£${price.toFixed(2)}` : price || "-"}
                        </td>
                      );
                    })}
                    <td className="border border-border px-2 py-1.5 text-center text-muted-foreground">
                      POA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md" data-testid="info-production-time-dialog">
              <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Standard Production</p>
                <p className="text-sm text-muted-foreground">3-4 working days for orders under 300 items</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md" data-testid="info-express-service-dialog">
              <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">48-Hour Express</p>
                <p className="text-sm text-muted-foreground">Available with 100% surcharge</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Zap, PoundSterling, HardHat } from "lucide-react";
import { PRICING_2026 } from "@shared/pricing";

interface PricingTableDialogProps {
  trigger?: React.ReactNode;
}

// DTF Print and Apply pricing data
const DTF_PRICING = [
  { minQty: 0, maxQty: 49, prices: { A6: 1.75, A5: 2.00, A4: 2.50, A3: 3.50 } },
  { minQty: 50, maxQty: 99, prices: { A6: 1.50, A5: 1.75, A4: 2.00, A3: 2.50 } },
  { minQty: 99, maxQty: null, prices: { A6: 1.25, A5: 1.50, A4: 1.75, A3: 2.00 } },
];

const DTF_SIZE_LABELS = [
  { key: "A6", label: "A6", sublabel: "(1/4 A4)" },
  { key: "A5", label: "A5", sublabel: "(1/2 A4)" },
  { key: "A4", label: "A4", sublabel: "" },
  { key: "A3", label: "A3", sublabel: "" },
];

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
          <DialogTitle className="text-xl text-center">Pricing</DialogTitle>
          <DialogDescription className="text-center">
            Price per item (excluding VAT)
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="embroidery" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="embroidery" data-testid="tab-embroidery">Embroidery</TabsTrigger>
            <TabsTrigger value="dtf" data-testid="tab-dtf">DTF Print and Apply</TabsTrigger>
          </TabsList>
          
          {/* Embroidery Pricing Tab */}
          <TabsContent value="embroidery" className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-md text-sm" data-testid="info-stitch-count-key">
              <p className="font-medium mb-1">Stitch Count Key</p>
              <p className="text-muted-foreground">
                Column headers show the maximum stitch count for that price. For example, <span className="font-medium">&lt;5,000</span> means logos with up to 5,000 stitches, <span className="font-medium">&lt;7,500</span> means logos with up to 7,500 stitches.
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" data-testid="table-pricing-embroidery">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-2 py-1.5 text-left font-medium">Quantity</th>
                    {stitchHeaders.map(stitches => (
                      <th key={stitches} className="border border-border px-2 py-1.5 text-center font-medium whitespace-nowrap">
                        &lt;{stitches >= 1000 ? `${(stitches / 1000).toLocaleString()}k` : stitches.toLocaleString()}
                      </th>
                    ))}
                    <th className="border border-border px-2 py-1.5 text-center font-medium">100k+</th>
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

            {/* Caps Section */}
            <div className="pt-2 border-t" data-testid="section-caps-pricing">
              <div className="flex items-center gap-2 mb-3">
                <HardHat className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Caps</h3>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-md text-sm" data-testid="info-caps-standard">
                  <p className="font-medium text-foreground mb-1">Standard Embroidery</p>
                  <p className="text-muted-foreground">The pricing table above applies to standard embroidery on caps.</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-md text-sm" data-testid="info-caps-3d">
                  <p className="font-medium text-foreground mb-2">3D Embroidery</p>
                  <ul className="text-muted-foreground space-y-1.5">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">+</span>
                      <span>A one-off set-up cost of <span className="font-medium text-foreground">£12</span> applies to digitize your design for 3D embroidery.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">+</span>
                      <span>A <span className="font-medium text-foreground">100% surcharge</span> is applied to the standard unit cost to cover the foam.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">+</span>
                      <span>Subject to a <span className="font-medium text-foreground">minimum order quantity of 12 units</span> of the same design.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
          
          {/* DTF Print and Apply Pricing Tab */}
          <TabsContent value="dtf" className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-md text-sm" data-testid="info-dtf-logo-size">
              <p className="font-medium mb-1">Logo Size</p>
              <p className="text-muted-foreground">
                Prices are based on the print size. A6 is 1/4 of A4, A5 is 1/2 of A4. Larger prints cost more per item.
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" data-testid="table-pricing-dtf">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-2 py-1.5 text-left font-medium">Quantity</th>
                    <th className="border border-border px-2 py-1.5 text-center font-medium" colSpan={4}>Logo Size</th>
                  </tr>
                  <tr className="bg-muted">
                    <th className="border border-border px-2 py-1.5"></th>
                    {DTF_SIZE_LABELS.map(size => (
                      <th key={size.key} className="border border-border px-3 py-1.5 text-center font-medium whitespace-nowrap">
                        <div>{size.label}</div>
                        {size.sublabel && <div className="text-xs font-normal text-muted-foreground">{size.sublabel}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DTF_PRICING.map((tier, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      <td className="border border-border px-2 py-1.5 font-medium whitespace-nowrap">
                        {tier.maxQty === null 
                          ? `${tier.minQty}+` 
                          : `${tier.minQty}-${tier.maxQty}`}
                      </td>
                      {DTF_SIZE_LABELS.map(size => (
                        <td key={size.key} className="border border-border px-3 py-1.5 text-center">
                          £{tier.prices[size.key as keyof typeof tier.prices].toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md" data-testid="info-dtf-production-time">
                <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Standard Production</p>
                  <p className="text-sm text-muted-foreground">3-4 working days for orders under 300 items</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-md" data-testid="info-dtf-express-service">
                <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">48-Hour Express</p>
                  <p className="text-sm text-muted-foreground">Available with 100% surcharge</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

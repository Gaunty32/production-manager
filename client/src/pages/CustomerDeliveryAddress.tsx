import { goBack } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, MapPin, FileText, AlertCircle } from "lucide-react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

export default function CustomerDeliveryAddress() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && <ImpersonationBanner />}

      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goBack("/customer", setLocation)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Delivery Address</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        <Card data-testid="card-delivery-address">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Delivery Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              All garments should be delivered to:
            </p>
            <address
              className="not-italic text-base font-medium leading-relaxed"
              data-testid="text-delivery-address"
            >
              Select Branding Solutions
              <br />
              Spence Mills
              <br />
              Mill Lane
              <br />
              Leeds
              <br />
              LS13 3HE
            </address>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Order Paperwork
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Please ensure order paperwork is included with every delivery.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Direct Supplier Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              If garments are sent direct from your supplier, your order
              details need to show on the delivery note so it can be allocated
              to your account.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string;
};

type SetupIntentData = {
  clientSecret: string;
  publishableKey: string;
};

type CustomerUser = {
  email: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "15px",
      color: "#18181b",
      fontFamily: "inherit",
      "::placeholder": { color: "#a1a1aa" },
    },
    invalid: { color: "#ef4444" },
  },
  hidePostalCode: false,
};

function brandIcon(brand: string) {
  const b = brand.toLowerCase();
  const labels: Record<string, string> = {
    visa: "VISA",
    mastercard: "MC",
    amex: "AMEX",
    discover: "DISC",
  };
  return labels[b] || brand.toUpperCase();
}

function AddCardForm({ onSuccess, clientSecret }: { onSuccess: () => void; clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found");
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });
      if (error) throw new Error(error.message);
      if (setupIntent?.status === "succeeded") {
        toast({ title: "Card saved successfully" });
        onSuccess();
      }
    } catch (err: any) {
      toast({ title: err.message || "Failed to save card", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 border rounded-md bg-background">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
        Card details are encrypted and stored securely by Stripe. We never see your full card number.
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="submit" disabled={!stripe || saving} data-testid="button-save-card">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
          Save card
        </Button>
      </div>
    </form>
  );
}

function AddCardSection({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStartAdd = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/customer-portal/stripe/setup-intent");
      const data: SetupIntentData = await res.json();
      (window as any).__stripeClientSecret = data.clientSecret;
      setClientSecret(data.clientSecret);
      setStripePromise(loadStripe(data.publishableKey));
    } catch (err: any) {
      toast({ title: err.message || "Could not initialise payment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!clientSecret || !stripePromise) {
    return (
      <Button onClick={handleStartAdd} disabled={loading} variant="outline" data-testid="button-add-card">
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
        Add a card
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add a new card</CardTitle>
      </CardHeader>
      <CardContent>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <AddCardForm
            clientSecret={clientSecret}
            onSuccess={() => {
              setClientSecret(null);
              setStripePromise(null);
              onSaved();
            }}
          />
        </Elements>
      </CardContent>
    </Card>
  );
}

export default function CustomerPaymentMethods() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: cards = [], isLoading } = useQuery<SavedCard[]>({
    queryKey: ["/api/customer-portal/stripe/cards"],
  });

  const deleteMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      apiRequest("DELETE", `/api/customer-portal/stripe/cards/${paymentMethodId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/stripe/cards"] });
      toast({ title: "Card removed" });
    },
    onError: () => toast({ title: "Failed to remove card", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && currentUser && (
        <ImpersonationBanner customerEmail={currentUser.email} />
      )}

      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          {currentUser?.customerLogoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={currentUser.customerLogoUrl}
                alt={currentUser.customerName || "Customer logo"}
                className="max-h-16 max-w-[200px] object-contain"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/customer/dashboard")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h1 className="font-semibold text-sm">Saved Payment Cards</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Saved cards are charged when your orders go into production. Your card details are stored securely by Stripe — we never have access to your full card number.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">No saved cards</p>
              <p className="text-sm text-muted-foreground">Add a card below to speed up future orders.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <Card key={card.id} data-testid={`card-saved-${card.id}`}>
                <CardContent className="py-4 flex items-center gap-3">
                  <div className="flex-shrink-0 w-12 h-8 bg-muted rounded flex items-center justify-center text-xs font-bold tracking-wide">
                    {brandIcon(card.brand)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} ending {card.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize hidden sm:flex">
                    {card.funding}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(card.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-remove-card-${card.id}`}
                    title="Remove card"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AddCardSection
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/stripe/cards"] })}
        />
      </div>
    </div>
  );
}

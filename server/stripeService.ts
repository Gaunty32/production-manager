import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripeClient = new Stripe(key, { apiVersion: "2025-03-31.basil" });
  }
  return stripeClient;
}

export async function getOrCreateStripeCustomer(
  customerId: string,
  customerName: string,
  customerEmail: string | null,
  existingStripeId: string | null
): Promise<string> {
  const stripe = getStripeClient();

  if (existingStripeId) {
    try {
      const existing = await stripe.customers.retrieve(existingStripeId);
      if (!existing.deleted) return existingStripeId;
    } catch {
      // fall through to create
    }
  }

  const customer = await stripe.customers.create({
    name: customerName,
    email: customerEmail || undefined,
    metadata: { internalCustomerId: customerId },
  });
  return customer.id;
}

export async function createSetupIntent(stripeCustomerId: string): Promise<{ clientSecret: string; setupIntentId: string }> {
  const stripe = getStripeClient();
  const si = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });
  return { clientSecret: si.client_secret!, setupIntentId: si.id };
}

export async function listSavedCards(stripeCustomerId: string) {
  const stripe = getStripeClient();
  const methods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
  });
  return methods.data.map((pm) => ({
    id: pm.id,
    brand: pm.card!.brand,
    last4: pm.card!.last4,
    expMonth: pm.card!.exp_month,
    expYear: pm.card!.exp_year,
    funding: pm.card!.funding,
  }));
}

export async function deletePaymentMethod(paymentMethodId: string) {
  const stripe = getStripeClient();
  await stripe.paymentMethods.detach(paymentMethodId);
}

export async function setDefaultPaymentMethod(stripeCustomerId: string, paymentMethodId: string) {
  const stripe = getStripeClient();
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

export type ChargeResult =
  | { success: true; paymentIntentId: string; amountCharged: number }
  | { success: false; error: string };

/**
 * Charges the customer's first saved card for the given GBP amount.
 * Returns a result object — never throws — so the invoice flow continues even on failure.
 */
export async function chargeCustomerCard(
  stripeCustomerId: string,
  amountGBP: number,
  description: string,
  invoiceReference: string,
): Promise<ChargeResult> {
  try {
    const stripe = getStripeClient();

    // Find their saved cards
    const methods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
    });

    if (methods.data.length === 0) {
      return { success: false, error: "No saved card on file" };
    }

    // Use the most recently added card
    const paymentMethod = methods.data[0];
    const amountPence = Math.round(amountGBP * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPence,
      currency: "gbp",
      customer: stripeCustomerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description,
      metadata: { invoiceReference },
    });

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      amountCharged: amountGBP,
    };
  } catch (err: any) {
    const message = err?.raw?.message || err?.message || "Payment failed";
    console.error(`Stripe charge failed for customer ${stripeCustomerId}:`, message);
    return { success: false, error: message };
  }
}

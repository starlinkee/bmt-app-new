import { getStripe } from "./client";

interface CreateCheckoutSessionParams {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  mode: "payment" | "subscription";
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession({
  priceId,
  customerId,
  customerEmail,
  mode,
  successUrl,
  cancelUrl,
  metadata,
}: CreateCheckoutSessionParams) {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customerId ? { customer: customerId } : { customer_email: customerEmail }),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

interface CreatePortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export async function createPortalSession({
  customerId,
  returnUrl,
}: CreatePortalSessionParams) {
  const stripe = getStripe();

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

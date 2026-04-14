import type Stripe from "stripe";

export type StripeWebhookEvent =
  | Stripe.CheckoutSessionCompletedEvent
  | Stripe.CustomerSubscriptionUpdatedEvent
  | Stripe.CustomerSubscriptionDeletedEvent
  | Stripe.InvoicePaymentFailedEvent;

export type StripeWebhookEventType = StripeWebhookEvent["type"];

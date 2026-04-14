import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // TODO: provisioning — zapisz customerId, aktywuj dostęp
        console.log("checkout.session.completed", session.id);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        // TODO: zaktualizuj status subskrypcji w bazie
        console.log("customer.subscription.updated", subscription.id, subscription.status);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        // TODO: cofnij dostęp
        console.log("customer.subscription.deleted", subscription.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        // TODO: powiadom użytkownika o nieudanej płatności
        console.log("invoice.payment_failed", invoice.id);
        break;
      }
      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

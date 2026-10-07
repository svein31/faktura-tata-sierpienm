import type Stripe from "stripe";
import { ApiError, json } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import { syncLatestStripeSubscription } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const referenceId = (reference: unknown): string | null => typeof reference === "string" ? reference :
  reference && typeof reference === "object" && "id" in reference && typeof reference.id === "string" ? reference.id : null;

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Brak nagłówka stripe-signature." }, { status: 400 });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return json({ error: "Brak konfiguracji webhooka Stripe na serwerze." }, { status: 503 });
  try {
    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
    } catch {
      return json({ error: "Nieprawidłowy podpis zdarzenia Stripe." }, { status: 400 });
    }
    const eventReference = { created: event.created, id: event.id };
    let subscriptionId: string | null = null, userId: string | null | undefined, customerId: string | null = null;
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          subscriptionId = referenceId(session.subscription);
          userId = session.client_reference_id || session.metadata?.userId;
          customerId = referenceId(session.customer);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        subscriptionId = subscription.id;
        userId = subscription.metadata?.userId;
        customerId = referenceId(subscription.customer);
        break;
      }
      case "invoice.payment_failed":
      case "invoice.payment_succeeded":
      case "invoice.paid": {
        // The pinned 2025-02 API uses subscription; newer Stripe payloads nest this reference.
        const invoice = event.data.object as unknown as {
          subscription?: unknown; customer?: unknown; parent?: { subscription_details?: { subscription?: unknown } };
        };
        subscriptionId = referenceId(invoice.subscription || invoice.parent?.subscription_details?.subscription);
        customerId = referenceId(invoice.customer);
        break;
      }
      default: break;
    }
    if (subscriptionId) await syncLatestStripeSubscription({ subscriptionId, userId, customerId, event: eventReference });
    return json({ received: true, eventId: event.id });
  } catch (error) {
    // A concurrent checkout/deletion is retried by Stripe. Never acknowledge an unsaved update.
    return json({ error: "Nie udało się zsynchronizować rozliczeń. Zdarzenie wymaga ponowienia." },
      { status: error instanceof ApiError && error.status === 409 ? 503 : 500 });
  }
}

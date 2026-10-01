import type Stripe from "stripe";
import { json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.warn("[Stripe Webhook] Odrzucono żądanie bez nagłówka stripe-signature.");
      return json({ error: "Brak nagłówka stripe-signature." }, { status: 400 });
    }


    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[Stripe Webhook] Brak zdefiniowanej zmiennej STRIPE_WEBHOOK_SECRET w środowisku.");
      return json({ error: "Brak konfiguracji webhooka Stripe na serwerze." }, { status: 503 });
    }


    const stripe = getStripe();
    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Błąd weryfikacji podpisu.";
      console.error("[Stripe Webhook] Weryfikacja sygnatury nie powiodła się:", message);
      return json({ error: `Błąd weryfikacji podpisu: ${message}` }, { status: 400 });
    }

    console.log(`[Stripe Webhook] Otrzymano zdarzenie: ${event.type} (ID: ${event.id})`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = session.client_reference_id || session.metadata?.userId;

          await syncStripeSubscription(subscription, userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(subscription);

        // Upewnij się, że status został oznaczony jako anulowany
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: "canceled" },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (invoice as any).subscription;
        if (subRef) {
          const subscriptionId = typeof subRef === "string" ? subRef : subRef.id;
          console.warn(
            `[Stripe Webhook] Płatność faktury ${invoice.id} nie powiodła się dla subskrypcji ${subscriptionId}. Ustawianie statusu past_due.`
          );
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: "past_due" },
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (invoice as any).subscription;
        if (subRef) {
          const subscriptionId = typeof subRef === "string" ? subRef : subRef.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncStripeSubscription(subscription);
        }
        break;
      }

      default:
        // Pozostałe zdarzenia są bezpiecznie ignorowane
        break;
    }

    return json({ received: true, eventId: event.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Błąd przetwarzania webhooka.";
    console.error("[Stripe Webhook] Błąd przetwarzania webhooka:", message);
    return json({ error: "Błąd przetwarzania zdarzenia webhooka." }, { status: 500 });
  }
}

import "server-only";
import Stripe from "stripe";
import type { SubscriptionPlan } from "./subscription-plans";

let stripeClientInstance: Stripe | null = null;

/**
 * Zwraca zainicjalizowaną instancję klienta Stripe po stronie serwera.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Brak klucza STRIPE_SECRET_KEY w konfiguracji środowiska (.env). Skonfiguruj klucz Stripe, aby obsłużyć płatności."
    );
  }

  if (!stripeClientInstance) {
    stripeClientInstance = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
      appInfo: {
        name: "FakturaProsto",
        version: "2.0.0",
      },
      typescript: true,
    });
  }

  return stripeClientInstance;
}

/**
 * Zwraca Stripe Price ID dla danego planu na podstawie zmiennych środowiskowych.
 */
export function getPriceIdForPlan(plan: SubscriptionPlan): string {
  const priceId =
    plan === "monthly"
      ? process.env.STRIPE_PRICE_ID_MONTHLY
      : process.env.STRIPE_PRICE_ID_YEARLY;

  if (!priceId) {
    throw new Error(
      `Brak zdefiniowanego identyfikatora ceny STRIPE_PRICE_ID_${plan.toUpperCase()} w zmiennych środowiskowych.`
    );
  }

  return priceId;
}

/**
 * Rozpoznaje plan (monthly/yearly) na podstawie Price ID ze Stripe lub interwału rozliczeniowego.
 */
export function resolvePlanFromPriceId(priceId: string | null | undefined): SubscriptionPlan | null {
  if (!priceId) return null;
  if (process.env.STRIPE_PRICE_ID_MONTHLY && priceId === process.env.STRIPE_PRICE_ID_MONTHLY) {
    return "monthly";
  }
  if (process.env.STRIPE_PRICE_ID_YEARLY && priceId === process.env.STRIPE_PRICE_ID_YEARLY) {
    return "yearly";
  }
  return null;
}

/**
 * Rozpoznaje plan na podstawie obiektu subskrypcji Stripe.
 */
export function resolvePlanFromStripeSubscription(subscription: Stripe.Subscription): SubscriptionPlan | null {
  const primaryItem = subscription.items?.data?.[0];
  const priceId = primaryItem?.price?.id;
  const mapped = resolvePlanFromPriceId(priceId);
  if (mapped) return mapped;

  // Rezerwa na podstawie interwału Stripe Recurring:
  const interval = primaryItem?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";

  // Rezerwa na podstawie metadanych:
  const metaPlan = subscription.metadata?.plan;
  if (metaPlan === "monthly" || metaPlan === "yearly") return metaPlan;

  return null;
}

/**
 * Zwraca bazowy adres URL aplikacji dla przekierowań Checkout / Portal.
 */
export function getAppBaseUrl(req?: Request): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  if (process.env.URL) {
    return process.env.URL.replace(/\/$/, "");
  }
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

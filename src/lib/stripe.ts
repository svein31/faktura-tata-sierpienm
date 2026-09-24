import "server-only";
import Stripe from "stripe";
import { ApiError } from "./api";
import type { SubscriptionPlan } from "./subscription-plans";

let stripeClientInstance: Stripe | null = null;

export const DEFAULT_STRIPE_PRICES = {
  monthly: "price_1UIrCgCuNMNKgzvnKDUuxMaq",
  yearly: "price_1UIrCgCuNMNKgzvnMzY0Asfi",
} as const;

/**
 * Zwraca zainicjalizowaną instancję klienta Stripe po stronie serwera.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      503,
      "Brak klucza STRIPE_SECRET_KEY w konfiguracji środowiska serwera. Skonfiguruj zmienną STRIPE_SECRET_KEY w panelu Netlify, aby aktywować płatności."
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
 * Zwraca Stripe Price ID dla danego planu na podstawie zmiennych środowiskowych z fallbackiem na znane ID.
 */
export function getPriceIdForPlan(plan: SubscriptionPlan): string {
  const priceId =
    plan === "monthly"
      ? (process.env.STRIPE_PRICE_ID_MONTHLY || DEFAULT_STRIPE_PRICES.monthly)
      : (process.env.STRIPE_PRICE_ID_YEARLY || DEFAULT_STRIPE_PRICES.yearly);

  if (!priceId) {
    throw new ApiError(
      500,
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
  const monthlyId = process.env.STRIPE_PRICE_ID_MONTHLY || DEFAULT_STRIPE_PRICES.monthly;
  const yearlyId = process.env.STRIPE_PRICE_ID_YEARLY || DEFAULT_STRIPE_PRICES.yearly;

  if (priceId === monthlyId) {
    return "monthly";
  }
  if (priceId === yearlyId) {
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
 * Priorytetyzuje nagłówki hosta z żądania (x-forwarded-host / host), by uniknąć pomyłkowego przekierowania na localhost.
 */
export function getAppBaseUrl(req?: Request): string {
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    if (host && !host.includes("localhost")) {
      return `${proto}://${host}`;
    }
  }
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes("localhost")) {
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
  return process.env.NEXTAUTH_URL ? process.env.NEXTAUTH_URL.replace(/\/$/, "") : "http://localhost:3000";
}


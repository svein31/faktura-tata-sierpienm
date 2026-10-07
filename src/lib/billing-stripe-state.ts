import "server-only";
import type Stripe from "stripe";
import { ApiError } from "@/lib/api";

export const BILLING_REQUEST_OPTIONS = { timeout: 15_000, maxNetworkRetries: 0 };
export const isRenewableStripeSubscription = (subscription: Pick<Stripe.Subscription, "status">) =>
  subscription.status !== "canceled" && subscription.status !== "incomplete_expired";

/** Do not silently overlook a second subscription or an older open Checkout. */
export async function customerSubscriptions(stripe: Stripe, customer: string, beforeRequest?: () => Promise<void>) {
  const result: Stripe.Subscription[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < 10; page++) {
    await beforeRequest?.();
    const list = await stripe.subscriptions.list({ customer, status: "all", limit: 100, starting_after }, BILLING_REQUEST_OPTIONS);
    result.push(...list.data);
    if (!list.has_more) return result;
    starting_after = list.data.at(-1)?.id;
    if (!starting_after) break;
  }
  throw new ApiError(503, "Nie można bezpiecznie zweryfikować rozliczeń. Spróbuj ponownie później.", "BILLING_UNAVAILABLE");
}

export async function openCustomerCheckouts(stripe: Stripe, customer: string, beforeRequest?: () => Promise<void>) {
  const result: Stripe.Checkout.Session[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < 10; page++) {
    await beforeRequest?.();
    const list = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100, starting_after }, BILLING_REQUEST_OPTIONS);
    result.push(...list.data);
    if (!list.has_more) return result;
    starting_after = list.data.at(-1)?.id;
    if (!starting_after) break;
  }
  throw new ApiError(503, "Nie można bezpiecznie zweryfikować rozpoczętych płatności.", "BILLING_UNAVAILABLE");
}

export async function expireCheckout(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.status !== "open") return;
  try {
    await stripe.checkout.sessions.expire(session.id, {}, BILLING_REQUEST_OPTIONS);
  } catch (error) {
    // Payment may have completed while account removal was expiring its session.
    const latest = await stripe.checkout.sessions.retrieve(session.id, {}, BILLING_REQUEST_OPTIONS);
    if (latest.status === "open") throw error;
  }
}

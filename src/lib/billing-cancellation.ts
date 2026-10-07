import "server-only";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { acquireBillingLease, refreshBillingLease, releaseBillingLease } from "@/lib/billing-lease";
import { BILLING_REQUEST_OPTIONS, customerSubscriptions, expireCheckout, isRenewableStripeSubscription, openCustomerCheckouts } from "@/lib/billing-stripe-state";

const referenceId = (value: unknown): string | undefined => typeof value === "string" ? value :
  value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : undefined;

/** Stop external renewals before deleting their only local account/portal reference. */
export async function withUserBillingCancellation(userId: string, deleteAccount: () => Promise<void>): Promise<void> {
  const state = await acquireBillingLease(userId);
  const refresh = () => refreshBillingLease(userId, state.leaseToken!);
  try {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (subscription?.stripeCustomerId || subscription?.stripeSubscriptionId || state.stripeCheckoutSessionId) {
      const stripe = getStripe();
      const customers = new Set<string>(), subscriptionIds = new Set<string>();
      if (subscription?.stripeCustomerId) customers.add(subscription.stripeCustomerId);
      if (subscription?.stripeSubscriptionId) {
        await refresh();
        const current = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {}, BILLING_REQUEST_OPTIONS);
        const customer = referenceId(current.customer);
        if (customer) customers.add(customer);
        subscriptionIds.add(current.id);
      }
      if (state.stripeCheckoutSessionId) {
        await refresh();
        const session = await stripe.checkout.sessions.retrieve(state.stripeCheckoutSessionId, {}, BILLING_REQUEST_OPTIONS);
        await expireCheckout(stripe, session);
        const latest = await stripe.checkout.sessions.retrieve(session.id, {}, BILLING_REQUEST_OPTIONS);
        const customer = referenceId(latest.customer), id = referenceId(latest.subscription);
        if (customer) customers.add(customer);
        if (id) subscriptionIds.add(id);
      }
      for (const customer of customers) {
        // Expire checkouts first: a customer completing one can create a new subscription.
        for (const session of await openCustomerCheckouts(stripe, customer, refresh)) {
          await refresh();
          await expireCheckout(stripe, session);
        }
      }
      for (const customer of customers) {
        for (const item of await customerSubscriptions(stripe, customer, refresh)) subscriptionIds.add(item.id);
      }
      for (const id of subscriptionIds) {
        await refresh();
        const item = await stripe.subscriptions.retrieve(id, {}, BILLING_REQUEST_OPTIONS);
        if (isRenewableStripeSubscription(item)) await stripe.subscriptions.cancel(item.id, {}, BILLING_REQUEST_OPTIONS);
      }
      // Never remove the account while any renewable subscription remains externally.
      for (const customer of customers) {
        if ((await customerSubscriptions(stripe, customer, refresh)).some(isRenewableStripeSubscription)) throw new Error("Stripe cancellation has not completed");
      }
      for (const id of subscriptionIds) {
        await refresh();
        if (isRenewableStripeSubscription(await stripe.subscriptions.retrieve(id, {}, BILLING_REQUEST_OPTIONS))) throw new Error("Stripe cancellation has not completed");
      }
    }
    await refresh();
    await deleteAccount();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "Nie udało się zakończyć rozliczeń konta. Konto pozostaje aktywne; spróbuj ponownie później.", "BILLING_CANCELLATION_FAILED");
  } finally {
    // A successful cascade removes the state itself; a failure allows a safe retry.
    await releaseBillingLease(userId, state.leaseToken!).catch(() => undefined);
  }
}

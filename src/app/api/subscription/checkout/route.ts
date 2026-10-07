import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripe, getPriceIdForPlan, getAppBaseUrl } from "@/lib/stripe";
import { acquireBillingLease, refreshBillingLease, releaseBillingLease, updateBillingLease } from "@/lib/billing-lease";
import { BILLING_REQUEST_OPTIONS, customerSubscriptions, expireCheckout, isRenewableStripeSubscription, openCustomerCheckouts } from "@/lib/billing-stripe-state";
import { syncStripeSubscription } from "@/lib/subscription";
import type { SubscriptionPlan } from "@/lib/subscription-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const alreadySubscribed = () => new ApiError(409, "Konto ma już rozpoczętą lub aktywną subskrypcję. Zarządzaj nią w portalu Stripe.", "SUBSCRIPTION_EXISTS");

export async function POST(req: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Musisz być zalogowany, aby wybrać plan.");
    const body = await readJson(req);
    const plan = body.plan as SubscriptionPlan;
    if (plan !== "monthly" && plan !== "yearly") throw new ApiError(400, "Nieprawidłowy plan subskrypcji.");

    let state = await acquireBillingLease(user.id, plan);
    const token = state.leaseToken!;
    release = () => releaseBillingLease(user.id, token);
    const refresh = () => refreshBillingLease(user.id, token);
    const stripe = getStripe();
    const record = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!record?.stripeSubscriptionId && (record?.status === "active" || record?.status === "trialing") &&
      (!record.currentPeriodEnd || record.currentPeriodEnd > new Date())) throw alreadySubscribed();

    let customer = record?.stripeCustomerId || undefined;
    if (customer) {
      const renewable = (await customerSubscriptions(stripe, customer, refresh)).filter(isRenewableStripeSubscription);
      if (renewable.length) {
        await syncStripeSubscription(renewable[0], user.id);
        throw alreadySubscribed();
      }
    } else if (record?.stripeSubscriptionId) {
      await refresh();
      const existing = await stripe.subscriptions.retrieve(record.stripeSubscriptionId, {}, BILLING_REQUEST_OPTIONS);
      await syncStripeSubscription(existing, user.id);
      if (isRenewableStripeSubscription(existing)) throw alreadySubscribed();
      customer = typeof existing.customer === "string" ? existing.customer : existing.customer.id;
    }

    if (!customer) {
      await refresh();
      // This key was committed before contacting Stripe. An ambiguous retry finds the same customer.
      const created = await stripe.customers.create({ metadata: { userId: user.id } }, {
        ...BILLING_REQUEST_OPTIONS, idempotencyKey: `fp-customer-${state.idempotencyKey}`,
      });
      customer = created.id;
      await prisma.subscription.upsert({
        where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customer, status: "inactive" },
        update: { stripeCustomerId: customer },
      });
    }

    let session: Stripe.Checkout.Session | undefined;
    if (state.stripeCheckoutSessionId) {
      await refresh();
      session = await stripe.checkout.sessions.retrieve(state.stripeCheckoutSessionId, {}, BILLING_REQUEST_OPTIONS);
    } else if (state.checkoutParams && state.sessionExpiresAt && state.sessionExpiresAt > new Date()) {
      await refresh();
      // A prior request may have reached Stripe without saving its response. Replay exact parameters.
      session = await stripe.checkout.sessions.create(state.checkoutParams as unknown as Stripe.Checkout.SessionCreateParams, {
        ...BILLING_REQUEST_OPTIONS, idempotencyKey: state.idempotencyKey,
      });
    }
    if (session?.status === "complete") {
      const previousId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!previousId) throw alreadySubscribed();
      await refresh();
      const previous = await stripe.subscriptions.retrieve(previousId, {}, BILLING_REQUEST_OPTIONS);
      if (isRenewableStripeSubscription(previous)) throw alreadySubscribed();
      // A finished checkout is historical after its subscription terminates; allow resubscription.
      session = undefined;
    }
    if (session?.status === "open" && state.plan !== plan) {
      await refresh();
      await expireCheckout(stripe, session);
      // Expiration can lose a race to payment; retrieve the latest state before replacing it.
      session = await stripe.checkout.sessions.retrieve(session.id, {}, BILLING_REQUEST_OPTIONS);
      if (session.status === "complete") throw alreadySubscribed();
    }
    if (!session || session.status !== "open") {
      // Close older/legacy payment tabs before starting a replacement attempt.
      for (const other of await openCustomerCheckouts(stripe, customer, refresh)) {
        await refresh();
        await expireCheckout(stripe, other);
        const latest = await stripe.checkout.sessions.retrieve(other.id, {}, BILLING_REQUEST_OPTIONS);
        if (latest.status === "complete") throw alreadySubscribed();
      }
      const baseUrl = getAppBaseUrl(req);
      // Stripe requires at least 30 minutes. A full-day window allows delayed retries
      // to replay the frozen payload without immediately making expires_at invalid.
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription", customer,
        line_items: [{ price: getPriceIdForPlan(plan), quantity: 1 }],
        client_reference_id: user.id, metadata: { userId: user.id, plan },
        subscription_data: { metadata: { userId: user.id, plan } },
        success_url: `${baseUrl}/settings/account?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/settings/account?billing=cancel`,
        expires_at: Math.floor(expiresAt.getTime() / 1000), locale: "pl", allow_promotion_codes: true,
      };
      const idempotencyKey = randomUUID();
      await updateBillingLease(user.id, token, {
        plan, idempotencyKey, checkoutParams: params as unknown as Prisma.InputJsonValue,
        stripeCheckoutSessionId: null, checkoutUrl: null, sessionExpiresAt: expiresAt,
      });
      state = { ...state, plan, idempotencyKey };
      await refresh();
      session = await stripe.checkout.sessions.create(params, { ...BILLING_REQUEST_OPTIONS, idempotencyKey });
    }
    if (session.status !== "open" || !session.url) throw new ApiError(503, "Nie udało się otworzyć płatności. Spróbuj ponownie.", "BILLING_UNAVAILABLE");
    await updateBillingLease(user.id, token, {
      stripeCheckoutSessionId: session.id, checkoutUrl: session.url,
      sessionExpiresAt: new Date(session.expires_at * 1000),
    });
    return json({ url: session.url });
  } catch (error) {
    // Keep the persisted attempt/key on transport failure; never create a replacement blindly.
    return handleApiError(error instanceof ApiError ? error : new ApiError(503, "Płatności są chwilowo niedostępne. Spróbuj ponownie później.", "BILLING_UNAVAILABLE"));
  } finally {
    await release?.().catch(() => undefined);
  }
}

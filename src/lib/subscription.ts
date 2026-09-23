import "server-only";
import type Stripe from "stripe";
import { prisma } from "./db";
import { resolvePlanFromStripeSubscription } from "./stripe";
import type { SubscriptionPlan, SubscriptionStatus } from "./subscription-plans";

/**
 * Zwraca rekord subskrypcji użytkownika z bazy danych.
 */
export async function getUserSubscription(userId: string) {
  if (!userId) return null;
  return prisma.subscription.findUnique({
    where: { userId },
  });
}

/**
 * Sprawdza, czy użytkownik posiada aktywny dostęp Pro (subskrypcję aktywną lub w okresie próbnym).
 * Zaprojektowane z myślą o przyszłym gatingu funkcji (limity faktur, zaawansowane moduły).
 *
 * @example
 * if (!(await hasActivePro(user.id))) {
 *   throw new ApiError(403, "Funkcja dostępna wyłącznie w planie Pro.");
 * }
 */
export async function hasActivePro(userId: string): Promise<boolean> {
  if (!userId) return false;

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      status: true,
      currentPeriodEnd: true,
    },
  });

  if (!sub) return false;

  const isActiveStatus = sub.status === "active" || sub.status === "trialing";
  if (!isActiveStatus) return false;

  // Jeżeli data zakończenia okresu istnieje, weryfikujemy czy nie minęła
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) {
    return false;
  }

  return true;
}

/**
 * Normalizuje status Stripe do statusu wewnętrznego aplikacji.
 */
export function normalizeStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return "inactive";
  }
}

/**
 * Idempotentnie synchronizuje stan subskrypcji ze Stripe w bazie danych MongoDB.
 */
export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  explicitUserId?: string
) {
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  // 1. Ustal userId (z parametru, z metadanych subskrypcji, lub z istniejącego rekordu w bazie)
  let userId = explicitUserId || subscription.metadata?.userId;

  if (!userId && stripeSubscriptionId) {
    const existingBySub = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { userId: true },
    });
    if (existingBySub?.userId) userId = existingBySub.userId;
  }

  if (!userId && stripeCustomerId) {
    const existingByCust = await prisma.subscription.findUnique({
      where: { stripeCustomerId },
      select: { userId: true },
    });
    if (existingByCust?.userId) userId = existingByCust.userId;
  }

  if (!userId) {
    console.warn(
      `[Stripe Sync] Nie można powiązać subskrypcji ${stripeSubscriptionId} z żadnym użytkownikiem. Brak userId w metadanych.`
    );
    return null;
  }

  // 2. Odczytaj szczegóły planu, datę i status
  const plan: SubscriptionPlan | null = resolvePlanFromStripeSubscription(subscription);
  const status: SubscriptionStatus = normalizeStripeStatus(subscription.status);
  const primaryItem = subscription.items?.data?.[0];
  const stripePriceId = primaryItem?.price?.id ?? null;

  // Stripe current_period_end jest w sekundach (Unix timestamp)
  const currentPeriodEnd = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end * 1000)
    : null;

  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  // 3. Zapisz w bazie danych (upsert po unikalnym userId)
  const updated = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId,
      stripePriceId,
      plan: plan || "monthly",
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
    update: {
      stripeCustomerId: stripeCustomerId || undefined,
      stripeSubscriptionId,
      stripePriceId: stripePriceId || undefined,
      plan: plan || undefined,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
  });

  console.log(
    `[Stripe Sync] Zaktualizowano subskrypcję dla użytkownika ${userId}: plan=${plan}, status=${status}, do=${currentPeriodEnd?.toISOString()}`
  );

  return updated;
}

import "server-only";
import { randomUUID } from "node:crypto";
import type { BillingCheckoutState } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

const LEASE_MS = 5 * 60_000;

/** Serialize Checkout, webhook reconciliation and account removal across instances. */
export async function acquireBillingLease(userId: string, plan = "none"): Promise<BillingCheckoutState> {
  const leaseToken = randomUUID();
  const now = new Date();
  return prisma.$transaction(async tx => {
    // Mongo transactions conflict on this shared row even when the lock does not yet exist.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { billingQuotaVersion: true } });
    if (!user) throw new ApiError(401, "Konto nie jest już dostępne.", "UNAUTHENTICATED");
    await tx.user.update({ where: { id: userId }, data: { billingQuotaVersion: (user.billingQuotaVersion ?? 0) + 1 } });
    const state = await tx.billingCheckoutState.findUnique({ where: { userId } });
    if (state?.leaseToken && state.leaseExpiresAt && state.leaseExpiresAt > now) {
      throw new ApiError(409, "Trwa już obsługa płatności tego konta. Spróbuj ponownie za chwilę.", "BILLING_BUSY");
    }
    const data = { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) };
    return state
      ? tx.billingCheckoutState.update({ where: { userId }, data })
      : tx.billingCheckoutState.create({ data: { userId, plan, idempotencyKey: randomUUID(), ...data } });
  }).catch(error => {
    if (error?.code === "P2034" || error?.code === "P2002") {
      throw new ApiError(409, "Trwa już obsługa płatności tego konta. Spróbuj ponownie za chwilę.", "BILLING_BUSY");
    }
    throw error;
  });
}

export async function releaseBillingLease(userId: string, leaseToken: string) {
  await prisma.billingCheckoutState.updateMany({ where: { userId, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } });
}

export async function updateBillingLease(
  userId: string,
  leaseToken: string,
  data: Parameters<typeof prisma.billingCheckoutState.updateMany>[0]["data"]
) {
  const updated = await prisma.billingCheckoutState.updateMany({
    where: { userId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data,
  });
  if (updated.count !== 1) throw new ApiError(409, "Obsługa płatności wymaga ponowienia. Odśwież stronę.", "BILLING_BUSY");
}

export async function refreshBillingLease(userId: string, leaseToken: string) {
  await updateBillingLease(userId, leaseToken, { leaseExpiresAt: new Date(Date.now() + LEASE_MS) });
}

import "server-only";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { warsawDate } from "@/lib/scheduling";
import { isSubscriptionStatusActive } from "@/lib/subscription-plans";

export const FREE_INVOICE_LIMIT = 5;

/** A calendar-month boundary in Europe/Warsaw, including the October/March DST changes. */
export function quotaMonth(now = new Date()) {
  const [year, month] = warsawDate(now).split("-").map(Number);
  const boundary = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1) - (m >= 4 && m <= 10 ? 2 : 1) * 3_600_000);
  return { start: boundary(year, month), end: boundary(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) };
}

export async function billingOwnerId(tx: Prisma.TransactionClient, actorId: string, companyId?: string | null) {
  if (!companyId) return actorId;
  const company = await tx.companyProfile.findUnique({ where: { id: companyId }, select: { userId: true } });
  if (!company) throw new ApiError(409, "Nie znaleziono firmy wystawiającej.");
  return company.userId;
}

export async function invoiceQuota(tx: Prisma.TransactionClient, ownerId: string, now = new Date()) {
  const sub = await tx.subscription.findUnique({ where: { userId: ownerId }, select: { plan: true, status: true, currentPeriodEnd: true } });
  const pro = (sub?.plan === "monthly" || sub?.plan === "yearly") && isSubscriptionStatusActive(sub.status) && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now);
  if (pro) return { tier: "pro" as const, used: 0, limit: null, remaining: null };
  const ids = (await tx.companyProfile.findMany({ where: { userId: ownerId }, select: { id: true } })).map(c => c.id);
  const { start, end } = quotaMonth(now);
  const issued: Prisma.InvoiceWhereInput = { issuedAt: { gte: start, lt: end } };
  const legacy: Prisma.InvoiceWhereInput = { AND: [
    { OR: [{ issuedAt: null }, { issuedAt: { isSet: false } }] },
    { createdAt: { gte: start, lt: end } },
    { status: { not: "draft" } },
  ] };
  const used = await tx.invoice.count({ where: {
    type: "sale",
    OR: [
      ...(ids.length ? [{ sellerCompanyId: { in: ids } }] : []),
      { userId: ownerId, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] },
    ],
    AND: [
      // Historical MongoDB rows can lack isProforma entirely; omission means a normal invoice.
      { OR: [{ isProforma: false }, { isProforma: null }, { isProforma: { isSet: false } }] },
      { OR: [issued, legacy] },
    ],
  } });
  return { tier: "free" as const, used, limit: FREE_INVOICE_LIMIT, remaining: Math.max(0, FREE_INVOICE_LIMIT - used) };
}

/** Call in the same transaction as the first issue. A write to the owner's row serializes concurrent issuances. */
export async function claimInvoiceQuota(tx: Prisma.TransactionClient, actorId: string, companyId?: string | null, now = new Date()) {
  const ownerId = await billingOwnerId(tx, actorId, companyId);
  const sub = await tx.subscription.findUnique({ where: { userId: ownerId }, select: { plan: true, status: true, currentPeriodEnd: true } });
  if ((sub?.plan === "monthly" || sub?.plan === "yearly") && isSubscriptionStatusActive(sub.status) && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now)) return now;
  await tx.user.update({ where: { id: ownerId }, data: { billingQuotaVersion: { increment: 1 } } });
  const quota = await invoiceQuota(tx, ownerId, now);
  if (quota.used >= FREE_INVOICE_LIMIT) throw new ApiError(409, "Limit konta Free: 5 wystawionych faktur w miesiącu. Kolejną możesz wystawić w następnym miesiącu.", "FREE_INVOICE_LIMIT");
  return now;
}

export async function currentInvoiceQuota(userId: string) {
  return invoiceQuota(prisma, userId);
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isEmailVerifiedForSending } from "@/lib/email/verification";
import { recordAuditLog } from "@/lib/audit";

const LEASE_MS = 120_000;
export const DELIVERY_UNCERTAIN_MESSAGE = "Nie można potwierdzić wyniku wysyłki. Wiadomość mogła zostać przyjęta przez serwer. Sprawdź historię u dostawcy poczty przed ponowną wysyłką.";
export const manualEmailDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type ManualDeliveryLease = { id: string; userId: string; token: string; invoiceId?: string; replay?: Record<string, unknown> };

async function retry<T>(db: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>, exhausted?: () => ApiError): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(callback); }
    catch (error) {
      if (!["P2034", "P2002"].includes((error as { code?: string }).code ?? "")) throw error;
      if (attempt >= 7) throw exhausted ? exhausted() : error;
      // Concurrent serverless attempts must not repeatedly wake on one schedule.
      const ceiling = Math.min(200, 25 * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, 25 + Math.floor(Math.random() * ceiling)));
    }
  }
}

function uncertain() { return new ApiError(409, DELIVERY_UNCERTAIN_MESSAGE, "EMAIL_DELIVERY_UNCERTAIN"); }
function busy() { return new ApiError(409, "Ta wysyłka jest już w trakcie realizacji. Proszę czekać.", "DUPLICATE_REQUEST"); }

/** Claim across instances; a per-user transaction also fences ambiguous requests with a newly supplied key. */
export async function claimManualEmail(
  input: { userId: string; invoiceId?: string; key: string; requestHash: string; targetHash: string }, db: PrismaClient = prisma
): Promise<ManualDeliveryLease> {
  const token = randomBytes(16).toString("hex"), keyHash = manualEmailDigest(input.key);
  const result = await retry<ManualDeliveryLease | { uncertain: true }>(db, async tx => {
    const now = new Date();
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    if (!isEmailVerifiedForSending(user)) throw new ApiError(403, "Potwierdź swój adres e-mail w Ustawieniach konta przed wysyłką wiadomości do klientów.", "EMAIL_NOT_VERIFIED");
    let invoiceFence: { emailDispatchVersion: number | null } | null = null;
    let fenced = false;
    const fence = async () => {
      if (fenced) return;
      // Only a claim which changes durable state needs the conflicting write.
      // Read-only busy/replay decisions must not contend with its rightful owner.
      await tx.user.update({ where: { id: user.id }, data: { emailSafetyVersion: (user.emailSafetyVersion ?? 0) + 1 } });
      if (invoiceFence && input.invoiceId) await tx.invoice.update({ where: { id: input.invoiceId }, data: { emailDispatchVersion: (invoiceFence.emailDispatchVersion ?? 0) + 1 } });
      fenced = true;
    };
    const existing = await tx.manualEmailDelivery.findUnique({ where: { userId_keyHash: { userId: input.userId, keyHash } } });
    if (existing && existing.requestHash !== input.requestHash) throw new ApiError(409, "Klucz wysyłki został użyty z innymi danymi. Otwórz ponownie formularz.", "IDEMPOTENCY_CONFLICT");
    if (existing?.status === "accepted") return { id: existing.id, userId: input.userId, token: "", replay: existing.response as Record<string, unknown> };
    if (existing?.status === "verify_needed") return { uncertain: true };
    if (existing?.status === "preparing" && existing.leaseUntil && existing.leaseUntil > now) throw busy();
    if (existing?.status === "sending") {
      if (!existing.leaseUntil || existing.leaseUntil <= now) {
        await fence();
        await tx.manualEmailDelivery.update({ where: { id: existing.id }, data: { status: "verify_needed", lastError: DELIVERY_UNCERTAIN_MESSAGE, leaseToken: null, leaseUntil: null } });
        await tx.invoiceEmailLog.updateMany({ where: { id: existing.id }, data: { status: "verify_needed", error: DELIVERY_UNCERTAIN_MESSAGE } });
        return { uncertain: true };
      }
      throw busy();
    }
    if (input.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId }, select: { emailDispatchVersion: true, autoKsefEmailStatus: true, autoKsefEmailLockedUntil: true } });
      if (!invoice) throw new ApiError(404, "Faktura nie istnieje.", "NOT_FOUND");
      if (invoice.autoKsefEmailStatus === "verify_needed") throw uncertain();
      if (invoice.autoKsefEmailStatus === "sending" || invoice.autoKsefEmailStatus === "preparing" && invoice.autoKsefEmailLockedUntil && invoice.autoKsefEmailLockedUntil > now) throw busy();
      // The invoice fence also serializes different authorized members of the same company.
      invoiceFence = invoice;
      const other = await tx.manualEmailDelivery.findFirst({ where: { invoiceId: input.invoiceId, ...(existing ? { id: { not: existing.id } } : {}), status: { in: ["preparing", "sending", "verify_needed"] } } });
      if (other?.status === "verify_needed") return { uncertain: true };
      if (other?.status === "sending") {
        if (other.leaseUntil && other.leaseUntil > now) throw busy();
        await fence();
        await tx.manualEmailDelivery.update({ where: { id: other.id }, data: { status: "verify_needed", leaseToken: null, leaseUntil: null, lastError: DELIVERY_UNCERTAIN_MESSAGE } });
        await tx.invoiceEmailLog.updateMany({ where: { id: other.id }, data: { status: "verify_needed", error: DELIVERY_UNCERTAIN_MESSAGE } });
        return { uncertain: true };
      }
      if (other?.status === "preparing") {
        if (other.leaseUntil && other.leaseUntil > now) throw busy();
        await fence();
        await tx.manualEmailDelivery.update({ where: { id: other.id }, data: { status: "failed", leaseToken: null, leaseUntil: null, lastError: "Przerwano przygotowanie wiadomości przed wysyłką." } });
      }
    }
    const previous = await tx.manualEmailDelivery.findFirst({ where: { userId: input.userId, targetHash: input.targetHash, status: { in: ["sending", "verify_needed", "preparing"] } } });
    if (previous && previous.id !== existing?.id) {
      if (previous.status === "verify_needed") return { uncertain: true };
      if (previous.status === "sending" && (!previous.leaseUntil || previous.leaseUntil <= now)) {
        await fence();
        await tx.manualEmailDelivery.update({ where: { id: previous.id }, data: { status: "verify_needed", lastError: DELIVERY_UNCERTAIN_MESSAGE, leaseToken: null, leaseUntil: null } });
        await tx.invoiceEmailLog.updateMany({ where: { id: previous.id }, data: { status: "verify_needed", error: DELIVERY_UNCERTAIN_MESSAGE } });
        return { uncertain: true };
      }
      // An expired preparation never reached a provider; it may be reclaimed with the original key only.
      if (previous.status === "preparing" && previous.leaseUntil && previous.leaseUntil <= now) {
        await fence();
        await tx.manualEmailDelivery.update({ where: { id: previous.id }, data: { status: "failed", leaseToken: null, leaseUntil: null, lastError: "Przerwano przygotowanie wiadomości przed wysyłką." } });
      } else throw busy();
    }
    await fence();
    const data = { status: "preparing", leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), lastError: null };
    const delivery = existing
      ? await tx.manualEmailDelivery.update({ where: { id: existing.id }, data })
      : await tx.manualEmailDelivery.create({ data: { userId: input.userId, invoiceId: input.invoiceId, keyHash, requestHash: input.requestHash, targetHash: input.targetHash, ...data } });
    return { id: delivery.id, userId: input.userId, invoiceId: input.invoiceId, token };
  }, () => new ApiError(409, "Trwa inna operacja wysyłki. Odczekaj chwilę i sprawdź jej status.", "EMAIL_BUSY"));
  if ("uncertain" in result) throw uncertain();
  return result;
}

/** The sending fence and history record commit before any provider is contacted. */
export async function startManualEmail(
  lease: ManualDeliveryLease,
  log: { to: string; cc?: string; bcc?: string; subject: string; messageBody: string; provider: string; attachments: Prisma.InputJsonValue },
  db: PrismaClient = prisma
) {
  await retry(db, async tx => {
    const now = new Date();
    if (lease.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: lease.invoiceId }, select: { autoKsefEmailStatus: true, autoKsefEmailLockedUntil: true, emailDispatchVersion: true } });
      if (!invoice) throw new ApiError(404, "Faktura nie istnieje.", "NOT_FOUND");
      if (invoice.autoKsefEmailStatus === "verify_needed") throw uncertain();
      if (invoice.autoKsefEmailStatus === "sending" || invoice.autoKsefEmailStatus === "preparing" && invoice.autoKsefEmailLockedUntil && invoice.autoKsefEmailLockedUntil > now) throw busy();
      // Auto and manual sending transactions both write the invoice, fencing concurrent company actors.
      await tx.invoice.update({ where: { id: lease.invoiceId }, data: { emailDispatchVersion: (invoice.emailDispatchVersion ?? 0) + 1 } });
    }
    const updated = await tx.manualEmailDelivery.updateMany({ where: { id: lease.id, leaseToken: lease.token, status: "preparing", leaseUntil: { gt: now } }, data: { status: "sending", provider: log.provider, leaseUntil: new Date(now.getTime() + LEASE_MS) } });
    if (updated.count !== 1) throw busy();
    if (lease.invoiceId) await tx.invoiceEmailLog.upsert({ where: { id: lease.id }, create: { id: lease.id, invoiceId: lease.invoiceId, userId: lease.userId, ...log, status: "queued", manualDelivery: true }, update: { ...log, status: "queued", error: null, resolutionAt: null, resolutionBy: null, resolutionResult: null } });
  });
}

/** Read-side recovery does not contact a provider and never retries an interrupted sending attempt. */
export async function recoverInterruptedManualEmails(userId: string, invoiceId: string, db: PrismaClient = prisma) {
  await retry(db, async tx => {
    const expired = await tx.manualEmailDelivery.findMany({ where: { userId, invoiceId, status: "sending", leaseUntil: { lte: new Date() } }, select: { id: true }, take: 50 });
    if (!expired.length) return;
    const ids = expired.map(delivery => delivery.id);
    const changed = await tx.manualEmailDelivery.updateMany({ where: { id: { in: ids }, status: "sending", leaseUntil: { lte: new Date() } }, data: { status: "verify_needed", leaseToken: null, leaseUntil: null, lastError: DELIVERY_UNCERTAIN_MESSAGE } });
    if (changed.count) await tx.invoiceEmailLog.updateMany({ where: { id: { in: ids }, status: "queued" }, data: { status: "verify_needed", error: DELIVERY_UNCERTAIN_MESSAGE } });
  });
}

/** An explicit provider check is recorded as an operator decision, never as a new transport attempt. */
export async function resolveManualEmail(
  input: { deliveryId: string; invoiceId: string; userId: string; companyId?: string | null; result: "accepted" | "not-sent" },
  db: PrismaClient = prisma
) {
  return retry(db, async tx => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    await tx.user.update({ where: { id: user.id }, data: { emailSafetyVersion: (user.emailSafetyVersion ?? 0) + 1 } });
    const delivery = await tx.manualEmailDelivery.findFirst({ where: { id: input.deliveryId, userId: input.userId, invoiceId: input.invoiceId, status: "verify_needed" } });
    if (!delivery) throw new ApiError(409, "Ta wysyłka nie oczekuje na ręczne sprawdzenie lub należy do innego użytkownika.", "MANUAL_DELIVERY_NOT_PENDING");
    const now = new Date(), accepted = input.result === "accepted";
    const log = await tx.invoiceEmailLog.findUnique({ where: { id: delivery.id } });
    const response = { success: accepted, manualResolution: input.result, message: accepted ? "Użytkownik potwierdził przyjęcie wiadomości po sprawdzeniu u dostawcy poczty." : "Użytkownik potwierdził brak wysyłki po sprawdzeniu u dostawcy poczty. Możesz ponowić wysyłkę ręcznie.", provider: delivery.provider, sentAt: now.toISOString(), sentToEmail: log?.to ?? "" };
    await tx.manualEmailDelivery.update({ where: { id: delivery.id }, data: { status: accepted ? "accepted" : "failed", lastError: response.message, response, ...(accepted ? { sentAt: now } : {}) } });
    await tx.invoiceEmailLog.updateMany({ where: { id: delivery.id, status: "verify_needed" }, data: { status: accepted ? "accepted" : "failed", error: accepted ? null : "Ręcznie potwierdzono brak wysyłki u dostawcy poczty.", resolutionAt: now, resolutionBy: user.id, resolutionResult: input.result } });
    if (accepted) await tx.invoice.update({ where: { id: input.invoiceId }, data: { sentAt: now, sentToEmail: log?.to, emailStatus: "SENT" } });
    await recordAuditLog({ client: tx, userId: user.id, userName: user.name, userEmail: user.email, companyId: input.companyId, documentId: input.invoiceId, entityType: "invoice", entityId: input.invoiceId, action: "invoice_email_delivery_resolved", description: response.message, details: { deliveryId: delivery.id, result: input.result, source: "manual-provider-check" } });
    return response;
  });
}

/** Finish is fenced. Unknown delivery remains blocked even when a caller retries with a new key. */
export async function finishManualEmail(
  lease: ManualDeliveryLease,
  result: { status: "accepted" | "failed" | "verify_needed"; provider?: string; messageId?: string; error?: string; response?: Prisma.InputJsonValue; sentToEmail?: string },
  db: PrismaClient = prisma
) {
  await retry(db, async tx => {
    const now = new Date();
    const updated = await tx.manualEmailDelivery.updateMany({ where: { id: lease.id, leaseToken: lease.token, status: { in: ["preparing", "sending"] } }, data: {
      status: result.status, leaseToken: null, leaseUntil: null, lastError: result.error ?? null,
      provider: result.provider, messageId: result.messageId, ...(result.status === "accepted" ? { sentAt: now } : {}), response: result.response,
    } });
    if (updated.count !== 1) throw busy();
    await tx.invoiceEmailLog.updateMany({ where: { id: lease.id }, data: { status: result.status, error: result.error ?? null, provider: result.provider, messageId: result.messageId, ...(result.status === "accepted" ? { sentAt: now } : {}) } });
    if (lease.invoiceId && result.status === "accepted") await tx.invoice.update({ where: { id: lease.invoiceId }, data: { sentAt: now, sentToEmail: result.sentToEmail, emailStatus: "SENT" } });
  });
}

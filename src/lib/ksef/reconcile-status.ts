import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";
import { recordAuditLog } from "@/lib/audit";
import { triggerAutoEmailOnKsef } from "@/lib/email/auto-send";
type StatusInvoice = Prisma.InvoiceGetPayload<{ include: { sellerCompany: true; ksefSession: true } }>;
/** Read the previous transmission only. This function never sends or retries an invoice. */
export async function reconcileKsefInvoice(invoice: StatusInvoice, actor: { id: string; name?: string | null; email?: string | null }, options: { deadlineAtMs?: number; deferAutoEmail?: boolean } = {}) {
  if (invoice.ksefNumber && invoice.upoXml) {
    if (invoice.autoSendEmailOnKsef && !options.deferAutoEmail) await triggerAutoEmailOnKsef(invoice.id);
    return { success: true, status: "ACCEPTED", ksefReferenceNumber: invoice.ksefNumber, hasUpo: true };
  }
  const meta = (invoice.ksef && typeof invoice.ksef === "object" && !Array.isArray(invoice.ksef) ? invoice.ksef : {}) as Record<string, unknown>;
  const env = meta.environment as KsefEnvironment;
  if (env !== "production" && env !== "test") {
    return { success: true, status: invoice.ksefStatus === "accepted" ? "ACCEPTED" : "PENDING", ksefReferenceNumber: invoice.ksefNumber, hasUpo: Boolean(invoice.upoXml), message: "Tryb demonstracyjny: brak odczytu z MF." };
  }
  const sessionRef = typeof meta.sessionReferenceNumber === "string" ? meta.sessionReferenceNumber : invoice.ksefSession?.referenceNumber;
  const nip = (invoice.sellerCompany?.nip || invoice.nip || "").replace(/\D/g, "");
  if (!invoice.referenceNumber || !sessionRef || !nip) throw new ApiError(409, "Brak danych poprzedniej wysyłki. Sprawdź dokument w KSeF ręcznie.");
  const session = await prisma.ksefSession.findFirst({ where: {
    userId: { in: [...new Set([actor.id, invoice.userId])] }, nip, environment: env, status: "ACTIVE", validUntil: { gt: new Date() },
  }, orderBy: { createdAt: "desc" } });
  if (!session?.accessToken) throw new ApiError(409, "Brak aktywnej sesji KSeF dla tej firmy. Odnów uwierzytelnienie i sprawdź ponownie.");
  const result = await new KsefClient({ environment: env, deadlineAtMs: options.deadlineAtMs }).getInvoiceStatus(session.accessToken, sessionRef, invoice.referenceNumber);
  const accepted = result.status === "ACCEPTED" && Boolean(result.ksefReferenceNumber);
  const rejected = result.status === "REJECTED";
  if (accepted || rejected) {
    await prisma.$transaction(async tx => {
      const updated = await tx.invoice.updateMany({ where: { id: invoice.id, referenceNumber: invoice.referenceNumber, OR: [{ ksefNumber: null, ksefStatus: { in: ["verify_needed", "sending", "queued"] } }, ...(accepted && result.ksefReferenceNumber === invoice.ksefNumber && !invoice.upoXml && result.upoXml ? [{ ksefNumber: invoice.ksefNumber, ksefStatus: "accepted" }] : [])] }, data: {
        status: invoice.paymentStatus === "paid" || invoice.status === "paid" ? "paid" : accepted ? "ksef_active" : "ksef_rejected",
        documentStatus: accepted ? "accepted" : "rejected", ksefStatus: accepted ? "accepted" : "rejected",
        ...(accepted ? { ksefNumber: result.ksefReferenceNumber, upoXml: result.upoXml || invoice.upoXml } : {}),
        ksef: { ...meta, number: accepted ? result.ksefReferenceNumber : null, status: accepted ? "ACTIVE" : "REJECTED", processingCode: result.processingCode, processingDescription: result.processingDescription },
      } });
      if (updated.count) {
        await tx.ksefQueueTask.updateMany({ where: { invoiceId: invoice.id, status: { in: ["verify_needed", "queued"] } }, data: { status: accepted ? "completed" : "failed", lockedUntil: null, errorDetails: rejected ? result.processingDescription : null } });
        await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: actor.id, userName: actor.name, userEmail: actor.email, action: "ksef.status_reconciled", entityType: "invoice", entityId: invoice.id, details: { result: result.status, referenceNumber: invoice.referenceNumber } });
      }
    });
  }
  if (accepted && (result.upoXml || invoice.upoXml) && invoice.autoSendEmailOnKsef && !options.deferAutoEmail) await triggerAutoEmailOnKsef(invoice.id);
  return { success: true, status: result.status, processingCode: result.processingCode, processingDescription: result.processingDescription, ksefReferenceNumber: result.ksefReferenceNumber || invoice.ksefNumber, hasUpo: Boolean(result.upoXml || invoice.upoXml), upoXml: result.upoXml || invoice.upoXml };
}

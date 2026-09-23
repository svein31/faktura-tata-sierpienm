import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { KsefClient, type KsefEnvironment } from "@/lib/ksef/index";
import { recordAuditLog } from "@/lib/audit";
import { accessibleCompanyIds } from "@/lib/company-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ refNumber: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const ref = (await params).refNumber.trim();
    if (!ref || ref.length > 150) throw new ApiError(400, "Nieprawidłowy numer referencyjny.");
    const companies = await accessibleCompanyIds(user.id);
    const invoice = await prisma.invoice.findFirst({
      where: { AND: [
        { OR: [{ referenceNumber: ref }, { ksefNumber: ref }, ...(/^[a-f\d]{24}$/i.test(ref) ? [{ id: ref }] : [])] },
        { OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, sellerCompanyId: null }] },
      ] },
      include: { sellerCompany: true, ksefSession: true },
    });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
    if (invoice.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canSendKsef");
      if (!access.ok) throw new ApiError(access.status, access.error);
    } else if (invoice.userId !== user.id) throw new ApiError(404, "Nie znaleziono faktury.");

    const meta = (invoice.ksef && typeof invoice.ksef === "object" && !Array.isArray(invoice.ksef) ? invoice.ksef : {}) as Record<string, unknown>;
    const env = meta.environment as KsefEnvironment;
    if (env !== "production" && env !== "test") {
      return json({ success: true, status: invoice.ksefStatus === "accepted" ? "ACCEPTED" : "PENDING", ksefReferenceNumber: invoice.ksefNumber, hasUpo: Boolean(invoice.upoXml), message: "Tryb demonstracyjny: brak odczytu z MF." });
    }
    const sessionRef = typeof meta.sessionReferenceNumber === "string" ? meta.sessionReferenceNumber : invoice.ksefSession?.referenceNumber;
    const nip = (invoice.sellerCompany?.nip || invoice.nip || "").replace(/\D/g, "");
    if (!invoice.referenceNumber || !sessionRef || !nip) throw new ApiError(409, "Brak danych poprzedniej wysyłki. Sprawdź dokument w KSeF ręcznie.");
    const session = await prisma.ksefSession.findFirst({ where: {
      userId: invoice.userId, nip, environment: env, status: "ACTIVE", validUntil: { gt: new Date() },
    }, orderBy: { createdAt: "desc" } });
    if (!session?.accessToken) throw new ApiError(409, "Brak aktywnej sesji KSeF dla tej firmy. Odnów uwierzytelnienie i sprawdź ponownie.");
    const result = await new KsefClient({ environment: env }).getInvoiceStatus(session.accessToken, sessionRef, invoice.referenceNumber);
    const accepted = result.status === "ACCEPTED" && Boolean(result.ksefReferenceNumber);
    const rejected = result.status === "REJECTED";
    if (accepted || rejected) {
      await prisma.$transaction(async tx => {
        const updated = await tx.invoice.updateMany({ where: { id: invoice.id, referenceNumber: invoice.referenceNumber, ksefNumber: null, ksefStatus: { in: ["verify_needed", "sending", "queued"] } }, data: {
          status: accepted ? "ksef_active" : "ksef_rejected",
          documentStatus: accepted ? "accepted" : "rejected", ksefStatus: accepted ? "accepted" : "rejected",
          ...(accepted ? { ksefNumber: result.ksefReferenceNumber, upoXml: result.upoXml || invoice.upoXml } : {}),
          ksef: { ...meta, number: accepted ? result.ksefReferenceNumber : null, status: accepted ? "ACTIVE" : "REJECTED", processingCode: result.processingCode, processingDescription: result.processingDescription },
        } });
        if (updated.count) {
          await tx.ksefQueueTask.updateMany({ where: { invoiceId: invoice.id, status: "verify_needed" }, data: { status: accepted ? "completed" : "failed", lockedUntil: null, errorDetails: rejected ? result.processingDescription : null } });
          await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: user.id, userName: user.name, userEmail: user.email, action: "ksef.status_reconciled", entityType: "invoice", entityId: invoice.id, details: { result: result.status, referenceNumber: invoice.referenceNumber } });
        }
      });
    }
    return json({ success: true, status: result.status, processingCode: result.processingCode, processingDescription: result.processingDescription, ksefReferenceNumber: result.ksefReferenceNumber || invoice.ksefNumber, hasUpo: Boolean(result.upoXml || invoice.upoXml), upoXml: result.upoXml || invoice.upoXml });
  } catch (error) { return handleApiError(error); }
}

import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { companyAccess } from "@/lib/company-write";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req), rawIds = Array.isArray(body.invoiceIds) ? body.invoiceIds : [body.invoiceId];
    if (!rawIds.length || rawIds.length > 200 || rawIds.some(id => typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id))) throw new ApiError(400, "Wybierz od 1 do 200 faktur.");
    if (body.status !== undefined && body.status !== "pending" && body.status !== "approved") throw new ApiError(400, "Nieprawidłowy status akceptacji.");
    const ids = [...new Set(rawIds)] as string[], status = body.status === "pending" ? "pending" : "approved";
    const result = await prisma.$transaction(async tx => {
      const invoices = await tx.invoice.findMany({ where: { id: { in: ids } } });
      if (invoices.length !== ids.length) throw new ApiError(404, "Nie znaleziono faktury.");
      if (invoices.some(i => i.type !== "purchase")) throw new ApiError(400, "Akceptacja dotyczy tylko faktur kosztowych.");
      for (const companyId of new Set(invoices.map(i => i.sellerCompanyId).filter(Boolean))) {
        const access = await companyAccess(tx, user.id, companyId!);
        if (!["owner", "admin", "accountant"].includes(access.role)) throw new ApiError(403, "Brak uprawnień do akceptacji faktury.");
        await tx.companyProfile.update({ where: { id: companyId! }, data: { updatedAt: new Date() } });
      }
      for (const invoice of invoices) {
        if (invoice.costReviewId) throw new ApiError(409, "Dokument wymaga decyzji w obiegu kosztów.");
        if (invoice.type !== "purchase") throw new ApiError(400, "Akceptacja dotyczy tylko faktur kosztowych.");
        if (!invoice.sellerCompanyId && (invoice.userId !== user.id || user.role === "viewer")) throw new ApiError(403, "Brak uprawnień do dokumentu.");
      }
      await assertAccountingPeriodsOpen(tx, invoices.map(i => ({ companyId: i.sellerCompanyId, issueDate: i.issueDate })));
      for (const invoice of invoices) {
        const changed = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version, OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }] }, data: { approvalStatus: status, approvedAt: status === "approved" ? new Date() : null, approvedBy: status === "approved" ? user.name || user.email : null, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ApiError(409, "Dokument zmienił się. Odśwież dane.");
        await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, userId: user.id, userName: user.name, userEmail: user.email, documentId: invoice.id, entityType: "invoice", entityId: invoice.id, action: "invoice_approval_changed", diff: { approvalStatus: { old: invoice.approvalStatus, new: status } } });
      }
      return tx.invoice.findMany({ where: { id: { in: ids } }, include: { sellerCompany: true } });
    }, { timeout: 30000 });
    return json({ success: true, status, count: result.length, invoices: result.map(invoiceToDto) });
  } catch (e) { return handleApiError(e); }
}

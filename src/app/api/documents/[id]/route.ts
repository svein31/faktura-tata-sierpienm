import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { inboxAccess, reviewFields } from "@/lib/document-inbox";
import { objectId } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
import { companyAccess } from "@/lib/company-write";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; if (!objectId(id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
    const record = await prisma.expenseScan.findUnique({ where: { id }, omit: { imageData: true } });
    if (!record) throw new ApiError(404, "Nie znaleziono dokumentu.");
    await inboxAccess(user.id, record.companyId);
    const ocrJob = await prisma.ocrJob.findUnique({ where: { id }, select: { status: true, attempts: true, nextAttemptAt: true, lastError: true } });
    return json({ document: record, ocrJob });
  } catch (e) { return handleApiError(e); }
}
export async function PATCH(req: Request, context: Context) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; if (!objectId(id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
    const record = await prisma.expenseScan.findUnique({ where: { id } }); if (!record) throw new ApiError(404, "Nie znaleziono dokumentu.");
    const body = await readJson(req);
    if (!["save", "approve", "reject"].includes(String(body.action))) throw new ApiError(400, "Nieprawidłowa operacja.");
    const companyId = await inboxAccess(user.id, record.companyId, true, body.action === "approve" || body.action === "reject");
    if (record.expenseId || record.status === "converted" || record.status === "rejected") throw new ApiError(409, "Dokument ma już zapisaną decyzję.");
    if (body.version !== record.version) throw new ApiError(409, "Dokument zmienił się. Odśwież podgląd.");
    if (body.action === "approve" && record.ocrResult && body.ocrReviewed !== true) throw new ApiError(400, "Potwierdź sprawdzenie danych OCR z oryginałem.");
    const fields = body.action === "reject" ? null : reviewFields(body);
    const result = await prisma.$transaction(async tx => {
      if (body.action === "approve" || body.action === "reject") await companyAccess(tx, user.id, companyId, "canExport");
      else {
        try { await companyAccess(tx, user.id, companyId, "canIssueInvoices"); }
        catch (e) { if (!(e instanceof ApiError) || e.status !== 403) throw e; await companyAccess(tx, user.id, companyId, "canExport"); }
      }
      const claimed = await tx.expenseScan.update({ where: { id, version: record.version }, data: { version: { increment: 1 }, status: body.action === "reject" ? "rejected" : body.action === "approve" ? "converted" : "needs_review", ...(fields ? { parsed: fields } : {}) } });
      await tx.ocrJob.updateMany({ where: { id, status: { in: ["queued", "processing"] } }, data: { status: "cancelled", leaseToken: null, lastError: "Dokument został opracowany ręcznie." } });
      let expenseId: string | null = null;
      if (body.action === "approve" && fields) {
        const expense = await tx.expense.create({ data: { ...fields, companyId, userId: user.id, scanId: id, attachmentUrl: `/api/documents/${id}/file`, attachmentName: record.fileName, workflowStatus: "verified" } });
        await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate: expense.issueDate }]);
        expenseId = expense.id;
        await tx.expenseScan.update({ where: { id }, data: { expenseId } });
      }
      await recordAuditLog({ client: tx, companyId, userId: user.id, entityType: "expense_scan", entityId: id, action: `document.${body.action}`, details: { version: claimed.version, sha256: record.sha256, expenseId, fields } });
      return { version: claimed.version, expenseId };
    });
    return json(result);
  } catch (e) { return handleApiError(e); }
}

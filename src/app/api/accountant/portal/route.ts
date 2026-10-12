import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess, fenceCompanyWrite } from "@/lib/company-write";
import { requireCompanyAccess } from "@/lib/permissions";
import { objectId } from "@/lib/company-scope";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { recordAuditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
export const runtime = "nodejs";
async function accountant(tx: Prisma.TransactionClient, userId: string, companyId: string) {
  const access = await companyAccess(tx, userId, companyId);
  if (!["owner", "admin", "accountant"].includes(access.role)) throw new ApiError(403, "Portal wymaga roli księgowej lub administratora.");
  return access;
}
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const q = new URL(req.url).searchParams, companyId = q.get("companyId"), month = q.get("month") || new Date().toISOString().slice(0, 7);
    if (!objectId(companyId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Wybierz firmę i miesiąc.");
    await accountant(prisma, user.id, companyId);
    const page = Number(q.get("page") || 0);
    if (!Number.isInteger(page) || page < 0 || page > 1000) throw new ApiError(400, "Nieprawidłowa strona.");
    const [invoices, expenses] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { startsWith: month }, isProforma: { not: true }, status: { notIn: ["draft", "cancelled"] } }, orderBy: { id: "desc" }, skip: page * 30, take: 31 }),
      prisma.expense.findMany({ where: { companyId, issueDate: { startsWith: month } }, orderBy: { id: "desc" }, skip: page * 30, take: 31 }),
    ]);
    const rows = [
      ...invoices.slice(0, 30).filter(isAccountingInvoice).map(i => ({ id: i.id, kind: "invoice", number: i.number, date: i.issueDate, currency: i.currency, totalGross: i.totalGross, approved: i.approvalStatus === "approved", bookedAt: i.bookedAt, revision: String(i.version || 1), type: i.type })),
      ...expenses.slice(0, 30).map(e => ({ id: e.id, kind: "expense", number: e.number, date: e.issueDate, currency: e.currency, totalGross: e.totalGross, approved: ["verified", "sent_to_accountant"].includes(e.workflowStatus), bookedAt: e.bookedAt, revision: e.updatedAt.toISOString(), type: "purchase" })),
    ];
    const comments = await prisma.documentComment.findMany({ where: { docId: { in: rows.map(r => r.id) }, docType: { in: ["invoice", "expense"] } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, docId: true, message: true, authorName: true, createdAt: true } });
    return json({ rows, comments, nextPage: invoices.length > 30 || expenses.length > 30 ? page + 1 : null, month });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req), companyId = body.companyId;
    if (!objectId(companyId) || !["approve", "book", "unbook", "comment"].includes(String(body.action))) throw new ApiError(400, "Nieprawidłowa operacja.");
    const items = body.items;
    if (!Array.isArray(items) || !items.length || items.length > 100 || items.some(i => !i || !objectId(i.id) || !["invoice", "expense"].includes(i.kind) || typeof i.revision !== "string")) throw new ApiError(400, "Wybierz od 1 do 100 dokumentów z aktualną wersją.");
    if (new Set(items.map(i => i.kind + ":" + i.id)).size !== items.length) throw new ApiError(400, "Dokument występuje wielokrotnie.");
    const message = String(body.message || "").trim();
    if (body.action === "comment" && (!message || message.length > 2000)) throw new ApiError(400, "Uwaga musi mieć od 1 do 2000 znaków.");
    await prisma.$transaction(async tx => {
      const actor = await accountant(tx, user.id, companyId);
      await fenceCompanyWrite(tx, companyId);
      for (const item of items) {
        const invoice = item.kind === "invoice" ? await tx.invoice.findFirst({ where: { id: item.id, sellerCompanyId: companyId } }) : null;
        const expense = item.kind === "expense" ? await tx.expense.findFirst({ where: { id: item.id, companyId } }) : null;
        const record = invoice || expense;
        if (!record || invoice && !isAccountingInvoice(invoice)) throw new ApiError(404, "Nie znaleziono dokumentu księgowego w tej firmie.");
        const revision = invoice ? String(invoice.version || 1) : expense!.updatedAt.toISOString();
        if (item.revision !== revision) throw new ApiError(409, "Dokument zmienił się. Odśwież listę.");
        if (body.action === "comment") {
          await tx.documentComment.create({ data: { userId: user.id, authorName: user.name || user.email, authorRole: actor.role, docType: item.kind, docId: record.id, invoiceId: invoice?.id, expenseId: expense?.id, message } });
        } else {
          await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate: record.issueDate }]);
          if (body.action === "approve" && record.costReviewId) throw new ApiError(409, "Dokument wymaga decyzji w obiegu kosztów.");
          if (body.action === "approve" && invoice?.type === "sale") throw new ApiError(400, "Akceptacja dotyczy kosztów.");
          if (body.action === "book" && (invoice?.type === "purchase" && invoice.approvalStatus !== "approved" || expense && !["verified", "sent_to_accountant"].includes(expense.workflowStatus))) throw new ApiError(409, "Najpierw zweryfikuj i zatwierdź koszt.");
          const posting = { bookedAt: body.action === "book" ? new Date() : null, bookedBy: body.action === "book" ? user.id : null };
          if (invoice) {
            const changed = await tx.invoice.updateMany({ where: { id: invoice.id, version: invoice.version }, data: { ...(body.action === "approve" ? { approvalStatus: "approved", approvedAt: new Date(), approvedBy: user.name || user.email } : posting), version: { increment: 1 } } });
            if (changed.count !== 1) throw new ApiError(409, "Konflikt wersji dokumentu.");
          } else {
            const changed = await tx.expense.updateMany({ where: { id: expense!.id, updatedAt: expense!.updatedAt }, data: body.action === "approve" ? { workflowStatus: "verified" } : posting });
            if (changed.count !== 1) throw new ApiError(409, "Konflikt wersji kosztu.");
          }
        }
        await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, userEmail: user.email, documentId: record.id, entityType: item.kind, entityId: record.id, action: "accountant_" + body.action, details: body.action === "comment" ? { commentAdded: true } : { previousBookedAt: record.bookedAt } });
      }
    }, { timeout: 30000 });
    return json({ success: true, count: items.length });
  } catch (e) { return handleApiError(e); }
}

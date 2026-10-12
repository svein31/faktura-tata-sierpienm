import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyAccess, companyWriteAccess } from "@/lib/company-write";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { isIsoCalendarDate } from "@/lib/nbp";
import { recurrenceIntervals, RecurrenceInterval } from "@/lib/scheduling";
import { recordAuditLog } from "@/lib/audit";
import { invoiceToDto } from "@/lib/dto";
export const runtime = "nodejs";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await params; if (!objectId(id)) throw new ApiError(404, "Nie znaleziono faktury.");
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice?.sellerCompanyId || invoice.documentKind === "advance" || invoice.documentKind === "final" || invoice.type !== "sale" || invoice.isCorrection) throw new ApiError(400, "Nie można utworzyć harmonogramu dla tego dokumentu.");
    const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canIssueInvoices");
    if (!access.ok) throw new ApiError(access.status, access.error);
    const body = await readJson(req), interval = String(body.interval ?? invoice.recurringInterval ?? "monthly"), nextDate = String(body.nextDate ?? invoice.recurringNextDate ?? "");
    if (!recurrenceIntervals.includes(interval as RecurrenceInterval) || !isIsoCalendarDate(nextDate)) throw new ApiError(400, "Nieprawidłowy harmonogram.");
    const autoSend = body.autoSend === undefined ? Boolean(invoice.recurringAutoSend) : body.autoSend === true;
    if (autoSend && (invoice.isProforma || !(await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canSendKsef")).ok)) throw new ApiError(403, "Brak uprawnienia do automatycznej wysyłki KSeF.");
    const updated = await prisma.$transaction(async tx => {
      await companyWriteAccess(tx, user.id, invoice.sellerCompanyId, "canIssueInvoices");
      if (autoSend) await companyAccess(tx, user.id, invoice.sellerCompanyId, "canSendKsef");
      const result = await tx.invoice.updateMany({ where: { id, OR: [{ version: invoice.version }, ...((invoice.version ?? 1) <= 1 ? [{ version: { isSet: false } }] : [])] }, data: {
        isRecurring: true, recurringPaused: body.paused === undefined ? Boolean(invoice.recurringPaused) : body.paused === true,
        recurringInterval: interval, recurringNextDate: nextDate, recurringAnchorDay: nextDate === invoice.recurringNextDate ? invoice.recurringAnchorDay ?? Number(nextDate.slice(8)) : Number(nextDate.slice(8)),
        recurringUserId: user.id, recurringAutoSend: autoSend, recurringLastError: null, recurringLastAttemptAt: null, version: (invoice.version || 1) + 1,
      } });
      if (!result.count) throw new ApiError(409, "Harmonogram został zmieniony. Odśwież dane.");
      await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, documentId: id, userId: user.id, userName: user.name, userEmail: user.email,
        action: "recurrence_updated", entityType: "invoice", entityId: id, details: { interval, nextDate, paused: Boolean(body.paused ?? invoice.recurringPaused), autoSend } });
      return tx.invoice.findUniqueOrThrow({ where: { id } });
    });
    return json({ invoice: invoiceToDto(updated) });
  } catch (e) { return handleApiError(e); }
}

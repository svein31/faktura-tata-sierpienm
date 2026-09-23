import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import "server-only";
import { prisma } from "@/lib/db";
import { parseInvoiceBody } from "@/lib/parsers";
import { contractorForCompany } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import { claimInvoiceQuota } from "@/lib/invoice-quota";
import { addCalendarDays, nextRecurrence, warsawDate } from "@/lib/scheduling";

export async function generateRecurringInvoices(now = new Date()) {
  const today = warsawDate(now), started = Date.now();
  const templates = await prisma.invoice.findMany({ where: { isRecurring: true, recurringNextDate: { lte: today },
    AND: [{ OR: [{ recurringPaused: false }, { recurringPaused: null }, { recurringPaused: { isSet: false } }] },
      { OR: [{ recurringLastAttemptAt: null }, { recurringLastAttemptAt: { isSet: false } }, { recurringLastAttemptAt: { lte: new Date(now.getTime() - 15 * 60_000) } }] }],
  }, orderBy: [{ recurringLastAttemptAt: "asc" }, { recurringNextDate: "asc" }], take: 10 });
  const results: Array<{ templateId: string; invoiceId?: string; error?: string }> = [];
  for (const template of templates) {
    if (Date.now() - started > 20_000) break;
    try {
      const actorId = template.recurringUserId || template.userId, companyId = template.sellerCompanyId;
      if (template.documentKind === "advance" || template.documentKind === "final" || !companyId || template.type !== "sale" || template.isCorrection) throw new Error("Harmonogram wymaga faktury sprzedaży przypisanej do firmy.");
      const access = await requireCompanyAccess(actorId, companyId, "canIssueInvoices");
      if (!access.ok) throw new Error(access.error);
      if (template.recurringAutoSend && (template.isProforma || !(await requireCompanyAccess(actorId, companyId, "canSendKsef")).ok)) throw new Error("Brak uprawnienia do automatycznej wysyłki KSeF.");
      const scheduledDate = template.recurringNextDate!, anchor = template.recurringAnchorDay || Number(scheduledDate.slice(8, 10));
      const nextDate = nextRecurrence(scheduledDate, template.recurringInterval || "monthly", anchor);
      const data = await parseInvoiceBody({
        number: `CYK/${scheduledDate.replaceAll("-", "")}/${template.id}`, type: "sale", status: "issued", documentStatus: "issued",
        contractorId: template.contractorId, sellerCompanyId: companyId, issueDate: today, saleDate: scheduledDate,
        dueDate: addCalendarDays(today, template.paymentTermDays), paymentTermDays: template.paymentTermDays, paymentMethod: template.paymentMethod,
        currency: template.currency, language: template.language, lines: template.lines, notes: template.notes, isProforma: template.isProforma,
        bankAccountId: template.bankAccountId, bankAccountSnapshot: template.bankAccountSnapshot, buyerCountry: template.buyerCountry, buyerTaxIdType: template.buyerTaxIdType,
      }, { contractorOwnedBy: id => contractorForCompany(actorId, id, companyId), companyOwnedBy: async id => id === companyId });
      const settings = template.recurringAutoSend ? await prisma.ksefSettings.findUnique({ where: { userId: actorId } }) : null;
      const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true, email: true } });
      const invoice = await prisma.$transaction(async tx => {
        await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate: data.issueDate }]);
        const existing = await tx.recurringOccurrence.findUnique({ where: { templateId_scheduledDate: { templateId: template.id, scheduledDate } } });
        const claimed = await tx.invoice.updateMany({ where: { id: template.id, AND: [{ OR: [{ version: template.version }, ...((template.version ?? 1) <= 1 ? [{ version: { isSet: false } }] : [])] }], isRecurring: true, recurringNextDate: scheduledDate,
          OR: [{ recurringPaused: false }, { recurringPaused: null }, { recurringPaused: { isSet: false } }],
        }, data: { recurringNextDate: nextDate, recurringAnchorDay: anchor, recurringLastAttemptAt: now, recurringLastError: null, version: (template.version || 1) + 1 } });
        if (!claimed.count) throw new Error("Harmonogram zmienił się w czasie generowania.");
        if (existing) return { id: existing.invoiceId };
        if (await tx.invoice.count({ where: { sellerCompanyId: companyId, number: data.number } })) throw new Error("Numer cykliczny jest już używany przez inny dokument.");
        const issuedAt = !data.isProforma ? await claimInvoiceQuota(tx, actorId, companyId, now) : null;
        const created = await tx.invoice.create({ data: { ...data, userId: actorId, issuedAt, version: 1 } });
        await captureInvoicePrint(tx, created, "recurring");
        await tx.recurringOccurrence.create({ data: { templateId: template.id, scheduledDate, invoiceId: created.id } });
        if (template.recurringAutoSend) {
          const environment = settings?.environment || "test";
          if (!["demo", "test", "production"].includes(environment)) throw new Error("Nieprawidłowe środowisko KSeF.");
          await tx.ksefQueueTask.create({ data: { userId: actorId, invoiceId: created.id, environment, status: "queued", lockedUntil: null, nextAttemptAt: now, idempotencyKey: `ksef:${created.id}:1` } });
          await tx.invoice.update({ where: { id: created.id }, data: { ksefStatus: "queued", documentStatus: "ready" } });
        }
        await recordAuditLog({ client: tx, companyId, documentId: created.id, userId: actorId, userName: actor.name, userEmail: actor.email,
          action: "recurring_invoice_created", entityType: "invoice", entityId: created.id, details: { templateId: template.id, scheduledDate, nextDate } });
        return created;
      });
      results.push({ templateId: template.id, invoiceId: invoice.id });
    } catch (error) {
      if (["P2002", "P2034"].includes((error as { code?: string }).code || "")) continue;
      const message = error instanceof Error ? error.message : "Błąd generowania faktury.";
      await prisma.invoice.updateMany({ where: { id: template.id, recurringNextDate: template.recurringNextDate }, data: { recurringLastAttemptAt: now, recurringLastError: message.slice(0, 1000) } });
      results.push({ templateId: template.id, error: message });
    }
  }
  return results;
}

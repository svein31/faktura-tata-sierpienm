import "server-only";
import { prisma } from "./db";
import { invoiceToDto } from "./dto";
import { requireCompanyAccess } from "./permissions";
import { dueReminderContent } from "./reminder-content";
import { warsawDate } from "./scheduling";
import { getEmailConfigStatus, isValidEmail, sendEmail } from "./email/sender";
import { recordAuditLog } from "./audit";
import { ApiError } from "./api";
export async function processDueReminders() {
  if (!getEmailConfigStatus().configured) throw new ApiError(503,"Skonfiguruj SMTP lub Resend przed uruchomieniem przypomnień.");
  const now = new Date(), today = warsawDate(now), start = Date.now();
  await prisma.dueReminderDelivery.updateMany({ where: { status: "sending", startedAt: { lt: new Date(now.getTime() - 600000) } }, data: { status: "verify_needed", error: "Przerwane wysyłanie — sprawdź u dostawcy poczty przed ponowieniem." } });
  const settings = await prisma.dueReminderSetting.findMany({ where: { enabled: true, nextCheckAt: { lte: now } }, orderBy: { nextCheckAt: "asc" }, take: 30 });
  for (const setting of settings) {
    const claim = await prisma.dueReminderSetting.updateMany({ where: { id: setting.id, enabled: true, nextCheckAt: { lte: now } }, data: { nextCheckAt: new Date(now.getTime() + 900000) } });
    if (!claim.count) continue;
    const access = await requireCompanyAccess(setting.userId, setting.companyId, "canIssueInvoices");
    if (!access.ok) continue;
    const invoice = await prisma.invoice.findFirst({ where: { id: setting.invoiceId, sellerCompanyId: setting.companyId }, include: { sellerCompany: true } });
    if (!invoice) continue;
    const content = dueReminderContent(invoiceToDto(invoice),today,invoice.sellerCompany?.companyName || "");
    if (!content) continue;
    const eventKey = `${invoice.id}:${invoice.dueDate}:${content.stage}`;
    await prisma.dueReminderDelivery.upsert({ where: { eventKey }, update: {}, create: { settingId: setting.id, companyId: setting.companyId, eventKey, dueDate: invoice.dueDate, stage: content.stage } });
  }
  let sent = 0;
  const pending = await prisma.dueReminderDelivery.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 5 });
  for (const delivery of pending) {
    if (Date.now() - start > 5000) break;
    const claim = await prisma.dueReminderDelivery.updateMany({ where: { id: delivery.id, status: "pending" }, data: { status: "sending", startedAt: new Date() } });
    if (!claim.count) continue;
    let attempted = false;
    try {
      const setting = await prisma.dueReminderSetting.findUnique({ where: { id: delivery.settingId } });
      if (!setting?.enabled || !(await requireCompanyAccess(setting.userId, setting.companyId,"canIssueInvoices")).ok) throw new Error("Harmonogram wyłączony lub odebrano uprawnienia.");
      const invoice = await prisma.invoice.findFirst({ where: { id: setting.invoiceId, sellerCompanyId: setting.companyId }, include: { sellerCompany: true } });
      const content = invoice && dueReminderContent(invoiceToDto(invoice),today,invoice.sellerCompany?.companyName || "");
      if (!content || !invoice || invoice.dueDate !== delivery.dueDate || content.stage !== delivery.stage) {
        await prisma.dueReminderDelivery.update({ where: { id: delivery.id }, data: { status: "cancelled" } }); continue;
      }
      const contractor = await prisma.contractor.findUnique({ where: { id: invoice.contractorId } });
      if (!contractor?.email || !isValidEmail(contractor.email) || (contractor.companyId && contractor.companyId !== setting.companyId)) throw new Error("Brak poprawnego adresu e-mail kontrahenta tej firmy.");
      await prisma.dueReminderDelivery.update({ where: { id: delivery.id }, data: { recipient: contractor.email } });
      attempted = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        sendEmail({ to: contractor.email, subject: content.subject, text: content.text, singleAttempt: true, signal: AbortSignal.timeout(15000) }),
        new Promise<never>((_,reject) => { timer = setTimeout(() => reject(new Error("Limit czasu wysyłki — sprawdź status u dostawcy poczty.")),17000); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (!result.success) throw new Error("Dostawca nie potwierdził przyjęcia wiadomości.");
      await prisma.$transaction(async tx => {
        await tx.dueReminderDelivery.update({ where: { id: delivery.id }, data: { status: "sent", sentAt: new Date(), messageId: result.messageId || null, error: null } });
        await recordAuditLog({ client: tx, companyId: setting.companyId, userId: setting.userId, entityType: "invoice", entityId: invoice.id, documentId: invoice.id, action: "due_reminder_sent", details: { deliveryId: delivery.id, stage: delivery.stage } });
      }); sent++;
    } catch (error) {
      await prisma.dueReminderDelivery.update({ where: { id: delivery.id }, data: { status: attempted ? "verify_needed" : "failed", error: (error instanceof Error ? error.message : "Błąd").slice(0,500) } });
    }
  }
  return { sent };
}

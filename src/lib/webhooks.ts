import "server-only";
import { prisma } from "./db";
import { requireIntegrationOwner, statusSelect } from "./public-api";
import { tokenHash, openWebhook, webhookSignature } from "./integration-security";
import { sendWebhook } from "./webhook-transport";
export async function processStatusWebhooks() {
  const now = new Date(), started = Date.now();
  let queued = 0, sent = 0;
  const hooks = await prisma.statusWebhook.findMany({ where: { active: true, leaseUntil: { lte: now } }, orderBy: { leaseUntil: "asc" }, take: 5 });
  for (const hook of hooks) {
    if (Date.now() - started > 12000) break;
    const claim = await prisma.statusWebhook.updateMany({ where: { id: hook.id, active: true, leaseUntil: { lte: now } }, data: { leaseUntil: new Date(now.getTime() + 300000) } });
    if (!claim.count) continue;
    try {
      await requireIntegrationOwner(hook.userId, hook.companyId);
      const invoices = await prisma.invoice.findMany({ where: { sellerCompanyId: hook.companyId, ...(hook.scanCursor ? { id: { gt: hook.scanCursor } } : {}) }, select: statusSelect, orderBy: { id: "asc" }, take: 50 });
      for (const invoice of invoices) {
        if (!invoice.ksefStatus || ["none", "draft"].includes(invoice.ksefStatus)) continue;
        const state = { invoiceId: invoice.id, companyId: hook.companyId, number: invoice.number, status: invoice.ksefStatus, ksefNumber: invoice.ksefNumber, referenceNumber: invoice.referenceNumber };
        const eventKey = tokenHash(`${hook.id}:${JSON.stringify(state)}`);
        await prisma.webhookDelivery.upsert({ where: { eventKey }, update: {}, create: { webhookId: hook.id, eventKey, nextAttemptAt: now, payload: JSON.stringify({ id: eventKey, type: "ksef.status", observedAt: now.toISOString(), data: state }) } });
        queued++;
      }
      await prisma.statusWebhook.update({ where: { id: hook.id }, data: { scanCursor: invoices.length === 50 ? invoices[49].id : null, leaseUntil: now } });
    } catch (error) {
      // Ownership loss disables delivery; a temporary database fault leaves the lease to expire.
      if ((error as { status?: number }).status === 403) await prisma.statusWebhook.update({ where: { id: hook.id }, data: { active: false } });
    }
  }
  await prisma.webhookDelivery.updateMany({ where: { status: "sending", leaseUntil: { lte: now }, attempts: { lt: 8 } }, data: { status: "pending" } });
  await prisma.webhookDelivery.updateMany({ where: { status: "sending", leaseUntil: { lte: now }, attempts: { gte: 8 } }, data: { status: "failed", lastError: "Przekroczony limit prób po przerwanym wysyłaniu." } });
  const deliveries = await prisma.webhookDelivery.findMany({ where: { status: "pending", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: 10 });
  for (const delivery of deliveries) {
    if (Date.now() - started > 12000) break;
    const claim = await prisma.webhookDelivery.updateMany({ where: { id: delivery.id, status: "pending" }, data: { status: "sending", attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 300000) } });
    if (!claim.count) continue;
    try {
      const hook = await prisma.statusWebhook.findUnique({ where: { id: delivery.webhookId } });
      if (!hook?.active) { await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "cancelled" } }); continue; }
      await requireIntegrationOwner(hook.userId, hook.companyId);
      const timestamp = String(Math.floor(Date.now() / 1000));
      await sendWebhook(hook.url, delivery.payload, { "X-Fakturo-Event": delivery.eventKey, "X-Fakturo-Timestamp": timestamp, "X-Fakturo-Signature": `sha256=${webhookSignature(openWebhook(hook.encryptedSecret, hook.companyId), timestamp, delivery.payload)}` });
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "delivered", lastError: null } }); sent++;
    } catch (error) {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: delivery.attempts >= 7 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(86400000, 60000 * 2 ** delivery.attempts)), lastError: (error instanceof Error ? error.message : "Błąd wysyłania").slice(0,300) } });
    }
  }
  return { observed: queued, sent };
}

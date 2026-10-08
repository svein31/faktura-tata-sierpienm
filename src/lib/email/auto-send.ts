import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { requireDocumentWrite } from "@/lib/document-scope";
import { companyProfileToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { ksefAcceptanceDateFromUpo } from "@/lib/pdf/ksef-acceptance-date";
import { buildEmailHtml } from "@/lib/email/invoice-template";
import { getEmailConfigStatus, sendEmail, type EmailAttachment } from "@/lib/email/sender";
import { requireVerifiedEmailForSending } from "@/lib/email/verification";
import { canStartQueueJob } from "@/lib/ksef/queue-budget";

export interface KsefAutoEmailConfig {
  userId: string;
  recipientEmail: string;
  cc?: string;
  bcc?: string;
  subject: string;
  messageBody: string;
  attachPdf: boolean;
  attachXml: boolean;
}

type AutoInvoice = Prisma.InvoiceGetPayload<{ include: { sellerCompany: true } }>;
const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const ambiguousMessage = "Nie można potwierdzić doręczenia automatycznego e-maila. Sprawdź historię u dostawcy poczty przed ręczną wysyłką. Faktura nie zostanie ponownie wysłana do KSeF.";

interface AutoEmailWorkerOptions { deadlineAtMs?: number; maintenanceOnly?: boolean; skipMaintenance?: boolean }
function checkDeadline(deadlineAtMs?: number) {
  if (deadlineAtMs !== undefined && deadlineAtMs <= Date.now()) throw new Error("Wykorzystano budżet czasu przygotowania automatycznego e-maila. Wiadomość oczekuje na kolejne uruchomienie workera.");
}
/** PDF generation may finish its harmless cache write after the worker stops waiting; it can never send mail. */
async function beforeDeadline<T>(work: Promise<T>, deadlineAtMs?: number): Promise<T> {
  if (deadlineAtMs === undefined) return work;
  checkDeadline(deadlineAtMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Przygotowanie załącznika przekroczyło budżet workera; e-mail nie został wysłany.")), Math.max(1, deadlineAtMs - Date.now()));
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Save the user's exact recipient, copy addresses and PDF/XML choices, before accepting the initial send. */
export async function configureKsefAutoEmail(invoiceId: string, config: KsefAutoEmailConfig | null) {
  const updated = await prisma.invoice.updateMany({
    where: { id: invoiceId, OR: [
      { autoKsefEmailStatus: null }, { autoKsefEmailStatus: { isSet: false } },
      { autoKsefEmailStatus: { in: ["queued", "retry", "failed", "cancelled", ...(config ? [] : ["preparing"])] } },
    ] },
    data: config ? {
      autoSendEmailOnKsef: true,
      autoKsefEmailConfig: config as unknown as Prisma.InputJsonValue,
      autoKsefEmailStatus: "queued", autoKsefEmailAttempts: 0,
      autoKsefEmailNextAttemptAt: null, autoKsefEmailLockedUntil: null,
      autoKsefEmailLeaseToken: null, autoKsefEmailLastError: null,
    } : {
      autoSendEmailOnKsef: false, autoKsefEmailStatus: "cancelled",
      autoKsefEmailNextAttemptAt: null, autoKsefEmailLockedUntil: null,
      autoKsefEmailLeaseToken: null, autoKsefEmailLastError: null,
    },
  });
  if (updated.count !== 1) throw new ApiError(409, "Automatyczny e-mail jest już wysyłany lub wymaga sprawdzenia wyniku. Sprawdź historię wysyłek.");
}

function hasRealUpo(invoice: Pick<AutoInvoice, "type" | "isProforma" | "ksefStatus" | "ksef" | "upoXml" | "ksefNumber">) {
  const meta = invoice.ksef as Record<string, unknown> | null;
  return invoice.type === "sale" && !invoice.isProforma && invoice.ksefStatus === "accepted"
    && (meta?.environment === "production" || meta?.environment === "test")
    && Boolean(ksefAcceptanceDateFromUpo(invoice.upoXml, invoice.ksefNumber));
}

function parseConfig(value: unknown): KsefAutoEmailConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as KsefAutoEmailConfig;
  return typeof c.userId === "string" && typeof c.recipientEmail === "string"
    && typeof c.subject === "string" && typeof c.messageBody === "string"
    && typeof c.attachPdf === "boolean" && typeof c.attachXml === "boolean" ? c : null;
}

async function savedConfig(invoice: AutoInvoice): Promise<KsefAutoEmailConfig | null> {
  const config = parseConfig(invoice.autoKsefEmailConfig);
  if (config) return config;
  // Existing opt-ins predate the outbox. Reuse the last chosen address, never silently switch to the contractor's email.
  const previous = await prisma.invoiceEmailLog.findFirst({ where: { invoiceId: invoice.id, status: { in: ["accepted", "sent", "delivered"] } }, orderBy: { sentAt: "desc" } });
  const recipientEmail = previous?.to || invoice.sentToEmail;
  if (!recipientEmail) return null;
  const attachments = Array.isArray(previous?.attachments) ? previous.attachments as Array<{ filename?: string }> : [];
  return {
    userId: previous?.userId || invoice.userId, recipientEmail,
    ...(previous?.cc ? { cc: previous.cc } : {}), ...(previous?.bcc ? { bcc: previous.bcc } : {}),
    subject: previous?.subject || `Faktura ${invoice.number}`,
    messageBody: previous?.messageBody || "Dzień dobry, przesyłamy fakturę przyjętą przez KSeF.",
    attachPdf: attachments.length ? attachments.some(a => a.filename?.endsWith(".pdf")) : true,
    attachXml: attachments.some(a => a.filename?.startsWith("Faktura_KSeF_")),
  };
}

async function notify(invoice: Pick<AutoInvoice, "id" | "number" | "userId">, message: string) {
  await prisma.notification.create({ data: {
    userId: invoice.userId, kind: "system", title: `Automatyczny e-mail: ${invoice.number}`,
    body: message, link: `/invoices/${invoice.id}`, read: false,
  } }).catch(() => undefined);
}

/** One durable, fenced attempt. This function never submits an invoice to KSeF. */
export async function triggerAutoEmailOnKsef(invoiceId: string, options: Pick<AutoEmailWorkerOptions, "deadlineAtMs"> = {}): Promise<boolean> {
  let invoice: AutoInvoice | null = null;
  let leaseToken = "";
  let sending = false;
  try {
    checkDeadline(options.deadlineAtMs);
    invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { sellerCompany: true } });
    if (!invoice?.autoSendEmailOnKsef || !hasRealUpo(invoice)) return false;
    const now = new Date();
    leaseToken = randomBytes(12).toString("hex");
    const claim = await prisma.invoice.updateMany({ where: {
      id: invoice.id, updatedAt: invoice.updatedAt, autoSendEmailOnKsef: true, AND: [
        { OR: [{ autoKsefEmailStatus: null }, { autoKsefEmailStatus: { isSet: false } }, { autoKsefEmailStatus: { in: ["queued", "retry"] } }, { autoKsefEmailStatus: "preparing", autoKsefEmailLockedUntil: { lt: now } }] },
        { OR: [{ autoKsefEmailNextAttemptAt: null }, { autoKsefEmailNextAttemptAt: { isSet: false } }, { autoKsefEmailNextAttemptAt: { lte: now } }] },
      ],
    }, data: {
      autoKsefEmailStatus: "preparing", autoKsefEmailLeaseToken: leaseToken,
      autoKsefEmailLockedUntil: new Date(now.getTime() + LEASE_MS),
      autoKsefEmailAttempts: (invoice.autoKsefEmailAttempts || 0) + 1,
    } });
    if (!claim.count) return false;
    const config = await savedConfig(invoice);
    if (!config) throw new Error("Brak zapisanego odbiorcy automatycznego e-maila. Ustaw odbiorcę w oknie wysyłki faktury.");
    const actor = await prisma.user.findUnique({ where: { id: config.userId }, select: { id: true, role: true, email: true } });
    if (!actor) throw new Error("Konto autora automatycznej wysyłki już nie istnieje.");
    await requireDocumentWrite(actor, { userId: invoice.userId, companyId: invoice.sellerCompanyId });
    await requireVerifiedEmailForSending(actor.id);
    const mailConfig = getEmailConfigStatus();
    if (!mailConfig.configured) throw new Error("Poczta nie jest skonfigurowana. Automatyczny e-mail oczekuje na konfigurację SMTP lub Resend.");
    const contractorRecord = await prisma.contractor.findUnique({ where: { id: invoice.contractorId } });
    const contractor = contractorRecord ? contractorToDto(contractorRecord) : undefined;
    const sellerRecord = invoice.sellerCompany || await prisma.companyProfile.findFirst({ where: { userId: invoice.userId, isDefault: true } });
    if (!sellerRecord) throw new Error("Brak profilu sprzedawcy do wysyłki faktury.");
    const seller = companyProfileToDto(sellerRecord);
    const invoiceData = invoiceToDto(invoice);
    const stem = invoice.number.replace(/[/\\?%*:|"<>]/g, "_");
    const attachments: EmailAttachment[] = [];
    checkDeadline(options.deadlineAtMs);
    if (config.attachPdf) {
      // Status reads without a PDF attachment never load pdf-lib/fontkit into a cold server instance.
      const preparedPdf = await beforeDeadline(import("@/lib/pdf/invoice-print").then(({ invoicePdf }) => invoicePdf(invoice!.id)), options.deadlineAtMs);
      attachments.push({ filename: `Faktura_${stem}.pdf`, content: preparedPdf.buffer, contentType: "application/pdf" });
    }
    if (config.attachXml) {
      if (!invoice.ksefXml) throw new Error("Brak oryginalnego XML wysłanego do KSeF. Wstrzymano e-mail, aby nie przesłać innego dokumentu.");
      attachments.push({ filename: `Faktura_KSeF_${stem}.xml`, content: Buffer.from(invoice.ksefXml, "utf8"), contentType: "application/xml" });
    }
    attachments.push({ filename: `UPO_KSeF_${stem}.xml`, content: Buffer.from(invoice.upoXml!, "utf8"), contentType: "application/xml" });
    const testEnvironment = (invoice.ksef as Record<string, unknown>).environment === "test";
    const environmentLabel = testEnvironment ? " (środowisko testowe MF; dokument nie jest fakturą produkcyjną KSeF)" : "";
    const messageBody = `${config.messageBody}\n\nPotwierdzenie przyjęcia przez KSeF${environmentLabel}: ${invoice.ksefNumber}.\nZałączniki: ${attachments.map(a => a.filename).join(", ")}.`;
    const subject = `${config.subject} — potwierdzenie KSeF`;
    const loggedMeta = attachments.map(a => ({ filename: a.filename, contentType: a.contentType!, size: Buffer.byteLength(a.content) }));
    const currentActor = await prisma.user.findUnique({ where: { id: config.userId }, select: { id: true, role: true } });
    if (!currentActor) throw new Error("Konto autora automatycznej wysyłki już nie istnieje.");
    await requireDocumentWrite(currentActor, { userId: invoice.userId, companyId: invoice.sellerCompanyId });
    // Persist "sending" and the log atomically before crossing the provider boundary.
    checkDeadline(options.deadlineAtMs);
    const started = await prisma.$transaction(async tx => {
      const current = await tx.invoice.findUnique({ where: { id: invoice!.id }, select: { emailDispatchVersion: true } });
      if (!current) return false;
      const manual = await tx.manualEmailDelivery.findFirst({ where: { invoiceId: invoice!.id, OR: [
        { status: { in: ["sending", "verify_needed"] } },
        { status: "preparing", leaseUntil: { gt: new Date() } },
      ] }, select: { id: true } });
      if (manual) throw new ApiError(409, "Ręczny e-mail tej faktury jest wysyłany lub wymaga sprawdzenia. Automatyczny e-mail oczekuje, aby uniknąć duplikatu.", "MANUAL_EMAIL_PENDING");
      // Both manual and automatic dispatch write this invoice version in their sending transaction.
      const changed = await tx.invoice.updateMany({ where: { id: invoice!.id, autoKsefEmailStatus: "preparing", autoKsefEmailLeaseToken: leaseToken, autoKsefEmailLockedUntil: { gt: new Date() }, autoSendEmailOnKsef: true }, data: { autoKsefEmailStatus: "sending", emailDispatchVersion: (current.emailDispatchVersion ?? 0) + 1, autoKsefEmailLockedUntil: new Date(Date.now() + LEASE_MS), autoKsefEmailConfig: config as unknown as Prisma.InputJsonValue } });
      if (!changed.count) return false;
      await tx.invoiceEmailLog.create({ data: {
        id: leaseToken, invoiceId: invoice!.id, userId: config.userId, to: config.recipientEmail,
        cc: config.cc || null, bcc: config.bcc || null, subject, messageBody,
        attachments: loggedMeta, status: "queued", provider: mailConfig.provider,
      } });
      return true;
    });
    if (!started) return false;
    sending = true;
    // No provider call has started yet: an exhausted budget here is a definite non-delivery.
    if (options.deadlineAtMs !== undefined && options.deadlineAtMs <= Date.now()) {
      throw Object.assign(new Error("Wykorzystano budżet workera przed wysyłką e-maila."), { deliveryUncertain: false });
    }
    const result = await sendEmail({
      to: config.recipientEmail, cc: config.cc, bcc: config.bcc,
      replyTo: seller.email || actor.email, subject, text: messageBody,
      html: buildEmailHtml(messageBody, invoiceData, seller, contractor), attachments,
      singleAttempt: true, idempotencyKey: `ksef-auto-${invoice.id}`,
      ...(options.deadlineAtMs === undefined ? {} : { signal: AbortSignal.timeout(Math.max(1, options.deadlineAtMs - Date.now())) }),
    });
    const sentAt = new Date();
    await prisma.$transaction(async tx => {
      const changed = await tx.invoice.updateMany({ where: { id: invoice!.id, autoKsefEmailLeaseToken: leaseToken, autoKsefEmailStatus: "sending" }, data: {
        autoKsefEmailStatus: "accepted", autoKsefEmailSentAt: sentAt,
        autoKsefEmailLockedUntil: null, autoKsefEmailNextAttemptAt: null, autoKsefEmailLastError: null,
        sentAt, sentToEmail: config.recipientEmail, emailStatus: "SENT",
      } });
      if (!changed.count) throw new Error("Wynik wysyłki wymaga sprawdzenia po utracie blokady.");
      await tx.invoiceEmailLog.update({ where: { id: leaseToken }, data: { status: "accepted", provider: result.provider, messageId: result.messageId || null, sentAt } });
    });
    await notify(invoice, `Serwer pocztowy przyjął wiadomość na ${config.recipientEmail} po pobraniu UPO. Załączniki: ${attachments.length}.`);
    return true;
  } catch (error) {
    if (!invoice || !leaseToken) return false;
    const uncertain = sending && (error as { deliveryUncertain?: boolean })?.deliveryUncertain !== false;
    const attempts = (invoice.autoKsefEmailAttempts || 0) + 1;
    const status = uncertain ? "verify_needed" : attempts >= MAX_ATTEMPTS || (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") ? "failed" : "retry";
    const message = uncertain ? ambiguousMessage : error instanceof Error ? error.message : "Nie udało się przygotować automatycznego e-maila.";
    try {
      const changed = await prisma.invoice.updateMany({ where: { id: invoice.id, autoKsefEmailLeaseToken: leaseToken, autoKsefEmailStatus: { in: ["preparing", "sending"] } }, data: {
        autoKsefEmailStatus: status, autoKsefEmailLockedUntil: null, autoKsefEmailLastError: message,
        autoKsefEmailNextAttemptAt: status === "retry" ? new Date(Date.now() + Math.min(30 * 2 ** Math.min(attempts, 6), 3600) * 1000) : null,
      } });
      if (changed.count && sending) await prisma.invoiceEmailLog.updateMany({ where: { id: leaseToken, status: "queued" }, data: { status: uncertain ? "verify_needed" : "failed", error: message } });
      if (changed.count && status !== "retry") await notify(invoice, message);
    } catch { /* A persisted sending lease will be recovered conservatively by the worker. */ }
    return false;
  }
}

/** Runs on the existing cron, including retries after KSeF is already complete. */
export async function processKsefAutoEmails(userId?: string, options: AutoEmailWorkerOptions = {}) {
  const now = new Date();
  if (!options.skipMaintenance) {
    const expired = await prisma.invoice.findMany({ where: {
      ...(userId ? { userId } : {}), autoKsefEmailStatus: "sending", autoKsefEmailLockedUntil: { lt: now },
    }, orderBy: { autoKsefEmailLockedUntil: "asc" }, take: 10 });
    for (const invoice of expired) {
      if (invoice.autoKsefEmailStatus !== "sending") continue;
      const changed = await prisma.invoice.updateMany({ where: { id: invoice.id, autoKsefEmailStatus: "sending", autoKsefEmailLeaseToken: invoice.autoKsefEmailLeaseToken, autoKsefEmailLockedUntil: { lt: now } }, data: { autoKsefEmailStatus: "verify_needed", autoKsefEmailLockedUntil: null, autoKsefEmailLastError: ambiguousMessage } });
      if (!changed.count) continue;
      if (invoice.autoKsefEmailLeaseToken) await prisma.invoiceEmailLog.updateMany({ where: { id: invoice.autoKsefEmailLeaseToken, status: "queued" }, data: { status: "verify_needed", error: ambiguousMessage } });
      await notify(invoice, ambiguousMessage);
    }
  }
  if (options.maintenanceOnly || (options.deadlineAtMs !== undefined && !canStartQueueJob(options.deadlineAtMs))) return { checked: 0, accepted: 0 };
  // MongoDB's Prisma JSON filter cannot filter a nested environment. Filter it before LIMIT,
  // so old demo documents cannot permanently hide genuine pending deliveries.
  const candidates = await prisma.invoice.findRaw({ filter: {
    ...(userId ? { userId: { $oid: userId } } : {}),
    autoSendEmailOnKsef: true, type: "sale", isProforma: { $ne: true }, ksefStatus: "accepted",
    "ksef.environment": { $in: ["production", "test"] },
    ksefNumber: { $type: "string", $ne: "" }, upoXml: { $type: "string", $ne: "" },
    $and: [
      { $or: [{ autoKsefEmailStatus: { $in: [null, "queued", "retry"] } }, { autoKsefEmailStatus: "preparing", autoKsefEmailLockedUntil: { $lt: { $date: now.toISOString() } } }] },
      { $or: [{ autoKsefEmailNextAttemptAt: null }, { autoKsefEmailNextAttemptAt: { $lte: { $date: now.toISOString() } } }] },
    ],
  }, options: { projection: { _id: 1 }, sort: { updatedAt: 1 }, limit: 3 } });
  const ids = (Array.isArray(candidates) ? candidates : []).map(row => (row as { _id: { $oid: string } })._id.$oid);
  const pending = ids.length ? await prisma.invoice.findMany({ where: { id: { in: ids } } }) : [];
  let accepted = 0;
  let checked = 0;
  for (const invoice of pending) {
    if (options.deadlineAtMs !== undefined && !canStartQueueJob(options.deadlineAtMs)) break;
    checked++;
    if (!hasRealUpo(invoice)) {
      const message = "Pobrane UPO nie potwierdza przyjęcia tej faktury. Sprawdź dokument w KSeF; automatyczny e-mail wstrzymano.";
      const changed = await prisma.invoice.updateMany({ where: { id: invoice.id, updatedAt: invoice.updatedAt }, data: { autoKsefEmailStatus: "failed", autoKsefEmailLastError: message } });
      if (changed.count) await notify(invoice, message);
      continue;
    }
    if (await triggerAutoEmailOnKsef(invoice.id, options)) accepted++;
  }
  return { checked, accepted };
}

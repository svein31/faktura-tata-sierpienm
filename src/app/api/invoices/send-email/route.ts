import { buildEmailHtml } from "@/lib/email/invoice-template";
import { configureKsefAutoEmail } from "@/lib/email/auto-send";
import { requireVerifiedEmailForSending } from "@/lib/email/verification";
import { claimManualEmail, startManualEmail, finishManualEmail, manualEmailDigest, recoverInterruptedManualEmails, resolveManualEmail, DELIVERY_UNCERTAIN_MESSAGE, type ManualDeliveryLease } from "@/lib/email/manual-delivery";
import { rateLimitSubject } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, readJson, str } from "@/lib/api";
import { accessibleCompanyIds } from "@/lib/company-scope";
import { requireDocumentWrite } from "@/lib/document-scope";
import { companyProfileToDto, companyToDto, contractorToDto, emailLogToDto, invoiceToDto } from "@/lib/dto";
import {
  getEmailConfigStatus,
  isValidEmail,
  parseEmailList,
  sendEmail,
  type EmailAttachment,
} from "@/lib/email/sender";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/invoices/send-email
 * Zwraca status konfiguracji serwera pocztowego dla interfejsu użytkownika.
 */
export async function GET() {
  if (!await getSessionUser()) return NextResponse.json({ error: "UNAUTHORIZED", message: "Musisz być zalogowany." }, { status: 401 });
  const config = getEmailConfigStatus();
  return NextResponse.json({
    configured: config.configured,
    provider: config.provider,
    from: config.from,
    smtpHost: config.host || null,
  });
}

/**
 * Generuje treść HTML dla wiadomości e-mail z fakturą.
 */

/**
 * POST /api/invoices/send-email
 *
 * Wysyłka faktury e-mailem do odbiorcy:
 * - Generowanie załącznika PDF faktury w locie (czysty Buffer z poprawnymi kodami QR i statusem)
 * - Opcjonalne dołączenie XML KSeF FA(3)
 * - Opcjonalne dołączenie UPO XML (jeśli faktura została przyjęta w KSeF)
 * - Obsługa SMTP (np. CyberFolks) oraz Resend API
 * - Ścisłe logowanie w bazie: sentAt, sentToEmail, emailStatus oraz InvoiceEmailLog
 * - Zabezpieczenie przed podwójnym kliknięciem i rate-limiting
 * - ZGODNIE Z WYMOGIEM: brak konfiguracji poczty zwraca konkretny błąd i instrukcję (brak fałszywego sukcesu).
 */
export async function POST(req: Request) {
  let deliveryLease: ManualDeliveryLease | undefined;
  let providerAttempted = false;
  let deliveryCompleted = false;
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Musisz być zalogowany, aby wysyłać faktury e-mailem." },
        { status: 401 }
      );
    }

    const body = await readJson(req);

    if (body.action === "resolve-manual-delivery") {
      const invoiceId = str(body.invoiceId), deliveryId = str(body.deliveryId);
      assertObjectId(invoiceId); assertObjectId(deliveryId);
      if (body.providerChecked !== true || !["accepted", "not-sent"].includes(str(body.result)))
        throw new ApiError(400, "Najpierw sprawdź wynik u dostawcy poczty i potwierdź sprawdzenie.", "PROVIDER_CHECK_REQUIRED");
      const companies = await accessibleCompanyIds(user.id);
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] }] }, select: { id: true, userId: true, sellerCompanyId: true } });
      if (!invoice) throw new ApiError(404, "Faktura nie istnieje lub nie masz do niej uprawnień.");
      await requireDocumentWrite(user, { userId: invoice.userId, companyId: invoice.sellerCompanyId });
      await recoverInterruptedManualEmails(user.id, invoice.id);
      const result = await resolveManualEmail({ deliveryId, invoiceId, userId: user.id, companyId: invoice.sellerCompanyId, result: body.result as "accepted" | "not-sent" });
      return NextResponse.json({ ...result, resolved: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "cancel-auto-ksef") {
      const id = str(body.invoiceId);
      assertObjectId(id);
      const companies = await accessibleCompanyIds(user.id);
      const invoice = await prisma.invoice.findFirst({ where: {
        id, OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] }],
      } });
      if (!invoice) throw new ApiError(404, "Faktura nie istnieje lub nie masz do niej uprawnień.");
      await requireDocumentWrite(user, { userId: invoice.userId, companyId: invoice.sellerCompanyId });
      await configureKsefAutoEmail(invoice.id, null);
      return NextResponse.json({ success: true, autoKsefEmailStatus: "cancelled", message: "Automatyczny e-mail po KSeF został wyłączony." });
    }

    await requireVerifiedEmailForSending(user.id);

    // ── Walidacja e-mail odbiorcy ──
    const recipientEmail = str(body.recipientEmail)?.trim();
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return NextResponse.json(
        {
          error: "INVALID_EMAIL",
          message: `Podaj poprawny adres e-mail odbiorcy (${recipientEmail || "brak"}).`,
        },
        { status: 400 }
      );
    }

    // Walidacja DW (Cc) i UDW (Bcc)
    const cc = str(body.cc)?.trim() || undefined;
    const bcc = str(body.bcc)?.trim() || undefined;
    if (cc) {
      const ccList = parseEmailList(cc);
      for (const c of ccList) {
        if (!isValidEmail(c)) {
          return NextResponse.json(
            { error: "INVALID_CC_EMAIL", message: `Nieprawidłowy format adresu DW (Cc): ${c}` },
            { status: 400 }
          );
        }
      }
    }
    if (bcc) {
      const bccList = parseEmailList(bcc);
      for (const b of bccList) {
        if (!isValidEmail(b)) {
          return NextResponse.json(
            { error: "INVALID_BCC_EMAIL", message: `Nieprawidłowy format adresu UDW (Bcc): ${b}` },
            { status: 400 }
          );
        }
      }
    }

    const subject = str(body.subject)?.trim() || "Faktura VAT";
    const messageBody = str(body.messageBody)?.trim() || "Szanowni Państwo, w załączniku przesyłamy fakturę.";
    const attachPdf = body.attachPdf !== false;
    const attachXml = Boolean(body.attachXml);
    const attachUpo = Boolean(body.attachUpo);
    const autoSendOnKsef = Boolean(body.autoSendOnKsef);

    const invoiceId = str(body.invoiceId);
    let invoiceRecord: any = null;
    let invoiceData: Invoice | null = null;
    let sellerProfile: CompanyProfile | null = null;
    let buyerContractor: Contractor | undefined = undefined;

    if (invoiceId) {
      assertObjectId(invoiceId);
      const companies = await accessibleCompanyIds(user.id);
      invoiceRecord = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          OR: [{ sellerCompanyId: { in: companies } }, { userId: user.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] }],
        },
        include: {
          sellerCompany: true,
        },
      });

      if (!invoiceRecord) {
        return NextResponse.json(
          {
            error: "NOT_FOUND",
            message: "Faktura nie istnieje lub nie masz do niej uprawnień.",
          },
          { status: 404 }
        );
      }
      await requireDocumentWrite(user, { userId: invoiceRecord.userId, companyId: invoiceRecord.sellerCompanyId });
      if (invoiceRecord.isOffline && (!invoiceRecord.qrCodeI || !invoiceRecord.qrCodeII))
        return NextResponse.json({ error: "OFFLINE_NOT_ISSUED", message: "Faktura offline wymaga podpisanych kodów I i II przed wysłaniem." }, { status: 409 });

      invoiceData = invoiceToDto(invoiceRecord);

      // Pobranie profilu sprzedawcy
      if (invoiceRecord.sellerCompany) {
        sellerProfile = companyProfileToDto(invoiceRecord.sellerCompany);
      } else {
        const comp =
          (await prisma.companyProfile.findFirst({
            where: { userId: user.id, isDefault: true },
          })) ||
          (await prisma.companyProfile.findFirst({
            where: { userId: user.id },
          }));

        if (comp) {
          sellerProfile = companyProfileToDto(comp);
        } else {
          const legacy = await prisma.companySettings.findUnique({
            where: { userId: user.id },
          });
          sellerProfile = legacy ? companyToDto(legacy) : null;
        }
      }

      // Pobranie kontrahenta
      if (invoiceRecord.contractorId) {
        const c = await prisma.contractor.findFirst({
          where: { id: invoiceRecord.contractorId },
        });
        if (c) {
          buyerContractor = contractorToDto(c);
        }
      }
    }

    if (!invoiceData && body.invoice) {
      invoiceData = body.invoice as Invoice;
      sellerProfile = (body.sellerCompany as CompanyProfile) || null;
      buyerContractor = (body.contractor as Contractor) || undefined;
    }

    if (!invoiceData) {
      return NextResponse.json(
        {
          error: "NO_INVOICE_DATA",
          message: "Brak danych faktury do wysyłki.",
        },
        { status: 404 }
      );
    }
    if (invoiceData.isOffline && (!invoiceRecord || !invoiceRecord.qrCodeI || !invoiceRecord.qrCodeII))
      return NextResponse.json({ error: "OFFLINE_NOT_ISSUED", message: "Najpierw wystaw fakturę offline z podpisanym Kodem II." }, { status: 409 });

    const effectiveSeller: CompanyProfile = sellerProfile || {
      id: "default",
      userId: user.id,
      nip: "",
      companyName: user.companyName || user.name || "Moja Firma",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // ── 1. Sprawdzenie konfiguracji poczty (Brak fałszywego sukcesu!) ──
    const mailConfig = getEmailConfigStatus();
    if (!mailConfig.configured) {
      return NextResponse.json(
        {
          error: "EMAIL_NOT_CONFIGURED",
          message: "Serwer pocztowy e-mail nie został jeszcze skonfigurowany.",
          details:
            "Aby wysyłać faktury e-mailem, dodaj zmienne środowiskowe w panelu Netlify (Site configuration → Environment variables) lub w pliku .env (Resend API lub SMTP CyberFolks).",
          setupInstructions: {
            netlify_resend: {
              title: "Opcja 1: Resend API (Zalecane dla Netlify / Serverless)",
              steps: [
                "1. Załóż darmowe konto na https://resend.com i wygeneruj klucz API (3000 maili/m-c za darmo).",
                "2. W Netlify (Site configuration → Environment variables) dodaj zmienne: RESEND_API_KEY oraz EMAIL_FROM.",
                "3. W Netlify przejdź do Deploys → Trigger deploy, aby załadować nowe zmienne.",
              ],
            },
            netlify_smtp: {
              title: "Opcja 2: SMTP CyberFolks na Netlify",
              steps: [
                "1. Utwórz skrzynkę w cPanelu CyberFolks (np. faktury@twojadomena.pl).",
                "2. W Netlify (Environment variables) dodaj: SMTP_HOST (mail.twojadomena.pl), SMTP_PORT (465), SMTP_SECURE (true), SMTP_USER, SMTP_PASS, EMAIL_FROM.",
                "3. Uwaga: Na Netlify używaj portu 465 (SSL) lub 587 (TLS). Port 25 jest zablokowany przez chmurę.",
                "4. Kliknij Deploys → Trigger deploy w Netlify.",
              ],
            },
          },
        },
        { status: 422 }
      );
    }

    const recipientCount = 1 + parseEmailList(cc).length + parseEmailList(bcc).length;
    if (recipientCount > 20) throw new ApiError(400, "Jedna wiadomość może mieć maksymalnie 20 odbiorców.", "TOO_MANY_RECIPIENTS");
    if (subject.length > 250 || messageBody.length > 20_000) throw new ApiError(400, "Skróć temat lub treść wiadomości.", "EMAIL_CONTENT_TOO_LONG");
    const requestHash = manualEmailDigest({ invoice: invoiceRecord ? {
      id: invoiceRecord.id, number: invoiceData.number, issueDate: invoiceData.issueDate, lines: invoiceData.lines,
      ksefNumber: invoiceRecord.ksefNumber, ksefXml: attachXml ? invoiceRecord.ksefXml : null, upoXml: attachUpo ? invoiceRecord.upoXml : null,
    } : invoiceData, recipientEmail: recipientEmail.toLowerCase(), cc, bcc, subject, messageBody, attachPdf, attachXml, attachUpo, autoSendOnKsef });
    const targetHash = manualEmailDigest({ invoice: invoiceRecord?.id ?? invoiceData.number });
    const suppliedKey = str(body.idempotencyKey).trim();
    if (suppliedKey.length > 200) throw new ApiError(400, "Nieprawidłowy klucz wysyłki.", "INVALID_IDEMPOTENCY_KEY");
    // Older clients without a key get a stable request key; the current modal creates an explicit key per intended send.
    deliveryLease = await claimManualEmail({ userId: user.id, invoiceId: invoiceRecord?.id, requestHash, targetHash, key: suppliedKey || `legacy-${requestHash}` });
    if (deliveryLease.replay) return NextResponse.json(deliveryLease.replay, { headers: { "Cache-Control": "no-store" } });
    const minuteLimit = await rateLimitSubject(user.id, { max: 30, windowMs: 60_000 }, "invoice-email-minute");
    const dailyLimit = await rateLimitSubject(user.id, { max: 200, windowMs: 24 * 60 * 60_000 }, "invoice-email-day");
    if (!minuteLimit.allowed || !dailyLimit.allowed) throw new ApiError(429, "Przekroczono limit wysyłek e-mail (30 na minutę lub 200 na dobę). Spróbuj ponownie później.", "RATE_LIMIT_EXCEEDED");

    // ── 2. Przygotowanie załączników w pamięci RAM ──
    const attachments: EmailAttachment[] = [];
    const loggedAttachmentsMeta: Array<{ filename: string; size: number; contentType: string }> = [];
    const safeDocNumber = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    // A. Załącznik PDF faktury (domyślny)
    if (attachPdf) {
      try {
        const pdfBuffer = invoiceRecord
          ? (await (await import("@/lib/pdf/invoice-print")).invoicePdf(invoiceRecord.id)).buffer
          : await (await import("@/lib/pdf/generate-invoice-pdf")).generateInvoicePdfBuffer(invoiceData, buyerContractor, effectiveSeller);
        const filename = `Faktura_${safeDocNumber}.pdf`;
        attachments.push({
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        });
        loggedAttachmentsMeta.push({
          filename,
          size: pdfBuffer.length,
          contentType: "application/pdf",
        });
      } catch (pdfError: any) {
        console.error("EMAIL_SEND_ERROR [PDF generation]:", pdfError);
        throw new Error(`Błąd generowania pliku PDF faktury: ${pdfError.message || pdfError}`);
      }
    }

    // B. Załącznik XML KSeF FA(3)
    if (attachXml) {
      try {
        let xmlString = invoiceRecord?.ksefXml || "";
        if (!xmlString && invoiceRecord?.ksefNumber) throw new ApiError(409, "Brak oryginalnego XML wysłanego do KSeF. Pobierz oryginał w KSeF przed wysłaniem e-mailem.");
        if (!xmlString) {
          const { buildFa3Xml } = await import("@/lib/ksef/xmlBuilder");
          xmlString = buildFa3Xml({
            invoice: invoiceData,
            seller: effectiveSeller,
            buyer: buyerContractor,
          });
        }
        const xmlBuffer = Buffer.from(xmlString, "utf-8");
        const filename = `Faktura_KSeF_${safeDocNumber}.xml`;
        attachments.push({
          filename,
          content: xmlBuffer,
          contentType: "application/xml",
        });
        loggedAttachmentsMeta.push({
          filename,
          size: xmlBuffer.length,
          contentType: "application/xml",
        });
      } catch (xmlError: any) {
        if (xmlError instanceof ApiError) throw xmlError;
        console.error("EMAIL_SEND_ERROR [XML generation]:", xmlError);
        throw new Error(`Błąd generowania pliku XML KSeF: ${xmlError.message || xmlError}`);
      }
    }

    // C. Załącznik UPO XML (jeśli pobrano z KSeF)
    if (attachUpo && !invoiceRecord?.upoXml) throw new ApiError(409, "Wybrane UPO nie jest jeszcze dostępne. Sprawdź status KSeF przed wysyłką.");
    if (attachUpo && invoiceRecord?.upoXml) {
      const upoBuffer = Buffer.from(invoiceRecord.upoXml, "utf-8");
      const filename = `UPO_KSeF_${safeDocNumber}.xml`;
      attachments.push({
        filename,
        content: upoBuffer,
        contentType: "application/xml",
      });
      loggedAttachmentsMeta.push({
        filename,
        size: upoBuffer.length,
        contentType: "application/xml",
      });
    }

    // ── 3. Treść HTML i Reply-To ──
    const htmlContent = buildEmailHtml(messageBody, invoiceData, effectiveSeller, buyerContractor);
    const replyTo = effectiveSeller.email || user.email;

    if (autoSendOnKsef && (!invoiceRecord || invoiceRecord.type !== "sale" || invoiceRecord.isProforma))
      throw new ApiError(400, "Automatyczny e-mail po KSeF dotyczy zapisanej faktury sprzedaży, z wyłączeniem proform.");
    if (invoiceRecord && (!invoiceRecord.ksefNumber || !autoSendOnKsef) && typeof body.autoSendOnKsef === "boolean") {
      await configureKsefAutoEmail(invoiceRecord.id, autoSendOnKsef ? {
        userId: user.id, recipientEmail, ...(cc ? { cc } : {}), ...(bcc ? { bcc } : {}),
        subject, messageBody, attachPdf, attachXml,
      } : null);
    }

    // Persist the sending fence and history before contacting the provider.
    await startManualEmail(deliveryLease, { to: recipientEmail, cc, bcc, subject, messageBody, provider: mailConfig.provider, attachments: loggedAttachmentsMeta });
    providerAttempted = true;
    const emailResult = await sendEmail({
      to: recipientEmail, cc, bcc, replyTo, subject, text: messageBody, html: htmlContent, attachments,
      singleAttempt: true, idempotencyKey: `manual-email-${deliveryLease.id}`, signal: AbortSignal.timeout(15_000),
    });
    if (!emailResult.success) throw new Error("Serwer pocztowy nie potwierdził przyjęcia wiadomości.");
    const now = new Date();
    const resultPayload = {
      success: true, message: `Serwer pocztowy przyjął fakturę dla adresu ${recipientEmail}`,
      provider: emailResult.provider, messageId: emailResult.messageId ?? null,
      sentAt: now.toISOString(), sentToEmail: recipientEmail, attachmentCount: attachments.length,
    };
    await finishManualEmail(deliveryLease, { status: "accepted", provider: emailResult.provider, messageId: emailResult.messageId, sentToEmail: recipientEmail, response: resultPayload });
    deliveryCompleted = true;
    const emailLogRecord = invoiceRecord ? await prisma.invoiceEmailLog.findUnique({ where: { id: deliveryLease.id }, include: { user: { select: { name: true, email: true } } } }).catch(() => null) : null;
    if (invoiceRecord) await prisma.notification.create({ data: {
      userId: user.id, kind: "system", title: `Faktura ${invoiceData.number} przyjęta przez serwer pocztowy`,
      body: `Odbiorca: ${recipientEmail} (${attachments.length} zał.)`, link: `/invoices/${invoiceRecord.id}`, read: false,
    } }).catch(() => undefined);

    return NextResponse.json({ ...resultPayload, log: emailLogRecord ? emailLogToDto(emailLogRecord) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const uncertain = providerAttempted && !deliveryCompleted && error.deliveryUncertain !== false;
    const errorMessage = uncertain ? DELIVERY_UNCERTAIN_MESSAGE : error instanceof Error ? error.message : "Nie udało się przygotować wiadomości.";
    if (deliveryLease && !deliveryLease.replay && !deliveryCompleted) {
      await finishManualEmail(deliveryLease, { status: uncertain ? "verify_needed" : "failed", error: errorMessage }).catch(() => undefined);
    }
    // Provider exceptions can contain credentials or complete invoice bodies; never dump them into logs.
    console.error("EMAIL_SEND_ERROR:", uncertain ? "EMAIL_DELIVERY_UNCERTAIN" : error.code || error.name || "EMAIL_SEND_FAILED");
    const statusCode = uncertain ? 409 : error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: uncertain ? "EMAIL_DELIVERY_UNCERTAIN" : error.code || "EMAIL_SEND_FAILED", details: errorMessage, message: errorMessage }, { status: statusCode, headers: { "Cache-Control": "no-store" } });
  }
}

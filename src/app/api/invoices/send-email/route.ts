import { buildEmailHtml } from "@/lib/email/invoice-template";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, readJson, str } from "@/lib/api";
import { companyProfileToDto, companyToDto, contractorToDto, emailLogToDto, invoiceToDto } from "@/lib/dto";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";
import { invoicePdf } from "@/lib/pdf/invoice-print";
import {
  getEmailConfigStatus,
  isValidEmail,
  parseEmailList,
  sendEmail,
  type EmailAttachment,
} from "@/lib/email/sender";
import { buildFa3Xml } from "@/lib/ksef/index";
import { formatMoney, invoiceTotals, vatRateLabel } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice, VatRate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Prosty limiter pamięciowy chroniący przed spamem i pętlami (max 30 wysyłek / min na usera)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Zabezpieczenie przed podwójnym kliknięciem (idempotency key lock)
const inFlightRequests = new Set<string>();

/**
 * GET /api/invoices/send-email
 * Zwraca status konfiguracji serwera pocztowego dla interfejsu użytkownika.
 */
export async function GET() {
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
  let inFlightKey = "";
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Musisz być zalogowany, aby wysyłać faktury e-mailem." },
        { status: 401 }
      );
    }

    // Rate limiting: ochrona przed spamem / pętlami
    if (!checkRateLimit(`user_${user.id}`, 30)) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Przekroczono limit wysyłek wiadomości e-mail (maks. 30 na minutę). Spróbuj ponownie za chwilę.",
        },
        { status: 429 }
      );
    }

    const body = await readJson(req);

    // Idempotency / Double-click protection
    const idempotencyKey = str(body.idempotencyKey)?.trim();
    if (idempotencyKey) {
      inFlightKey = `${user.id}_${idempotencyKey}`;
      if (inFlightRequests.has(inFlightKey)) {
        return NextResponse.json(
          {
            error: "DUPLICATE_REQUEST",
            message: "Ta wysyłka jest już w trakcie realizacji. Proszę czekać.",
          },
          { status: 409 }
        );
      }
      inFlightRequests.add(inFlightKey);
    }

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
      invoiceRecord = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          userId: user.id, // Izolacja kont: użytkownik może wysłać tylko własną fakturę
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
          where: { id: invoiceRecord.contractorId, userId: user.id },
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

    // ── 2. Przygotowanie załączników w pamięci RAM ──
    const attachments: EmailAttachment[] = [];
    const loggedAttachmentsMeta: Array<{ filename: string; size: number; contentType: string }> = [];
    const safeDocNumber = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    // A. Załącznik PDF faktury (domyślny)
    if (attachPdf) {
      try {
        const pdfBuffer = invoiceRecord ? (await invoicePdf(invoiceRecord.id)).buffer : await generateInvoicePdfBuffer(invoiceData, buyerContractor, effectiveSeller);
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
        if (!xmlString) {
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
        console.error("EMAIL_SEND_ERROR [XML generation]:", xmlError);
        throw new Error(`Błąd generowania pliku XML KSeF: ${xmlError.message || xmlError}`);
      }
    }

    // C. Załącznik UPO XML (jeśli pobrano z KSeF)
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

    // ── 4. Wysyłka wiadomości ──
    let emailResult;
    try {
      emailResult = await sendEmail({
        to: recipientEmail,
        cc,
        bcc,
        replyTo,
        subject,
        text: messageBody,
        html: htmlContent,
        attachments,
      });
    } catch (sendErr: any) {
      // Rejestracja błędu w historii
      if (invoiceRecord) {
        await prisma.invoiceEmailLog.create({
          data: {
            invoiceId: invoiceRecord.id,
            userId: user.id,
            to: recipientEmail,
            cc: cc || null,
            bcc: bcc || null,
            subject,
            messageBody,
            attachments: loggedAttachmentsMeta,
            status: "failed",
            provider: mailConfig.provider,
            error: sendErr.message || String(sendErr),
          },
        }).catch((e) => console.error("Failed to log failed email:", e));
      }
      throw sendErr;
    }

    const now = new Date();

    // ── 5. Rejestracja w bazie danych ──
    let emailLogRecord: any = null;
    if (invoiceRecord) {
      try {
        emailLogRecord = await prisma.invoiceEmailLog.create({
          data: {
            invoiceId: invoiceRecord.id,
            userId: user.id,
            to: recipientEmail,
            cc: cc || null,
            bcc: bcc || null,
            subject,
            messageBody,
            attachments: loggedAttachmentsMeta,
            status: "accepted", // przyjęto przez serwer pocztowy
            provider: emailResult.provider,
            messageId: emailResult.messageId || null,
            sentAt: now,
          },
          include: {
            user: { select: { name: true, email: true } },
          },
        });

        await prisma.invoice.update({
          where: { id: invoiceRecord.id },
          data: {
            sentAt: now,
            sentToEmail: recipientEmail,
            emailStatus: "SENT",
            autoSendEmailOnKsef: autoSendOnKsef ? true : invoiceRecord.autoSendEmailOnKsef,
            status: invoiceRecord.status === "draft" ? "sent" : invoiceRecord.status,
          },
        });

        await prisma.notification.create({
          data: {
            userId: user.id,
            kind: "system",
            title: `Faktura ${invoiceData.number} wysłana e-mailem`,
            body: `Wysłano na adres: ${recipientEmail} (${attachments.length} zał.)`,
            link: `/invoices/${invoiceRecord.id}`,
            read: false,
          },
        });
      } catch (dbUpdateErr) {
        console.error("EMAIL_SEND_ERROR [DB update]:", dbUpdateErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Faktura została pomyślnie wysłana na adres ${recipientEmail}`,
      provider: emailResult.provider,
      messageId: emailResult.messageId,
      sentAt: now.toISOString(),
      sentToEmail: recipientEmail,
      attachmentCount: attachments.length,
      log: emailLogRecord ? emailLogToDto(emailLogRecord) : null,
    });
  } catch (error: any) {
    console.error("EMAIL_SEND_ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : String(error || "Nieznany błąd serwera");
    const statusCode =
      error.code === "EMAIL_NOT_CONFIGURED" ? 422 : error instanceof ApiError ? error.status : 500;

    return NextResponse.json(
      {
        error: error.code || "EMAIL_SEND_FAILED",
        details: errorMessage,
        message: errorMessage,
      },
      { status: statusCode }
    );
  } finally {
    if (inFlightKey) {
      inFlightRequests.delete(inFlightKey);
    }
  }
}

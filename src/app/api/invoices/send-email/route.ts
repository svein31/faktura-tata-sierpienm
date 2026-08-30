import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { companyProfileToDto, companyToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";
import { isValidEmail, sendEmail, type EmailAttachment } from "@/lib/email/sender";
import { buildFa3Xml } from "@/lib/ksef/index";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Generuje sformatowaną treść HTML dla wiadomości e-mail z fakturą.
 */
function buildEmailHtml(messageBody: string, invoice: Invoice, sellerCompany: CompanyProfile): string {
  const safeMessage = messageBody.replace(/\n/g, "<br/>");
  const compName = sellerCompany.companyName || sellerCompany.name || "Wystawca";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background-color: #f9fafb; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 700; color: #111827; margin: 0; }
    .subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .content { font-size: 14.5px; line-height: 1.6; color: #374151; margin-bottom: 24px; white-space: normal; }
    .invoice-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
    .invoice-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .invoice-row:last-child { margin-bottom: 0; }
    .label { color: #64748b; }
    .value { font-weight: 600; color: #0f172a; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">Faktura ${invoice.number}</h1>
      <div class="subtitle">Wystawca: ${compName}</div>
    </div>
    
    <div class="content">
      ${safeMessage}
    </div>

    <div class="invoice-card">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Numer dokumentu:</td>
          <td style="font-weight: 600; text-align: right; color: #0f172a; padding: 4px 0;">${invoice.number}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Data wystawienia:</td>
          <td style="font-weight: 600; text-align: right; color: #0f172a; padding: 4px 0;">${invoice.issueDate}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Termin płatności:</td>
          <td style="font-weight: 600; text-align: right; color: #0f172a; padding: 4px 0;">${invoice.dueDate}</td>
        </tr>
        ${
          invoice.ksef?.number
            ? `
        <tr>
          <td style="color: #10b981; padding: 4px 0;">Numer KSeF:</td>
          <td style="font-weight: 600; text-align: right; color: #10b981; padding: 4px 0;">${invoice.ksef.number}</td>
        </tr>`
            : ""
        }
      </table>
    </div>

    <div class="footer">
      Wiadomość wygenerowana automatycznie przez system Fakturo. Dokument PDF znajduje się w załączniku.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * POST /api/invoices/send-email
 *
 * Wysyłka faktury e-mailem do odbiorcy:
 * - Generowanie załącznika PDF faktury w locie
 * - Opcjonalne dołączenie XML KSeF / UPO
 * - Wysyłka przez Resend / SMTP
 * - Rejestracja w bazie: sentAt, sentToEmail, emailStatus
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    const recipientEmail = str(body.recipientEmail)?.trim();
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      throw new ApiError(400, `Podaj poprawny adres e-mail odbiorcy (${recipientEmail || "brak"}).`);
    }

    const subject = str(body.subject)?.trim() || "Faktura VAT";
    const messageBody = str(body.messageBody)?.trim() || "Szanowni Państwo, w załączniku przesyłamy fakturę.";
    const attachPdf = body.attachPdf !== false;
    const attachXml = Boolean(body.attachXml);

    const invoiceId = str(body.invoiceId);
    let invoiceRecord: any = null;
    let invoiceData: Invoice | null = null;
    let sellerProfile: CompanyProfile | null = null;
    let buyerContractor: Contractor | undefined = undefined;

    if (invoiceId) {
      invoiceRecord = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          ...(user ? { userId: user.id } : {}),
        },
        include: {
          sellerCompany: true,
        },
      });

      if (!invoiceRecord) {
        throw new ApiError(404, "Nie znaleziono wskazanej faktury w bazie danych.");
      }

      invoiceData = invoiceToDto(invoiceRecord);

      // Pobranie profilu sprzedawcy
      if (invoiceRecord.sellerCompany) {
        sellerProfile = companyProfileToDto(invoiceRecord.sellerCompany);
      } else {
        const comp = await prisma.companyProfile.findFirst({
          where: { userId: invoiceRecord.userId, isDefault: true },
        }) || await prisma.companyProfile.findFirst({
          where: { userId: invoiceRecord.userId },
        });

        if (comp) {
          sellerProfile = companyProfileToDto(comp);
        } else {
          const legacy = await prisma.companySettings.findUnique({
            where: { userId: invoiceRecord.userId },
          });
          sellerProfile = legacy ? companyToDto(legacy) : null;
        }
      }

      // Pobranie kontrahenta
      if (invoiceRecord.contractorId) {
        const c = await prisma.contractor.findUnique({
          where: { id: invoiceRecord.contractorId },
        });
        if (c) {
          buyerContractor = contractorToDto(c);
        }
      }
    } else if (body.invoice) {
      // Bezpośrednie dane faktury (np. z generatora przed zapisem)
      invoiceData = body.invoice as Invoice;
      sellerProfile = (body.sellerCompany as CompanyProfile) || null;
      buyerContractor = (body.contractor as Contractor) || undefined;
    }

    if (!invoiceData) {
      throw new ApiError(400, "Brak danych faktury do wysyłki (wymagane invoiceId lub invoice).");
    }

    const effectiveSeller: CompanyProfile = sellerProfile || {
      id: "default",
      userId: user?.id || "demo",
      nip: "",
      companyName: "Moja Firma",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // ── 1. Przygotowanie załączników ──
    const attachments: EmailAttachment[] = [];
    const safeFilename = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    if (attachPdf) {
      const pdfBuffer = await generateInvoicePdfBuffer(invoiceData, buyerContractor, effectiveSeller);
      attachments.push({
        filename: `Faktura_${safeFilename}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    if (attachXml) {
      try {
        let xmlStr = invoiceRecord?.upoXml || "";
        if (!xmlStr) {
          xmlStr = buildFa3Xml({ invoice: invoiceData, seller: effectiveSeller, buyer: buyerContractor });
        }
        attachments.push({
          filename: `Faktura_${safeFilename}_KSeF.xml`,
          content: xmlStr,
          contentType: "application/xml",
        });
      } catch (err) {
        console.warn("[Email API] Nie udało się wygenerować załącznika XML KSeF:", err);
      }
    }

    // ── 2. Wysyłka wiadomości e-mail ──
    const htmlContent = buildEmailHtml(messageBody, invoiceData, effectiveSeller);
    const emailResult = await sendEmail({
      to: recipientEmail,
      subject,
      text: messageBody,
      html: htmlContent,
      attachments,
    });

    const now = new Date();

    // ── 3. Rejestracja w bazie danych ──
    if (invoiceRecord) {
      await prisma.invoice.update({
        where: { id: invoiceRecord.id },
        data: {
          sentAt: now,
          sentToEmail: recipientEmail,
          emailStatus: "SENT",
          status: invoiceRecord.status === "draft" ? "sent" : invoiceRecord.status,
        },
      });

      if (user) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            kind: "system",
            title: `Faktura ${invoiceData.number} wysłana e-mailem`,
            body: `Wysłano na adres: ${recipientEmail}`,
            link: `/invoices/${invoiceRecord.id}`,
            read: false,
          },
        });
      }
    }

    return json({
      success: true,
      message: `Faktura została pomyślnie wysłana na adres ${recipientEmail}`,
      provider: emailResult.provider,
      sentAt: now.toISOString(),
      sentToEmail: recipientEmail,
      emailStatus: "SENT",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

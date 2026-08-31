import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, readJson, str } from "@/lib/api";
import { companyProfileToDto, companyToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";
import { isValidEmail, sendEmail, type EmailAttachment } from "@/lib/email/sender";
import { buildFa3Xml } from "@/lib/ksef/index";
import { formatMoney, invoiceTotals, vatRateLabel } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice, VatRate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sprawdza, czy skonfigurowany jest serwer pocztowy (Resend lub SMTP).
 */
function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
    process.env.SMTP_HOST?.trim()
  );
}

/**
 * Generuje treść HTML dla wiadomości e-mail z fakturą.
 */
function buildEmailHtml(
  messageBody: string,
  invoice: Invoice,
  sellerCompany: CompanyProfile,
  buyerContractor?: Contractor
): string {
  const safeMessage = messageBody.replace(/\n/g, "<br/>");
  const compName = sellerCompany.companyName || sellerCompany.name || "Wystawca";
  const totals = invoiceTotals(invoice);
  const totalGross = formatMoney(totals.gross, invoice.currency);
  const totalNet = formatMoney(totals.net, invoice.currency);
  const totalVat = formatMoney(totals.vat, invoice.currency);
  const bankAccount = sellerCompany.bankAccount || sellerCompany.iban || "";
  const buyerName = buyerContractor?.name || "—";
  const buyerNip = buyerContractor?.nip || "—";

  const vatRows = Object.entries(totals.vatByRate)
    .filter(([, v]) => (v ?? 0) > 0 || true)
    .map(([rate, vatAmt]) => {
      const label = vatRateLabel(rate as VatRate);
      return `
        <tr>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:12px;color:#64748b;">${label}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:12px;text-align:right;font-weight:600;color:#0f172a;">${formatMoney(vatAmt ?? 0, invoice.currency)}</td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Faktura ${invoice.number}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:4px;">FAKTURA VAT</div>
                  <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${invoice.number}</div>
                  <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">${compName}</div>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:10px 16px;text-align:right;">
                    <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Do zapłaty</div>
                    <div style="font-size:22px;font-weight:800;color:#ffffff;margin-top:2px;">${totalGross}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 16px;">
            <div style="font-size:14px;line-height:1.7;color:#374151;">${safeMessage}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr style="background:#f1f5f9;">
                <td colspan="2" style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">
                  Szczegóły dokumentu
                </td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Numer faktury</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${invoice.number}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Data wystawienia</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${invoice.issueDate}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Termin płatności</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#dc2626;text-align:right;border-bottom:1px solid #f1f5f9;">${invoice.dueDate}</td>
              </tr>
              ${buyerName !== "—" ? `
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Nabywca</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${buyerName} (NIP: ${buyerNip})</td>
              </tr>` : ""}
              ${bankAccount ? `
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Nr konta bankowego</td>
                <td style="padding:9px 16px;font-size:12px;font-family:monospace;font-weight:700;color:#1e40af;text-align:right;border-bottom:1px solid #f1f5f9;">${bankAccount}</td>
              </tr>` : ""}
              ${invoice.ksef?.number ? `
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#059669;border-bottom:1px solid #f1f5f9;">Numer KSeF</td>
                <td style="padding:9px 16px;font-size:11.5px;font-family:monospace;font-weight:700;color:#059669;text-align:right;border-bottom:1px solid #f1f5f9;">${invoice.ksef.number}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr style="background:#f1f5f9;">
                <td colspan="2" style="padding:10px 16px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">
                  Podsumowanie kwot
                </td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Wartość netto</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${totalNet}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Podatek VAT</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${totalVat}</td>
              </tr>
              ${vatRows ? `<tr><td colspan="2" style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f1f5f9;">${vatRows}</table></td></tr>` : ""}
              <tr style="background:linear-gradient(90deg,#eff6ff,#eef2ff);">
                <td style="padding:12px 16px;font-size:13.5px;font-weight:800;color:#1e40af;">DO ZAPŁATY</td>
                <td style="padding:12px 16px;font-size:18px;font-weight:800;color:#1e40af;text-align:right;">${totalGross}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
              Wiadomość wygenerowana automatycznie przez system <strong style="color:#3b82f6;">Fakturo</strong>.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

/**
 * POST /api/invoices/send-email
 *
 * Wysyłka faktury e-mailem do odbiorcy:
 * - Generowanie załącznika PDF faktury w locie (czysty Buffer, lekki pdf-lib, bez Puppeteer)
 * - Opcjonalne dołączenie XML KSeF FA(3)
 * - Obsługa SMTP (Nodemailer) oraz Resend API
 * - Rejestracja w bazie: sentAt, sentToEmail, emailStatus
 */
export async function POST(req: Request) {
  try {
    let user = null;
    try {
      user = await getSessionUser();
    } catch {
      // Ignorujemy błąd sesji przy wywołaniu bez autoryzacji
    }

    const body = await readJson(req);

    // ── Walidacja e-mail odbiorcy ──
    const recipientEmail = str(body.recipientEmail)?.trim();
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return NextResponse.json(
        {
          error: "Błąd wysyłki e-mail",
          details: `Podaj poprawny adres e-mail odbiorcy (${recipientEmail || "brak"}).`,
        },
        { status: 400 }
      );
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
      try {
        invoiceRecord = await prisma.invoice.findFirst({
          where: {
            id: invoiceId,
            ...(user ? { userId: user.id } : {}),
          },
          include: {
            sellerCompany: true,
          },
        });
      } catch (dbReadErr: any) {
        console.error("EMAIL_SEND_ERROR [DB read]:", dbReadErr);
      }

      if (invoiceRecord) {
        invoiceData = invoiceToDto(invoiceRecord);

        // Pobranie profilu sprzedawcy
        if (invoiceRecord.sellerCompany) {
          sellerProfile = companyProfileToDto(invoiceRecord.sellerCompany);
        } else {
          try {
            const comp =
              (await prisma.companyProfile.findFirst({
                where: { userId: invoiceRecord.userId, isDefault: true },
              })) ||
              (await prisma.companyProfile.findFirst({
                where: { userId: invoiceRecord.userId },
              }));

            if (comp) {
              sellerProfile = companyProfileToDto(comp);
            } else {
              const legacy = await prisma.companySettings.findUnique({
                where: { userId: invoiceRecord.userId },
              });
              sellerProfile = legacy ? companyToDto(legacy) : null;
            }
          } catch {
            // Ignorujemy błąd pobrania profilu, użyjemy fallbacku
          }
        }

        // Pobranie kontrahenta
        if (invoiceRecord.contractorId) {
          try {
            const c = await prisma.contractor.findUnique({
              where: { id: invoiceRecord.contractorId },
            });
            if (c) {
              buyerContractor = contractorToDto(c);
            }
          } catch {
            // Ignorujemy błąd pobrania kontrahenta
          }
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
          error: "Błąd wysyłki e-mail",
          details: "Brak danych faktury do wysyłki (nie znaleziono faktury w bazie ani w ciele zapytania).",
        },
        { status: 404 }
      );
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

    // ── 1. Przygotowanie załączników w pamięci RAM (Buffer) ──
    const attachments: EmailAttachment[] = [];
    const safeDocNumber = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    // 1. Załącznik PDF (jeśli zaznaczony)
    if (attachPdf) {
      try {
        const pdfBuffer = await generateInvoicePdfBuffer(invoiceData, buyerContractor, effectiveSeller);
        attachments.push({
          filename: `Faktura_${safeDocNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        });
      } catch (pdfError: any) {
        console.error("EMAIL_SEND_ERROR [PDF generation]:", pdfError);
        // Jeśli nie uda się wygenerować PDF, rzucamy jasny błąd lub kontynuujemy
        throw new Error(`Błąd generowania pliku PDF faktury: ${pdfError.message || pdfError}`);
      }
    }

    // 2. Załącznik XML KSeF (jeśli zaznaczony)
    if (attachXml) {
      try {
        let xmlString = invoiceRecord?.upoXml || "";
        if (!xmlString) {
          xmlString = buildFa3Xml({
            invoice: invoiceData,
            seller: effectiveSeller,
            buyer: buyerContractor,
          });
        }
        attachments.push({
          filename: `Faktura_KSeF_${safeDocNumber}.xml`,
          content: Buffer.from(xmlString, "utf-8"),
          contentType: "application/xml",
        });
      } catch (xmlError: any) {
        console.error("EMAIL_SEND_ERROR [XML generation]:", xmlError);
        throw new Error(`Błąd generowania pliku XML KSeF: ${xmlError.message || xmlError}`);
      }
    }

    // ── 2. Weryfikacja konfiguracji SMTP / poczty ──
    const hasConfig = isEmailConfigured();
    if (!hasConfig && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error: "Błąd wysyłki e-mail",
          details: "Brak skonfigurowanych danych serwera pocztowego (SMTP / Resend) w panelu Netlify lub zmiennych środowiskowych.",
        },
        { status: 422 }
      );
    }

    // ── 3. Wysyłka wiadomości e-mail ──
    const htmlContent = buildEmailHtml(messageBody, invoiceData, effectiveSeller, buyerContractor);

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject,
      text: messageBody,
      html: htmlContent,
      attachments,
    });

    const now = new Date();

    // ── 4. Rejestracja w bazie danych ──
    if (invoiceRecord) {
      try {
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
      } catch (dbUpdateErr) {
        console.error("EMAIL_SEND_ERROR [DB update]:", dbUpdateErr);
      }
    }

    const isDemo = emailResult.provider === "simulated";

    return NextResponse.json({
      success: true,
      message: isDemo
        ? `[Tryb Demo] Faktura przetworzona. Ustaw RESEND_API_KEY lub SMTP_HOST, aby wysyłać prawdziwe e-maile. Symulacja wysyłki na: ${recipientEmail}`
        : `Faktura została pomyślnie wysłana na adres ${recipientEmail}`,
      provider: emailResult.provider,
      isDemo,
      sentAt: now.toISOString(),
      sentToEmail: recipientEmail,
      emailStatus: "SENT",
      attachmentCount: attachments.length,
    });
  } catch (error: any) {
    console.error("EMAIL_SEND_ERROR:", error);

    const errorMessage = error instanceof Error ? error.message : String(error || "Nieznany błąd serwera");
    const statusCode = error instanceof ApiError ? error.status : 500;

    return NextResponse.json(
      {
        error: "Błąd wysyłki e-mail",
        details: errorMessage,
        message: errorMessage,
      },
      { status: statusCode }
    );
  }
}

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { companyProfileToDto, companyToDto, contractorToDto, invoiceToDto } from "@/lib/dto";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";
import { isValidEmail, sendEmail, type EmailAttachment } from "@/lib/email/sender";
import { buildFa3Xml } from "@/lib/ksef/index";
import { formatMoney, invoiceTotals, vatRateLabel } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice, VatRate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sprawdza, czy skonfigurowany jest co najmniej jeden provider e-mail.
 */
function hasEmailProvider(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
    process.env.SMTP_HOST?.trim()
  );
}

/**
 * Generuje profesjonalny, estetyczny szablon HTML wiadomości e-mail z fakturą.
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

  // VAT summary rows
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

        <!-- Nagłówek -->
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

        <!-- Treść wiadomości -->
        <tr>
          <td style="padding:28px 32px 16px;">
            <div style="font-size:14px;line-height:1.7;color:#374151;">${safeMessage}</div>
          </td>
        </tr>

        <!-- Szczegóły faktury -->
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

        <!-- Kwoty -->
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

        <!-- Informacja o załączniku -->
        <tr>
          <td style="padding:0 32px 28px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#166534;">
              📎 Faktura w formacie PDF znajduje się w załączniku do tej wiadomości.
            </div>
          </td>
        </tr>

        <!-- Stopka -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
              Wiadomość wygenerowana automatycznie przez system <strong style="color:#3b82f6;">Fakturo</strong>.<br>
              Prosimy nie odpowiadać na tę wiadomość. W razie pytań skontaktuj się z wystawcą faktury.
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
 * - Generowanie załącznika PDF faktury w locie
 * - Opcjonalne dołączenie XML KSeF / UPO
 * - Wysyłka przez Resend / SMTP
 * - Rejestracja w bazie: sentAt, sentToEmail, emailStatus
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const body = await readJson(req);

    // ── Walidacja e-mail odbiorcy ──
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

    // ── Sprawdzenie konfiguracji e-mail PRZED generowaniem PDF ──
    if (!hasEmailProvider()) {
      console.warn("[Email API] Brak skonfigurowanego providera e-mail (RESEND_API_KEY lub SMTP_HOST).");
      // W trybie demo — kontynuujemy (simulated), ale zwracamy czytelną informację
    }

    // ── 1. Przygotowanie załączników ──
    const attachments: EmailAttachment[] = [];
    const safeFilename = invoiceData.number.replace(/[/\\?%*:|"<>]/g, "_");

    if (attachPdf) {
      try {
        const pdfBuffer = await generateInvoicePdfBuffer(invoiceData, buyerContractor, effectiveSeller);
        attachments.push({
          filename: `Faktura_${safeFilename}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        });
      } catch (pdfErr: unknown) {
        // PDF generation failure is non-fatal — log and continue without attachment
        console.error("[Email API] Błąd generowania PDF faktury:", pdfErr);
        console.warn("[Email API] Wysyłka zostanie wykonana bez załącznika PDF.");
      }
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
      } catch (xmlErr) {
        console.warn("[Email API] Nie udało się wygenerować załącznika XML KSeF:", xmlErr);
      }
    }

    // ── 2. Wysyłka wiadomości e-mail ──
    const htmlContent = buildEmailHtml(messageBody, invoiceData, effectiveSeller, buyerContractor);

    let emailResult;
    try {
      emailResult = await sendEmail({
        to: recipientEmail,
        subject,
        text: messageBody,
        html: htmlContent,
        attachments,
      });
    } catch (sendErr: unknown) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("[Email API] Błąd wysyłki wiadomości:", sendErr);

      // Jeśli brak SMTP/Resend — zwróć 422 zamiast 500
      if (!hasEmailProvider()) {
        throw new ApiError(
          422,
          "Brak skonfigurowanego serwera e-mail. Dodaj zmienną RESEND_API_KEY lub SMTP_HOST w ustawieniach środowiska (Netlify / Vercel / .env)."
        );
      }

      throw new ApiError(502, `Wysyłka e-mail nie powiodła się: ${errMsg}`);
    }

    const now = new Date();

    // ── 3. Rejestracja w bazie danych ──
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
      } catch (dbErr) {
        // Non-fatal — e-mail was sent, just log the DB error
        console.error("[Email API] Błąd zapisu statusu wysyłki do bazy:", dbErr);
      }
    }

    const isDemo = emailResult.provider === "simulated";

    return json({
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
  } catch (e) {
    // Loguj tylko nieoczekiwane błędy (nie ApiError — to jest kontrolowany przepływ)
    if (!(e instanceof ApiError)) {
      console.error("[Email API] Nieoczekiwany błąd krytyczny:", e);
    }
    return handleApiError(e);
  }
}

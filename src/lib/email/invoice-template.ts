import { formatMoney, invoiceTotals, vatRateLabel } from "@/lib/format";
import type { CompanyProfile, Contractor, Invoice, VatRate } from "@/lib/types";

function htmlText(value: unknown) {
  const escapes: Record<string,string> = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return String(value ?? "").replace(/[&<>"']/g, character => escapes[character]);
}
export function buildEmailHtml(
  messageBody: string,
  invoice: Invoice,
  sellerCompany: CompanyProfile,
  buyerContractor?: Contractor
): string {
  const safeMessage = htmlText(messageBody).replace(/\n/g, "<br/>");
  const compName = htmlText(sellerCompany.companyName || sellerCompany.name || "Wystawca");
  const totals = invoiceTotals(invoice);
  const totalGross = formatMoney(totals.gross, invoice.currency);
  const totalNet = formatMoney(totals.net, invoice.currency);
  const totalVat = formatMoney(totals.vat, invoice.currency);
  const bankAccount = htmlText(sellerCompany.bankAccount || sellerCompany.iban || "");
  const buyerName = htmlText(buyerContractor?.name || "—");
  const buyerNip = htmlText(buyerContractor?.nip || "—");

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
  <title>Faktura ${htmlText(invoice.number)}</title>
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
                  <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${htmlText(invoice.number)}</div>
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
                <td style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${htmlText(invoice.number)}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Data wystawienia</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${htmlText(invoice.issueDate)}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid #f1f5f9;">Termin płatności</td>
                <td style="padding:9px 16px;font-size:12.5px;font-weight:700;color:#dc2626;text-align:right;border-bottom:1px solid #f1f5f9;">${htmlText(invoice.dueDate)}</td>
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
                <td style="padding:9px 16px;font-size:11.5px;font-family:monospace;font-weight:700;color:#059669;text-align:right;border-bottom:1px solid #f1f5f9;">${htmlText(invoice.ksef.number)}</td>
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
              Wiadomość wygenerowana automatycznie przez system <strong style="color:#3b82f6;">FakturaProsto</strong>.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

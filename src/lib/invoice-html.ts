import { formatDate, formatMoney, invoiceTotals, lineGross, lineNet, lineVat, vatRateLabel } from "./format";
import { invoiceLabels, paymentMethodLabel } from "./i18n";
import type { CompanyProfile, Contractor, Invoice, CompanyBankAccount } from "./types";
import { getTaxIdLabel } from "./validation";

function esc(s: string | number | undefined | null): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Samodzielny dokument HTML z fakturą — do pobrania / wydruku („Zapisz jako PDF").
 * Obsługuje faktury wielowalutowe, kursy NBP, dane wielowalutowe IBAN/SWIFT oraz tryb dwujęzyczny PL/EN.
 */
export function buildInvoiceHtmlString(
  invoice: Invoice,
  contractor: Contractor | undefined,
  company: CompanyProfile
): string {
  const lang = invoice.language || "PL";
  const L = invoiceLabels[lang] || invoiceLabels["PL"];
  const t = invoiceTotals(invoice);

  const compName = company.companyName || company.name || "—";
  const sellerName = invoice.type === "sale" ? compName : (contractor?.name ?? "—");
  const buyerName = invoice.type === "sale" ? (contractor?.name ?? "—") : compName;

  const streetPart = [company.street, company.buildingNumber].filter(Boolean).join(" ");
  const compStreet = company.flatNumber ? `${streetPart}/${company.flatNumber}` : (streetPart || company.street || "");
  const compCity = company.city || "";
  const compPostal = company.postalCode || company.postal || "";
  const compCountry = company.country || "PL";
  const compIban = company.bankAccount || company.iban || "";

  const sellerAddr =
    invoice.type === "sale"
      ? { street: compStreet, city: compCity, postal: compPostal, country: compCountry }
      : contractor?.address;
  const buyerAddr =
    invoice.type === "sale"
      ? contractor?.address
      : { street: compStreet, city: compCity, postal: compPostal, country: compCountry };

  const sellerNip = invoice.type === "sale" ? company.nip : (contractor?.nip ?? "—");
  const buyerTaxId = invoice.type === "sale" ? (contractor?.taxId || contractor?.nip || "—") : company.nip;
  const buyerTaxIdType = contractor?.taxIdType || invoice.buyerTaxIdType || "nip";
  const buyerCountry = contractor?.country || contractor?.address?.country || invoice.buyerCountry || "PL";
  const buyerTaxLabel = invoice.type === "sale" ? getTaxIdLabel(buyerTaxIdType, buyerCountry, lang) : L.nip;

  // Snapshot rachunku bankowego jeśli został przypisany
  const bankSnapshot = invoice.bankAccountSnapshot as (CompanyBankAccount & { bankName?: string }) | undefined;

  const rows = invoice.lines
    .map(
      (line, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td><b>${esc(line.name)}</b></td>
        <td class="c">${line.quantity}</td>
        <td class="c muted">${esc(line.unit)}</td>
        <td class="r">${formatMoney(lineNet(line), invoice.currency)}</td>
        <td class="c">${vatRateLabel(line.vatRate)}</td>
        <td class="r">${formatMoney(lineVat(line), invoice.currency)}</td>
        <td class="r">${formatMoney(lineGross(line), invoice.currency)}</td>
      </tr>`
    )
    .join("");

  const isForeignCurrency = invoice.currency && invoice.currency !== "PLN";
  const vatInPln = invoice.totalVatPln ?? (invoice.exchangeRate ? t.vat * (invoice.exchangeRate / (invoice.exchangeRateUnit || 1)) : null);
  const accentColor = company.accentColor || company.primaryColor || "#4f46e5";

  return `<!DOCTYPE html>
<html lang="${lang === "PL" ? "pl" : "en"}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #f4f5f7; padding: 32px 16px; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.12); padding: 40px 44px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eef0f3; padding-bottom: 18px; gap: 16px; flex-wrap: wrap; }
  .doc-title { font-size: 22px; font-weight: 800; letter-spacing: -.02em; color: ${accentColor}; }
  .meta { margin-top: 8px; font-size: 13px; color: #6b7280; }
  .meta b { color: #111827; }
  .dates { margin-top: 12px; display: flex; gap: 24px; font-size: 12.5px; flex-wrap: wrap; }
  .dates span { color: #6b7280; }
  .dates b { color: #111827; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
  .party { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
  .party h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px; }
  .party.seller h4 { color: #10b981; } .party.buyer h4 { color: ${accentColor}; }
  .party p { font-size: 12.5px; line-height: 1.55; color: #374151; }
  .party .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 26px; font-size: 12.5px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; padding: 8px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 9px 8px; border-bottom: 1px solid #eef0f3; }
  .r { text-align: right; } .c { text-align: center; } .muted { color: #6b7280; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 20px; }
  .totals { width: 280px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; font-size: 13px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .gross { font-weight: 800; font-size: 14px; border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 8px; }
  .totals .pay { background: ${accentColor}18; color: ${accentColor}; font-weight: 800; border-radius: 6px; padding: 7px 10px; margin-top: 8px; display: flex; justify-content: space-between; }
  .pay-info { margin-top: 18px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #374151; }
  .nbp-box { margin-top: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #1e3a8a; }
  .foot { margin-top: 34px; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10.5px; color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; border-radius: 0; padding: 24px; } }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div style="display: flex; align-items: flex-start; gap: 20px;">
      ${company.logoUrl ? `
        <div style="max-width: 180px; max-height: 75px; display: flex; align-items: center;">
          <img src="${esc(company.logoUrl)}" alt="${esc(sellerName)}" style="max-height: 65px; max-width: 170px; object-fit: contain;" />
        </div>
      ` : ""}
      <div>
        <div class="doc-title">${invoice.type === "purchase" ? esc(L.purchaseDoc) : esc(L.saleDoc)}</div>
        <div class="meta">${esc(L.invoiceNo)}: <b>${esc(invoice.number)}</b></div>
        <div class="dates">
          <span>${esc(L.issueDate)}: <b>${formatDate(invoice.issueDate)}</b></span>
          <span>${esc(L.saleDate)}: <b>${formatDate(invoice.saleDate)}</b></span>
          <span>${esc(L.dueDate)}: <b>${formatDate(invoice.dueDate)}</b></span>
        </div>
        ${(invoice.ksefNumber || invoice.ksef?.number) ? `
          <div style="margin-top: 6px; font-size: 11px; font-family: monospace; color: #059669;">
            Numer w KSeF: <b>${esc(invoice.ksefNumber || invoice.ksef?.number)}</b>
          </div>
        ` : ""}
      </div>
    </div>
    <div style="text-align:right; font-size:12px; color:#6b7280;">
      <div><b>${invoice.currency}</b></div>
      <div style="margin-top:4px;">${esc(L.paymentMethod)}: ${esc(paymentMethodLabel(invoice.paymentMethod, lang))} (${invoice.paymentTermDays} dni)</div>
    </div>
  </div>

  <div class="parties">
    <div class="party seller">
      <h4>${esc(L.seller)}</h4>
      <p><b>${esc(sellerName)}</b><br/>
        <span class="muted">${esc(sellerAddr?.street ?? "")}<br/>${esc(`${sellerAddr?.postal ?? ""} ${sellerAddr?.city ?? ""}, ${sellerAddr?.country ?? ""}`)}</span><br/>
        ${esc(L.nip)}: <b>${esc(sellerNip)}</b>
      </p>
    </div>
    <div class="party buyer">
      <h4>${esc(L.buyer)}</h4>
      <p><b>${esc(buyerName)}</b><br/>
        <span class="muted">${esc(buyerAddr?.street ?? "")}<br/>${esc(`${buyerAddr?.postal ?? ""} ${buyerAddr?.city ?? ""}, ${buyerAddr?.country ?? ""}`)}</span><br/>
        ${esc(buyerTaxLabel)}: <b>${esc(buyerTaxId)}</b>
      </p>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>#</th><th>${esc(L.item)}</th><th>${esc(L.qty)}</th><th>${esc(L.unit)}</th>
      <th style="text-align:right">${esc(L.net)}</th><th>${esc(L.vatRate)}</th>
      <th style="text-align:right">${esc(L.vatAmount)}</th><th style="text-align:right">${esc(L.gross)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="row"><span>${esc(L.totalNet)}</span><span>${formatMoney(t.net, invoice.currency)}</span></div>
      <div class="row"><span>${esc(L.totalVat)}</span><span>${formatMoney(t.vat, invoice.currency)}</span></div>
      <div class="row gross"><span>${esc(L.totalGross)}</span><span>${formatMoney(t.gross, invoice.currency)}</span></div>
      <div class="pay"><span>${esc(L.toPay)}</span><span>${formatMoney(t.gross, invoice.currency)}</span></div>
    </div>
  </div>

  ${isForeignCurrency && invoice.exchangeRate ? `
    <div class="nbp-box">
      <b>Przeliczenie waluty obcej wg kursu NBP (art. 31a ustawy o VAT) / Currency conversion:</b><br/>
      ${invoice.exchangeRateTable ? `Tabela NBP / Table: <b>${esc(invoice.exchangeRateTable)}</b> z dnia / Date: <b>${esc(invoice.exchangeRateDate || "—")}</b><br/>` : ""}
      Kurs / Rate: <b>1 ${esc(invoice.currency)} = ${(invoice.exchangeRate / (invoice.exchangeRateUnit || 1)).toFixed(4)} PLN</b><br/>
      ${vatInPln !== null ? `Kwota podatku VAT w PLN / VAT amount in PLN: <b>${vatInPln.toFixed(2)} PLN</b><br/>` : ""}
      ${invoice.exchangeRateJustification ? `Uzasadnienie / Justification: <i>${esc(invoice.exchangeRateJustification)}</i>` : ""}
    </div>
  ` : ""}

  <div class="pay-info">
    <b>${esc(L.paymentMethod)}:</b> ${esc(paymentMethodLabel(invoice.paymentMethod, lang))}<br/>
    ${bankSnapshot ? `
      <b>Bank:</b> ${esc(bankSnapshot.bankName || "—")}<br/>
      <b>Beneficiary / Odbiorca:</b> ${esc((bankSnapshot as any).beneficiary || sellerName)}<br/>
      <b>IBAN / Account:</b> <b>${esc(bankSnapshot.accountNumber)}</b><br/>
      ${bankSnapshot.swiftBic ? `<b>SWIFT / BIC:</b> <b>${esc(bankSnapshot.swiftBic)}</b><br/>` : ""}
      <b>Currency / Waluta konta:</b> ${esc(bankSnapshot.currency)}
    ` : (invoice.paymentMethod === "transfer" ? `
      <b>${esc(L.account)}:</b> <b>${esc(invoice.type === "sale" ? compIban : (contractor?.iban ?? "—"))}</b>
    ` : "")}
    <br/>${esc(L.invoiceNo)}: ${esc(invoice.number)} · ${esc(L.dueDate)}: ${formatDate(invoice.dueDate)}
  </div>

  ${invoice.notes ? `<div style="margin-top:14px;font-size:12px;color:#6b7280;"><b>${esc(L.notes)}:</b><br/>${esc(invoice.notes)}</div>` : ""}

  <div class="foot">FakturaProsto · ${esc(L.invoice)} ${esc(invoice.number)} · Wygenerowano: ${new Date().toLocaleString("pl-PL")}</div>
</div>
<script>window.onload = function(){ if (window.__autoPrint) window.print(); };</script>
</body>
</html>`;
}

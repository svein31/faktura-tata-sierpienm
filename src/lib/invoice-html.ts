import { formatDate, formatMoney, invoiceTotals, lineGross, lineNet, lineVat, vatRateLabel } from "./format";
import { invoiceLabels, paymentMethodLabel } from "./i18n";
import type { CompanyProfile, Contractor, Invoice } from "./types";

function esc(s: string | number | undefined | null): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Samodzielny dokument HTML z fakturą — do pobrania / wydruku („Zapisz jako PDF").
 * Pełny, serwerowy PDF (np. Puppeteer) wykracza poza zakres demo — patrz README.
 */
export function buildInvoiceHtmlString(
  invoice: Invoice,
  contractor: Contractor | undefined,
  company: CompanyProfile
): string {
  const L = invoiceLabels[invoice.language];
  const t = invoiceTotals(invoice);
  const sellerName = invoice.type === "sale" ? company.name : (contractor?.name ?? "—");
  const buyerName = invoice.type === "sale" ? (contractor?.name ?? "—") : company.name;
  const sellerAddr =
    invoice.type === "sale"
      ? { street: company.street, city: company.city, postal: company.postal, country: company.country }
      : contractor?.address;
  const buyerAddr =
    invoice.type === "sale"
      ? contractor?.address
      : { street: company.street, city: company.city, postal: company.postal, country: company.country };
  const sellerNip = invoice.type === "sale" ? company.nip : (contractor?.nip ?? "—");
  const buyerNip = invoice.type === "sale" ? (contractor?.nip ?? "—") : company.nip;

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

  return `<!DOCTYPE html>
<html lang="${invoice.language === "PL" ? "pl" : "en"}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #f4f5f7; padding: 32px 16px; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 12px 32px -12px rgba(0,0,0,.18); padding: 40px 44px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eef0f3; padding-bottom: 18px; gap: 16px; flex-wrap: wrap; }
  .doc-title { font-size: 22px; font-weight: 800; letter-spacing: -.02em; background: linear-gradient(120deg,#6366f1,#10b981); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .meta { margin-top: 8px; font-size: 13px; color: #6b7280; }
  .meta b { color: #111827; }
  .dates { margin-top: 12px; display: flex; gap: 24px; font-size: 12.5px; flex-wrap: wrap; }
  .dates span { color: #6b7280; }
  .dates b { color: #111827; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
  .party { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
  .party h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px; }
  .party.seller h4 { color: #10b981; } .party.buyer h4 { color: #6366f1; }
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
  .totals .pay { background: rgba(99,102,241,.1); color: #4f46e5; font-weight: 800; border-radius: 6px; padding: 7px 10px; margin-top: 8px; display: flex; justify-content: space-between; }
  .pay-info { margin-top: 18px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #374151; }
  .foot { margin-top: 34px; padding-top: 14px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10.5px; color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; border-radius: 0; padding: 24px; } }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div>
      <div class="doc-title">${invoice.type === "purchase" ? esc(L.purchaseDoc) : esc(L.saleDoc)}</div>
      <div class="meta">${esc(L.invoiceNo)}: <b>${esc(invoice.number)}</b></div>
      <div class="dates">
        <span>${esc(L.issueDate)}: <b>${formatDate(invoice.issueDate)}</b></span>
        <span>${esc(L.saleDate)}: <b>${formatDate(invoice.saleDate)}</b></span>
        <span>${esc(L.dueDate)}: <b>${formatDate(invoice.dueDate)}</b></span>
      </div>
    </div>
    <div style="text-align:right; font-size:12px; color:#6b7280;">
      <div><b>${invoice.currency}</b></div>
      <div style="margin-top:4px;">${esc(L.paymentMethod)}: ${esc(paymentMethodLabel(invoice.paymentMethod, invoice.language))} (${invoice.paymentTermDays} dni)</div>
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
        ${esc(L.nip)}: <b>${esc(buyerNip)}</b>
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

  <div class="pay-info">
    <b>${esc(L.paymentMethod)}:</b> ${esc(paymentMethodLabel(invoice.paymentMethod, invoice.language))}
    ${invoice.paymentMethod === "transfer" ? `<br/>${esc(L.account)}: <b>${esc(invoice.type === "sale" ? company.iban : (contractor?.iban ?? "—"))}</b>` : ""}
    <br/>${esc(L.invoiceNo)}: ${esc(invoice.number)} · ${esc(L.dueDate)}: ${formatDate(invoice.dueDate)}
  </div>

  ${invoice.notes ? `<div style="margin-top:14px;font-size:12px;color:#6b7280;"><b>${esc(L.notes)}:</b><br/>${esc(invoice.notes)}</div>` : ""}

  <div class="foot">Fakturo · ${esc(L.invoice)} ${esc(invoice.number)} · Wygenerowano: ${new Date().toLocaleString("pl-PL")}</div>
</div>
<script>window.onload = function(){ if (window.__autoPrint) window.print(); };</script>
</body>
</html>`;
}

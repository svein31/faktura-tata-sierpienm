/**
 * Generowanie XML w formacie FA(2) (struktura e-Faktury, wersja uproszczona demo)
 * oraz eksport JSON faktury.
 */

import { formatDate } from "./format";
import { invoiceLabels } from "./i18n";
import type { CompanyProfile, Invoice, InvoiceLine } from "./types";
import { invoiceTotals, lineGross, lineNet, lineVat, round2, vatRateLabel } from "./format";

function esc(s: string | number | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCompanyAddress(c: CompanyProfile): string {
  const streetPart = [c.street, c.buildingNumber].filter(Boolean).join(" ");
  const streetFull = c.flatNumber ? `${streetPart}/${c.flatNumber}` : (streetPart || c.street || "");
  const postal = c.postalCode || c.postal || "";
  const city = c.city || "";
  const country = c.country || "PL";
  return [streetFull, `${postal} ${city}`.trim(), country].filter(Boolean).join(", ");
}

export function buildFaVatXml(invoice: Invoice, company: CompanyProfile): string {
  const t = invoiceTotals(invoice);
  const vatCode = (rate: string) => (rate === "zw" || rate === "np" ? "0" : rate);
  const lang = invoice.language;
  const buyerLines = invoice.type === "sale"
    ? null
    : `  <!-- Faktura zakupowa: sprzedawca = kontrahent, nabywca = Twoja firma -->\n`;

  const items = invoice.lines
    .map((line: InvoiceLine) => {
      const net = round2(lineNet(line));
      const vat = round2(lineVat(line));
      const gross = round2(lineGross(line));
      return `  <Fa>
    <P_9A>${esc(line.name)}</P_9A>
    <P_9B>${esc(line.unit)}</P_9B>
    <P_9C>${line.quantity}</P_9C>
    <P_9D>${net.toFixed(2)}</P_9D>
    <P_9E>${vatCode(line.vatRate)}</P_9E>
    <P_9F>${vatRateLabel(line.vatRate)}</P_9F>
    <P_9G>${vatCode(line.vatRate)}</P_9G>
    <P_10>${net.toFixed(2)}</P_10>
    <P_11>${vat.toFixed(2)}</P_11>
    <P_12>${gross.toFixed(2)}</P_12>
  </Fa>`;
    })
    .join("\n");

  const compName = company.companyName || company.name || "—";
  const compAddr = getCompanyAddress(company);
  const sellerName = invoice.type === "sale" ? compName : "—";
  const sellerNip = invoice.type === "sale" ? company.nip : "—";
  const buyerName = invoice.type === "sale" ? "—" : compName;
  const buyerNip = invoice.type === "sale" ? "—" : company.nip;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Faktura w strukturze FA(2) / FA(3) (uproszczony eksport, struktura e-Faktury KSeF) -->
<Faktura xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2024/01/17/eD/DefinicjeTypy/"
         xmlns:ksef="http://ksef.mf.gov.pl/schema/gtw/schematy/2024/01/17/0001/Faktura"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${buyerLines ?? ""}  <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA (2)</KodFormularza>
  <WariantFormularza>1</WariantFormularza>
  <CelZlozenia>1</CelZlozenia>
  <DataWystawienia>${invoice.issueDate}</DataWystawienia>
  <NazwaSprzedawcy>${esc(sellerName)}</NazwaSprzedawcy>
  <AdresSprzedawcy>${esc(compAddr)}</AdresSprzedawcy>
  <NIPSprzedawcy>${esc(sellerNip)}</NIPSprzedawcy>
  <NazwaNabywcy>${esc(invoice.type === "sale" ? buyerName : sellerName)}</NazwaNabywcy>
  <AdresNabywcy>${esc(compAddr)}</AdresNabywcy>
  <NIPNabywcy>${esc(buyerNip)}</NIPNabywcy>
  <DowodSprzedazy>${esc(invoice.number)}</DowodSprzedazy>
  <P_1>${invoice.saleDate || invoice.issueDate}</P_1>
  <P_2>${invoice.type === "purchase" ? "2" : "1"}</P_2>
  <P_13>${invoice.currency}</P_13>
  <P_14>${t.net.toFixed(2)}</P_14>
  <P_15>${t.vat.toFixed(2)}</P_15>
  <P_16>${t.gross.toFixed(2)}</P_16>
${items}
  <FaRwCtrl>
    <LiczbaWierszy>${invoice.lines.length}</LiczbaWierszy>
    <PodatekNalezny>${t.vat.toFixed(2)}</PodatekNalezny>
    <WartoscBrutto>${t.gross.toFixed(2)}</WartoscBrutto>
    <WartoscNetto>${t.net.toFixed(2)}</WartoscNetto>
  </FaRwCtrl>
  <Stopka>${esc(`Wygenerowano: ${new Date().toISOString()} | ${lang === "PL" ? "Faktura" : "Invoice"} ${invoice.number}`)}</Stopka>
</Faktura>
`;
}

export function invoiceToJson(invoice: Invoice, company: CompanyProfile): string {
  const t = invoiceTotals(invoice);
  const payload = {
    meta: {
      app: "Fakturo",
      version: "2.0.0",
      exportDate: new Date().toISOString(),
      demo: true,
    },
    invoice: {
      number: invoice.number,
      type: invoice.type,
      status: invoice.status,
      currency: invoice.currency,
      language: invoice.language,
      issueDate: invoice.issueDate,
      saleDate: invoice.saleDate,
      dueDate: invoice.dueDate,
      paymentMethod: invoice.paymentMethod,
      paymentTermDays: invoice.paymentTermDays,
      notes: invoice.notes ?? null,
      ksef: invoice.ksef ?? null,
      totals: { net: t.net, vat: t.vat, gross: t.gross },
      seller: {
        name: company.companyName || company.name,
        nip: company.nip,
        regon: company.regon || "",
        address: {
          street: company.street || "",
          buildingNumber: company.buildingNumber || "",
          flatNumber: company.flatNumber || "",
          city: company.city || "",
          postal: company.postalCode || company.postal || "",
          country: company.country || "PL",
        },
        iban: company.bankAccount || company.iban || "",
        bankName: company.bankName || "",
      },
      contractorId: invoice.contractorId,
      lines: invoice.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        netPrice: l.netPrice,
        vatRate: l.vatRate,
        net: lineNet(l),
        vat: lineVat(l),
        gross: lineGross(l),
      })),
      labels: invoiceLabels[invoice.language],
    },
  };
  return JSON.stringify(payload, null, 2);
}

export { formatDate };

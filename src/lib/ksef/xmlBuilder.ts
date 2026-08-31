/**
 * Builder oraz walidator dokumentu XML e-Faktury w formacie FA(3)
 * Przestrzeń nazw: http://crd.gov.pl/wzor/2025/06/25/13775/ (obowiązująca od 2026 r.)
 */

import { FA3_NAMESPACE, FA3_SCHEMA_VERSION, FA3_SYSTEM_CODE, FA3_FORM_VARIANT, PAYMENT_METHOD_CODES } from "./constants";
import type { CompanyProfile, Contractor, Invoice, InvoiceLine, VatRate } from "../types";
import { lineGross, lineNet, lineVat, round2 } from "../format";

function esc(s: string | number | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanNip(nip: string | undefined | null): string {
  return (nip ?? "").replace(/[^0-9]/g, "").trim();
}

function cleanIban(iban: string | undefined | null): string {
  return (iban ?? "").replace(/[^0-9A-Z]/gi, "").trim();
}

export interface Fa3BuildOptions {
  invoice: Invoice;
  seller: CompanyProfile;
  buyer?: Contractor | null;
  systemInfo?: string;
  generationDate?: Date;
}

export interface Fa3RateTotals {
  net: number;
  vat: number;
  gross: number;
}

export interface Fa3TotalsBreakdown {
  rate23: Fa3RateTotals;
  rate8: Fa3RateTotals;
  rate5: Fa3RateTotals;
  rate0: Fa3RateTotals;
  rateZw: Fa3RateTotals;
  rateNp: Fa3RateTotals;
  rateOo: Fa3RateTotals;
  totalNet: number;
  totalVat: number;
  totalGross: number;
}

/**
 * Agreguje podsumowania stawek VAT dla struktury FA(3).
 */
export function calculateFa3Totals(lines: InvoiceLine[]): Fa3TotalsBreakdown {
  const initRate = (): Fa3RateTotals => ({ net: 0, vat: 0, gross: 0 });

  const totals: Fa3TotalsBreakdown = {
    rate23: initRate(),
    rate8: initRate(),
    rate5: initRate(),
    rate0: initRate(),
    rateZw: initRate(),
    rateNp: initRate(),
    rateOo: initRate(),
    totalNet: 0,
    totalVat: 0,
    totalGross: 0,
  };

  for (const line of lines) {
    const net = round2(lineNet(line));
    const vat = round2(lineVat(line));
    const gross = round2(lineGross(line));

    totals.totalNet = round2(totals.totalNet + net);
    totals.totalVat = round2(totals.totalVat + vat);
    totals.totalGross = round2(totals.totalGross + gross);

    switch (line.vatRate) {
      case "23":
        totals.rate23.net = round2(totals.rate23.net + net);
        totals.rate23.vat = round2(totals.rate23.vat + vat);
        totals.rate23.gross = round2(totals.rate23.gross + gross);
        break;
      case "8":
        totals.rate8.net = round2(totals.rate8.net + net);
        totals.rate8.vat = round2(totals.rate8.vat + vat);
        totals.rate8.gross = round2(totals.rate8.gross + gross);
        break;
      case "5":
        totals.rate5.net = round2(totals.rate5.net + net);
        totals.rate5.vat = round2(totals.rate5.vat + vat);
        totals.rate5.gross = round2(totals.rate5.gross + gross);
        break;
      case "0":
        totals.rate0.net = round2(totals.rate0.net + net);
        totals.rate0.gross = round2(totals.rate0.gross + gross);
        break;
      case "zw":
        totals.rateZw.net = round2(totals.rateZw.net + net);
        totals.rateZw.gross = round2(totals.rateZw.gross + gross);
        break;
      case "np":
        totals.rateNp.net = round2(totals.rateNp.net + net);
        totals.rateNp.gross = round2(totals.rateNp.gross + gross);
        break;
      case "oo":
        totals.rateOo.net = round2(totals.rateOo.net + net);
        totals.rateOo.gross = round2(totals.rateOo.gross + gross);
        break;
    }
  }

  return totals;
}

/**
 * Konwertuje stawkę VAT do oznaczenia w elemencie P_12 wg FA(3).
 */
export function mapVatRateToP12(rate: VatRate): string {
  switch (rate) {
    case "23":
      return "23";
    case "8":
      return "8";
    case "5":
      return "5";
    case "0":
      return "0";
    case "zw":
      return "zw";
    case "np":
      return "np";
    case "oo":
      return "OO"; // odwrotne obciążenie wg FA(3)
    default:
      return "23";
  }
}

/**
 * Główna funkcja budująca poprawny XML schematu FA(3)
 */
export function buildFa3Xml(options: Fa3BuildOptions): string {
  const { invoice, seller, buyer, systemInfo = "Fakturo KSeF 2.0", generationDate = new Date() } = options;
  const totals = calculateFa3Totals(invoice.lines);
  const sellerNip = cleanNip(seller.nip);
  const buyerNip = buyer ? cleanNip(buyer.nip) : "";
  const genIso = generationDate.toISOString();

  // Wiersze faktury <FaWiersz>
  const faWierszeXml = invoice.lines
    .map((line, index) => {
      const net = round2(lineNet(line));
      const vatRateTag = mapVatRateToP12(line.vatRate);
      return `    <FaWiersz>
      <NrWierszaFa>${index + 1}</NrWierszaFa>
      <P_7>${esc(line.name)}</P_7>
      <P_8A>${esc(line.unit || "szt.")}</P_8A>
      <P_8B>${line.quantity}</P_8B>
      <P_9A>${line.netPrice.toFixed(2)}</P_9A>
      <P_11>${net.toFixed(2)}</P_11>
      <P_12>${vatRateTag}</P_12>
    </FaWiersz>`;
    })
    .join("\n");

  // Sumy wg stawek VAT (P_13_x oraz P_14_x)
  const rateSummaries: string[] = [];
  if (totals.rate23.net > 0 || totals.rate23.vat > 0) {
    rateSummaries.push(`    <P_13_1>${totals.rate23.net.toFixed(2)}</P_13_1>`);
    rateSummaries.push(`    <P_14_1>${totals.rate23.vat.toFixed(2)}</P_14_1>`);
  }
  if (totals.rate8.net > 0 || totals.rate8.vat > 0) {
    rateSummaries.push(`    <P_13_2>${totals.rate8.net.toFixed(2)}</P_13_2>`);
    rateSummaries.push(`    <P_14_2>${totals.rate8.vat.toFixed(2)}</P_14_2>`);
  }
  if (totals.rate5.net > 0 || totals.rate5.vat > 0) {
    rateSummaries.push(`    <P_13_3>${totals.rate5.net.toFixed(2)}</P_13_3>`);
    rateSummaries.push(`    <P_14_3>${totals.rate5.vat.toFixed(2)}</P_14_3>`);
  }
  if (totals.rate0.net > 0) {
    rateSummaries.push(`    <P_13_6_1>${totals.rate0.net.toFixed(2)}</P_13_6_1>`);
  }
  if (totals.rateZw.net > 0) {
    rateSummaries.push(`    <P_13_7>${totals.rateZw.net.toFixed(2)}</P_13_7>`);
  }
  if (totals.rateNp.net > 0) {
    rateSummaries.push(`    <P_13_8>${totals.rateNp.net.toFixed(2)}</P_13_8>`);
  }

  const rateSummariesXml = rateSummaries.length > 0 ? `${rateSummaries.join("\n")}\n` : "";

  // Sekcja Nabywcy (Podmiot2)
  const buyerIdXml = buyerNip
    ? `<NIP>${buyerNip}</NIP>`
    : `<BrakID>1</BrakID>`;

  const buyerStreet = buyer?.address?.street || "";
  const buyerPostalCity = `${buyer?.address?.postal || ""} ${buyer?.address?.city || ""}`.trim();
  const buyerCountry = buyer?.address?.country || "PL";
  const buyerName = buyer?.name || "Klient detaliczny";

  // Sekcja Sprzedawcy (Podmiot1)
  const sellerStreet = seller.street || "";
  const sellerPostalCity = `${seller.postal || ""} ${seller.city || ""}`.trim();
  const sellerCountry = seller.country || "PL";

  // Sekcja Płatności (Platnosc)
  const paymentMethodCode = PAYMENT_METHOD_CODES[invoice.paymentMethod] || "6";
  const ibanClean = cleanIban(seller.iban);
  const paymentStatusXml = invoice.status === "paid"
    ? `      <Zaplacono>1</Zaplacono>\n`
    : `      <DoZaplaty>${totals.totalGross.toFixed(2)}</DoZaplaty>\n`;

  const bankAccountXml = ibanClean
    ? `      <RachunekBankowy>
        <NrRB>${ibanClean}</NrRB>
        ${seller.bankName ? `<NazwaBanku>${esc(seller.bankName)}</NazwaBanku>` : ""}
      </RachunekBankowy>\n`
    : "";

  const paymentTermDescription = invoice.paymentTermDays
    ? `Termin płatności: ${invoice.paymentTermDays} dni`
    : `Termin płatności do: ${invoice.dueDate}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${FA3_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION}">FA</KodFormularza>
    <WariantFormularza>${FA3_FORM_VARIANT}</WariantFormularza>
    <DataWytworzeniaFa>${genIso}</DataWytworzeniaFa>
    <SystemInfo>${esc(systemInfo)}</SystemInfo>
  </Naglowek>

  <Podmiot1>
    <PrefiksPodatnika>PL</PrefiksPodatnika>
    <DaneIdentyfikacyjne>
      <NIP>${sellerNip}</NIP>
      <Nazwa>${esc(seller.companyName || seller.name || "Wystawca")}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(sellerCountry)}</KodKraju>
      <AdresL1>${esc(sellerStreet)}</AdresL1>
      <AdresL2>${esc(sellerPostalCity)}</AdresL2>
    </Adres>
    ${seller.email || seller.phone ? `<DaneKontaktowe>
      ${seller.email ? `<Email>${esc(seller.email)}</Email>` : ""}
      ${seller.phone ? `<Telefon>${esc(seller.phone)}</Telefon>` : ""}
    </DaneKontaktowe>` : ""}
  </Podmiot1>

  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${buyerIdXml}
      <Nazwa>${esc(buyerName)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${esc(buyerCountry)}</KodKraju>
      <AdresL1>${esc(buyerStreet || "—")}</AdresL1>
      <AdresL2>${esc(buyerPostalCity || "—")}</AdresL2>
    </Adres>
    ${buyer?.email || buyer?.phone ? `<DaneKontaktowe>
      ${buyer.email ? `<Email>${esc(buyer.email)}</Email>` : ""}
      ${buyer.phone ? `<Telefon>${esc(buyer.phone)}</Telefon>` : ""}
    </DaneKontaktowe>` : ""}
  </Podmiot2>

  <Fa>
    <KodWaluty>${esc(invoice.currency || "PLN")}</KodWaluty>
    <P_1>${invoice.issueDate}</P_1>
    <P_2>${esc(invoice.number)}</P_2>
    <P_6>${invoice.saleDate || invoice.issueDate}</P_6>
${rateSummariesXml}    <P_15>${totals.totalGross.toFixed(2)}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        ${totals.rateZw.net > 0 ? `<P_19>1</P_19>` : `<P_19N>1</P_19N>`}
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <P_PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </P_PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
${faWierszeXml}
    <Platnosc>
${paymentStatusXml}      <FormaPlatnosci>${paymentMethodCode}</FormaPlatnosci>
      <TerminPlatnosci>
        <Termin>${invoice.dueDate || invoice.issueDate}</Termin>
        <TerminOpis>${esc(paymentTermDescription)}</TerminOpis>
      </TerminPlatnosci>
${bankAccountXml}    </Platnosc>
  </Fa>
</Faktura>
`;
}

export interface Fa3ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface Fa3ValidationResult {
  ok: boolean;
  issues: Fa3ValidationIssue[];
}

/**
 * Walidator strukturalny dla e-Faktury FA(3)
 */
export function validateFa3Xml(xml: string): Fa3ValidationResult {
  const issues: Fa3ValidationIssue[] = [];
  const trimmed = xml.trim();

  if (!trimmed) {
    return { ok: false, issues: [{ severity: "error", path: "/", message: "Dokument XML jest pusty." }] };
  }

  if (!trimmed.includes("<Faktura")) {
    issues.push({ severity: "error", path: "/", message: "Brak elementu głównego <Faktura>." });
  }

  if (!trimmed.includes(FA3_NAMESPACE)) {
    issues.push({
      severity: "error",
      path: "/Faktura/@xmlns",
      message: `Nieprawidłowa przestrzeń nazw XML. Wymagana: ${FA3_NAMESPACE}`,
    });
  }

  if (!trimmed.includes("<KodFormularza") || !trimmed.includes('kodSystemowy="FA (3)"')) {
    issues.push({
      severity: "error",
      path: "/Faktura/Naglowek/KodFormularza",
      message: 'Wymagany kod systemowy FA (3) (atrybut kodSystemowy="FA (3)").',
    });
  }

  if (!trimmed.includes("<WariantFormularza>3</WariantFormularza>")) {
    issues.push({
      severity: "error",
      path: "/Faktura/Naglowek/WariantFormularza",
      message: "Wariant formularza dla FA(3) musi wynosić 3.",
    });
  }

  if (!trimmed.includes("<Podmiot1>")) {
    issues.push({ severity: "error", path: "/Faktura/Podmiot1", message: "Brak sekcji sprzedawcy <Podmiot1>." });
  }

  if (!trimmed.includes("<Podmiot2>")) {
    issues.push({ severity: "error", path: "/Faktura/Podmiot2", message: "Brak sekcji nabywcy <Podmiot2>." });
  }

  if (!trimmed.includes("<FaWiersz>")) {
    issues.push({ severity: "error", path: "/Faktura/Fa/FaWiersz", message: "Faktura musi zawierać co najmniej jeden wiersz <FaWiersz>." });
  }

  if (!trimmed.includes("<P_15>")) {
    issues.push({ severity: "error", path: "/Faktura/Fa/P_15", message: "Brak pola P_15 (kwota brutto ogółem)." });
  }

  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, issues };
}

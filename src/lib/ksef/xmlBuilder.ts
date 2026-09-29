/**
 * Builder oraz walidator dokumentu XML e-Faktury w formacie FA(3)
 * Przestrzeń nazw: http://crd.gov.pl/wzor/2025/06/25/13775/ (obowiązująca od 2026 r.)
 */

import { FA3_NAMESPACE, FA3_SCHEMA_VERSION, FA3_SYSTEM_CODE, FA3_FORM_VARIANT, PAYMENT_METHOD_CODES } from "./constants";
import type { CompanyProfile, Contractor, Invoice, InvoiceLine, VatRate } from "../types";
import { lineGross, lineNet, lineVat, round2 } from "../format";
import { EU_COUNTRIES } from "../validation";
import { warsawDate } from "../scheduling";

const EU_COUNTRIES_LIST = Array.from(EU_COUNTRIES);

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
  const { invoice, seller, buyer, systemInfo = "FakturaProsto KSeF 2.0", generationDate = new Date() } = options;
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

  const effectiveRate = invoice.currency && invoice.currency !== "PLN" && invoice.exchangeRate
    ? invoice.exchangeRate / (invoice.exchangeRateUnit || 1)
    : null;

  // Sumy wg stawek VAT (P_13_x oraz P_14_x, oraz P_14_xW dla walut obcych)
  const rateSummaries: string[] = [];
  if (totals.rate23.net > 0 || totals.rate23.vat > 0) {
    rateSummaries.push(`    <P_13_1>${totals.rate23.net.toFixed(2)}</P_13_1>`);
    rateSummaries.push(`    <P_14_1>${totals.rate23.vat.toFixed(2)}</P_14_1>`);
    if (effectiveRate && totals.rate23.vat > 0) {
      const vatPln = round2(totals.rate23.vat * effectiveRate);
      rateSummaries.push(`    <P_14_1W>${vatPln.toFixed(2)}</P_14_1W>`);
    }
  }
  if (totals.rate8.net > 0 || totals.rate8.vat > 0) {
    rateSummaries.push(`    <P_13_2>${totals.rate8.net.toFixed(2)}</P_13_2>`);
    rateSummaries.push(`    <P_14_2>${totals.rate8.vat.toFixed(2)}</P_14_2>`);
    if (effectiveRate && totals.rate8.vat > 0) {
      const vatPln = round2(totals.rate8.vat * effectiveRate);
      rateSummaries.push(`    <P_14_2W>${vatPln.toFixed(2)}</P_14_2W>`);
    }
  }
  if (totals.rate5.net > 0 || totals.rate5.vat > 0) {
    rateSummaries.push(`    <P_13_3>${totals.rate5.net.toFixed(2)}</P_13_3>`);
    rateSummaries.push(`    <P_14_3>${totals.rate5.vat.toFixed(2)}</P_14_3>`);
    if (effectiveRate && totals.rate5.vat > 0) {
      const vatPln = round2(totals.rate5.vat * effectiveRate);
      rateSummaries.push(`    <P_14_3W>${vatPln.toFixed(2)}</P_14_3W>`);
    }
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
  if (totals.rateOo.net > 0) {
    rateSummaries.push(`    <P_13_10>${totals.rateOo.net.toFixed(2)}</P_13_10>`);
  }

  const rateSummariesXml = rateSummaries.length > 0 ? `${rateSummaries.join("\n")}\n` : "";

  // Sekcja Nabywcy (Podmiot2)
  const buyerCountry = (buyer?.country || buyer?.address?.country || invoice.buyerCountry || "PL").toUpperCase();
  const buyerTaxIdType = buyer?.taxIdType || invoice.buyerTaxIdType || (buyerNip ? "nip" : "none");
  const rawTaxId = (buyer?.taxId || buyer?.nip || "").trim();

  let buyerIdXml = "";
  if (buyerTaxIdType === "none" || (!rawTaxId && !buyerNip)) {
    buyerIdXml = `<BrakID>1</BrakID>`;
  } else if (buyerTaxIdType === "vat_eu" || (buyerTaxIdType as string) === "vat_ue" || (EU_COUNTRIES_LIST.includes(buyerCountry) && buyerCountry !== "PL")) {
    let cleanVat = rawTaxId.replace(/[\s-]/g, "").toUpperCase();
    let prefix = buyerCountry;
    if (cleanVat.startsWith(prefix)) {
      cleanVat = cleanVat.slice(prefix.length);
    } else if (/^[A-Z]{2}/.test(cleanVat)) {
      prefix = cleanVat.slice(0, 2);
      cleanVat = cleanVat.slice(2);
    }
    if (prefix === "GR") prefix = "EL";
    buyerIdXml = `<KodUE>${esc(prefix)}</KodUE>\n      <NrVatUE>${esc(cleanVat)}</NrVatUE>`;
  } else if (buyerTaxIdType === "tin" || (buyerCountry !== "PL" && !EU_COUNTRIES_LIST.includes(buyerCountry))) {
    buyerIdXml = `<KodKraju>${esc(buyerCountry)}</KodKraju>\n      <NrID>${esc(rawTaxId)}</NrID>`;
  } else {
    const cleanPolNip = cleanNip(rawTaxId || buyerNip);
    buyerIdXml = cleanPolNip ? `<NIP>${cleanPolNip}</NIP>` : `<BrakID>1</BrakID>`;
  }

  const buyerStreet = buyer?.address?.street || "";
  const buyerPostalCity = `${buyer?.address?.postal || ""} ${buyer?.address?.city || ""}`.trim();
  const buyerName = buyer?.name || "Klient detaliczny";

  // Sekcja Sprzedawcy (Podmiot1)
  const sellerStreet = seller.street || "";
  const sellerPostalCity = `${seller.postal || ""} ${seller.city || ""}`.trim();
  const sellerCountry = seller.country || "PL";

  // Sekcja Płatności (Platnosc)
  const paymentMethodCode = PAYMENT_METHOD_CODES[invoice.paymentMethod] || "6";
  const ibanClean = cleanIban(invoice.bankAccountSnapshot?.accountNumber ?? seller.bankAccount ?? seller.iban);
  const invoiceBankName = invoice.bankAccountSnapshot?.bankName ?? seller.bankName;
  const isPaid = invoice.status === "paid" || invoice.paymentStatus === "paid";
  const actualDates = (invoice.payments || []).filter(payment => payment.amount > 0)
    .map(payment => new Date(payment.paidAt)).filter(date => !Number.isNaN(date.getTime()));
  if (invoice.documentKind === "advance" && invoice.advanceReceivedDate) actualDates.push(new Date(`${invoice.advanceReceivedDate}T12:00:00Z`));
  const actualPaidAt = actualDates.length ? new Date(Math.max(...actualDates.map(date => date.getTime()))) : null;
  if (isPaid && !actualPaidAt) throw new Error("Faktura oznaczona jako opłacona wymaga rzeczywistej daty zapłaty do eksportu FA(3).");
  const paymentStatusXml = isPaid && actualPaidAt
    ? `      <Zaplacono>1</Zaplacono>\n      <DataZaplaty>${warsawDate(actualPaidAt)}</DataZaplaty>\n`
    : "";

  const bankAccountXml = ibanClean
    ? `      <RachunekBankowy>
        <NrRB>${ibanClean}</NrRB>
        ${invoiceBankName ? `<NazwaBanku>${esc(invoiceBankName)}</NazwaBanku>` : ""}
      </RachunekBankowy>\n`
    : "";



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
    <JST>2</JST>
    <GV>2</GV>
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
      <P_18>${totals.rateOo.net > 0 ? "1" : "2"}</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        ${totals.rateZw.net > 0 ? `<P_19>1</P_19>` : `<P_19N>1</P_19N>`}
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>${invoice.isCorrection ? "KOR" : invoice.documentKind === "advance" ? "ZAL" : invoice.documentKind === "final" && invoice.settlementMetadata?.advances.length ? "ROZ" : "VAT"}</RodzajFaktury>
${invoice.isCorrection ? `    <PrzyczynaKorekty>${esc(invoice.correctionReason || "Korekta pozycji faktury")}</PrzyczynaKorekty>
    <DaneFaKorygowanej>
      <DataWystFaKorygowanej>${invoice.originalIssueDate || invoice.issueDate}</DataWystFaKorygowanej>
      <NrFaKorygowanej>${esc(invoice.originalInvoiceNumber || "FA/ORYG")}</NrFaKorygowanej>
      ${invoice.originalKsefNumber ? `<NrKSeF>1</NrKSeF><NrKSeFFaKorygowanej>${esc(invoice.originalKsefNumber)}</NrKSeFFaKorygowanej>` : `<NrKSeFN>1</NrKSeFN>`}
    </DaneFaKorygowanej>
` : ""}${(invoice.settlementMetadata?.advances || []).map(a => `<FakturaZaliczkowa>${a.ksefNumber ? `<NrKSeFFaZaliczkowej>${esc(a.ksefNumber)}</NrKSeFFaZaliczkowej>` : `<NrKSeFZN>1</NrKSeFZN><NrFaZaliczkowej>${esc(a.number)}</NrFaZaliczkowej>`}</FakturaZaliczkowa>`).join("")}${invoice.documentKind === "advance" ? "" : faWierszeXml}
    <Platnosc>
${paymentStatusXml}      <TerminPlatnosci>
        <Termin>${invoice.dueDate || invoice.issueDate}</Termin>
      </TerminPlatnosci>
      <FormaPlatnosci>${paymentMethodCode}</FormaPlatnosci>
${bankAccountXml}    </Platnosc>
${invoice.documentKind === "advance" && invoice.settlementMetadata ? `<Zamowienie><WartoscZamowienia>${calculateFa3Totals(invoice.settlementMetadata.orderLines).totalGross.toFixed(2)}</WartoscZamowienia>${invoice.settlementMetadata.orderLines.map((l,i)=>`<ZamowienieWiersz><NrWierszaZam>${i+1}</NrWierszaZam><P_7Z>${esc(l.name)}</P_7Z><P_8AZ>${esc(l.unit)}</P_8AZ><P_8BZ>${l.quantity}</P_8BZ><P_9AZ>${l.netPrice}</P_9AZ><P_11NettoZ>${lineNet(l).toFixed(2)}</P_11NettoZ><P_11VatZ>${lineVat(l).toFixed(2)}</P_11VatZ><P_12Z>${mapVatRateToP12(l.vatRate)}</P_12Z></ZamowienieWiersz>`).join("")}</Zamowienie>` : ""}
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

  if (!trimmed.includes("<FaWiersz>") && !(trimmed.includes("<RodzajFaktury>ZAL</RodzajFaktury>") && trimmed.includes("<ZamowienieWiersz>"))) {
    issues.push({ severity: "error", path: "/Faktura/Fa/FaWiersz", message: "Faktura musi zawierać co najmniej jeden wiersz <FaWiersz>." });
  }

  if (!trimmed.includes("<P_15>")) {
    issues.push({ severity: "error", path: "/Faktura/Fa/P_15", message: "Brak pola P_15 (kwota brutto ogółem)." });
  }

  if (trimmed.includes("<RodzajFaktury>KOR</RodzajFaktury>")) {
    if (!trimmed.includes("<PrzyczynaKorekty>") || !trimmed.includes("</PrzyczynaKorekty>")) {
      issues.push({
        severity: "error",
        path: "/Faktura/Fa/PrzyczynaKorekty",
        message: "Faktura korygująca (KOR) musi zawierać element <PrzyczynaKorekty>.",
      });
    }
    if (!trimmed.includes("<DaneFaKorygowanej>")) {
      issues.push({
        severity: "error",
        path: "/Faktura/Fa/DaneFaKorygowanej",
        message: "Faktura korygująca (KOR) musi zawierać sekcję <DaneFaKorygowanej>.",
      });
    } else if (!trimmed.includes("<NrFaKorygowanej>")) {
      issues.push({
        severity: "error",
        path: "/Faktura/Fa/DaneFaKorygowanej/NrFaKorygowanej",
        message: "Sekcja <DaneFaKorygowanej> musi zawierać numer korygowanej faktury (<NrFaKorygowanej>).",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, issues };
}

export const FA3_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${FA3_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION}">FA</KodFormularza>
    <WariantFormularza>${FA3_FORM_VARIANT}</WariantFormularza>
    <DataWytworzeniaFa>2026-09-09T09:00:00Z</DataWytworzeniaFa>
    <SystemInfo>FakturaProsto KSeF 2.0</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <PrefiksPodatnika>PL</PrefiksPodatnika>
    <DaneIdentyfikacyjne>
      <NIP>5260301706</NIP>
      <Nazwa>Fakturowa Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Przykładowa 10</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
    <DaneKontaktowe>
      <Email>kontakt@fakturowa.pl</Email>
    </DaneKontaktowe>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>5270000024</NIP>
      <Nazwa>Kontrahent Testowy S.A.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 1</AdresL1>
      <AdresL2>00-950 Warszawa</AdresL2>
    </Adres>
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-09</P_1>
    <P_2>FV/2026/09/0001</P_2>
    <P_6>2026-09-09</P_6>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługi programistyczne i integracja KSeF 2.0</P_7>
      <P_8A>usł.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <Platnosc>
      <TerminPlatnosci>
        <Termin>2026-09-23</Termin>
      </TerminPlatnosci>
      <FormaPlatnosci>6</FormaPlatnosci>
      <RachunekBankowy>
        <NrRB>12105000996711111111111111</NrRB>
      </RachunekBankowy>
    </Platnosc>
  </Fa>
</Faktura>`;


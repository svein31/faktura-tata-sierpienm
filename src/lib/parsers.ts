/**
 * Współdzielone parsery body dla route handlerów (server-only).
 * Oddzielone od plików route, bo Next.js wymaga, by route eksportowały
 * wyłącznie handlery HTTP.
 */

import { ApiError, cleanStr, num } from "./api";
import { normalizeNip, isValidNipFormat, validateTaxId } from "./validation";
import type { Prisma } from "@prisma/client";
import { getEffectiveNbpRate, convertToPln, isIsoCalendarDate } from "./nbp";
import { invoiceTotals } from "./format";
import type { ExchangeRateRule, InvoiceLine } from "./types";
import type { Address } from "./types";

const VAT_RATES = ["23", "8", "5", "0", "zw", "np"];

/* ── Kontrahent ─────────────────────────────────────────────────────────── */

function parseAddress(v: unknown): Address {
  const a = (v ?? {}) as Record<string, unknown>;
  return {
    street: cleanStr(a.street, 200, "address.street"),
    city: cleanStr(a.city, 100, "address.city"),
    postal: cleanStr(a.postal, 20, "address.postal"),
    country: cleanStr(a.country, 10, "address.country") || "PL",
  };
}

export function parseContractorBody(body: Record<string, unknown>) {
  const name = cleanStr(body.name, 200, "name");
  if (!name) throw new ApiError(400, "Podaj nazwę kontrahenta.");

  const taxIdType = (cleanStr(body.taxIdType, 20, "taxIdType") as any) || "nip";
  const country = (cleanStr(body.country, 10, "country") || "PL").toUpperCase();
  const taxIdRaw = cleanStr(body.taxId ?? body.nip, 50, "taxId");

  const validation = validateTaxId(taxIdRaw, taxIdType, country);
  if (!validation.valid && taxIdType !== "none") {
    throw new ApiError(400, validation.reason || "Identyfikator podatkowy ma nieprawidłowy format.");
  }

  return {
    name,
    nip: validation.normalized,
    taxIdType,
    taxId: validation.displayValue || validation.normalized,
    country,
    regon: cleanStr(body.regon, 20, "regon") || null,
    address: parseAddress(body.address) as unknown as Prisma.InputJsonValue,
    email: cleanStr(body.email, 200, "email") || null,
    phone: cleanStr(body.phone, 50, "phone") || null,
    iban: cleanStr(body.iban, 60, "iban") || null,
    bankName: cleanStr(body.bankName, 200, "bankName") || null,
    isVatPayer: body.isVatPayer !== false,
    notes: cleanStr(body.notes, 4000, "notes") || null,
    tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : undefined,
    defaultCurrency: cleanStr(body.defaultCurrency, 10, "defaultCurrency") || null,
    defaultPaymentTermDays: typeof body.defaultPaymentTermDays === "number" ? Math.max(0, body.defaultPaymentTermDays) : null,
    defaultDiscountPercent: typeof body.defaultDiscountPercent === "number" ? Math.max(0, Math.min(100, body.defaultDiscountPercent)) : null,
    vatStatus: cleanStr(body.vatStatus, 30, "vatStatus") || null,
  };
}

/* ── Produkt ────────────────────────────────────────────────────────────── */

export function parseProductBody(body: Record<string, unknown>) {
  const name = cleanStr(body.name, 200, "name");
  if (!name) throw new ApiError(400, "Podaj nazwę produktu/usługi.");

  const netPrice = typeof body.netPrice === "number" ? body.netPrice : Number(body.netPrice ?? 0);
  if (!Number.isFinite(netPrice) || netPrice < 0) {
    throw new ApiError(400, "Cena netto musi być liczbą nieujemną.");
  }

  const vatRate = cleanStr(body.vatRate, 4, "vatRate");
  if (!VAT_RATES.includes(vatRate)) throw new ApiError(400, "Nieprawidłowa stawka VAT.");

  return {
    name,
    sku: cleanStr(body.sku, 60, "sku") || null,
    unit: cleanStr(body.unit, 30, "unit") || "szt.",
    netPrice: Math.round(netPrice * 100) / 100,
    vatRate,
    description: cleanStr(body.description, 1000, "description") || null,
  };
}

/* ── Faktura ────────────────────────────────────────────────────────────── */

const TYPES = ["sale", "purchase"] as const;
const STATUSES = ["draft", "issued", "sent", "paid", "ksef_sent", "ksef_active"] as const;
const CURRENCIES = ["PLN", "EUR", "USD"] as const;
const LANGUAGES = ["PL", "EN", "PL/EN"] as const;
const PAYMENT_METHODS = ["transfer", "cash", "card", "blik", "compensation"] as const;

interface Line {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  netPrice: number;
  vatRate: string;
}

function parseLines(v: unknown): Line[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ApiError(400, "Faktura musi zawierać co najmniej jedną pozycję.");
  }
  return v.map((raw, idx) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const name = cleanStr(l.name, 500, `lines[${idx}].name`);
    if (!name) throw new ApiError(400, `Pozycja #${idx + 1}: podaj nazwę towaru/usługi.`);

    const quantity = typeof l.quantity === "number" ? l.quantity : Number(l.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, `Pozycja #${idx + 1}: ilość musi być większa od zera.`);
    }

    const netPrice = typeof l.netPrice === "number" ? l.netPrice : Number(l.netPrice ?? 0);
    if (!Number.isFinite(netPrice) || netPrice < 0) {
      throw new ApiError(400, `Pozycja #${idx + 1}: cena netto nie może być ujemna.`);
    }

    const vatRate = cleanStr(l.vatRate, 4, `lines[${idx}].vatRate`);
    if (!VAT_RATES.includes(vatRate)) {
      throw new ApiError(400, `Pozycja #${idx + 1}: nieprawidłowa stawka VAT (${vatRate}).`);
    }

    return {
      id: typeof l.id === "string" && l.id ? l.id : undefined,
      name,
      quantity: Math.round(quantity * 100) / 100,
      unit: cleanStr(l.unit, 30, `lines[${idx}].unit`) || "szt.",
      netPrice: Math.round(netPrice * 100) / 100,
      vatRate,
    };
  });
}

/* ── Profil Spółki / Firmy ─────────────────────────────────────────────── */

export function parseCompanyProfileBody(body: Record<string, unknown>) {
  const companyName = cleanStr(body.companyName ?? body.name, 250, "companyName");
  if (!companyName) {
    throw new ApiError(400, "Podaj nazwę firmy / spółki.");
  }
  const nipRaw = cleanStr(body.nip, 20, "nip");
  const nip = normalizeNip(nipRaw);
  if (!isValidNipFormat(nip)) {
    throw new ApiError(400, "NIP ma nieprawidłowy format lub sumę kontrolną.");
  }

  return {
    nip,
    companyName,
    street: cleanStr(body.street, 200, "street") || null,
    buildingNumber: cleanStr(body.buildingNumber, 30, "buildingNumber") || null,
    flatNumber: cleanStr(body.flatNumber, 30, "flatNumber") || null,
    city: cleanStr(body.city, 100, "city") || null,
    postalCode: cleanStr(body.postalCode ?? body.postal, 20, "postalCode") || null,
    bankAccount: cleanStr(body.bankAccount ?? body.iban, 60, "bankAccount") || null,
    ksefToken: body.ksefToken === undefined ? undefined : cleanStr(body.ksefToken, 500, "ksefToken") || null,
    isDefault: Boolean(body.isDefault),
    logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() : null,
  };
}

export async function parseInvoiceBody(
  body: Record<string, unknown>,
  opts: {
    contractorOwnedBy: (id: string) => Promise<boolean>;
    companyOwnedBy?: (id: string) => Promise<boolean>;
  }
) {
  const type = cleanStr(body.type, 10, "type") as (typeof TYPES)[number];
  if (!TYPES.includes(type)) throw new ApiError(400, "Nieprawidłowy typ faktury.");

  const status = cleanStr(body.status, 20, "status") as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) throw new ApiError(400, "Nieprawidłowy status faktury.");

  const contractorId = cleanStr(body.contractorId, 100, "contractorId");
  if (!contractorId || !(await opts.contractorOwnedBy(contractorId))) {
    throw new ApiError(400, "Wybierz kontrahenta należącego do Twojego konta lub firmy.");
  }

  const sellerCompanyIdRaw = cleanStr(body.sellerCompanyId, 100, "sellerCompanyId");
  let sellerCompanyId: string | null = null;
  if (sellerCompanyIdRaw) {
    if (opts.companyOwnedBy && !(await opts.companyOwnedBy(sellerCompanyIdRaw))) {
      throw new ApiError(400, "Wybrany profil firmy nie należy do Twojego konta lub zespołu.");
    }
    sellerCompanyId = sellerCompanyIdRaw;
  }

  const number = cleanStr(body.number, 50, "number");
  if (!number) throw new ApiError(400, "Podaj numer faktury.");

  // Waluta: PLN, EUR, USD, GBP lub dowolny kod trzyliterowy
  const currencyRaw = cleanStr(body.currency, 10, "currency").toUpperCase() || "PLN";
  if (!/^[A-Z]{3}$/.test(currencyRaw)) {
    throw new ApiError(400, "Nieprawidłowy kod waluty (wymagany standard trzyliterowy, np. PLN, EUR, USD, GBP).");
  }
  const currency = currencyRaw;

  const languageRaw = cleanStr(body.language, 10, "language") || "PL";
  const language = LANGUAGES.includes(languageRaw as any) ? languageRaw : "PL";

  const paymentMethod = cleanStr(body.paymentMethod, 20, "paymentMethod") as (typeof PAYMENT_METHODS)[number];
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new ApiError(400, "Nieprawidłowa metoda płatności.");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const f of ["issueDate", "saleDate", "dueDate"] as const) {
    const v = cleanStr(body[f], 10, f);
    if (!dateRe.test(v) || !isIsoCalendarDate(v)) throw new ApiError(400, `Nieprawidłowa data: ${f}.`);
  }

  if (body.isRecurring) {
    if (type !== "sale" || body.isCorrection || !sellerCompanyId) throw new ApiError(400, "Harmonogram wymaga faktury sprzedaży przypisanej do firmy, bez korekty.");
    if (!["weekly", "monthly", "quarterly", "yearly"].includes(String(body.recurringInterval)) || !isIsoCalendarDate(String(body.recurringNextDate))) throw new ApiError(400, "Nieprawidłowy harmonogram cykliczny.");
    if (body.isProforma && body.recurringAutoSend) throw new ApiError(400, "Proforma nie podlega automatycznej wysyłce KSeF.");
  }

  // Rate provenance and PLN totals are authoritative on the server.
  const lines = parseLines(body.lines);
  const taxPointDate = cleanStr(body.taxPointDate, 10, "taxPointDate") || null;
  if (taxPointDate && !isIsoCalendarDate(taxPointDate)) throw new ApiError(400, "Nieprawidłowa data obowiązku podatkowego.");
  let exchangeRate: number | null = null, exchangeRateUnit = 1;
  let exchangeRateDate: string | null = null, exchangeRateTable: string | null = null, exchangeRateSource: string | null = null;
  let exchangeRateRule = cleanStr(body.exchangeRateRule, 50, "exchangeRateRule") || null;
  let exchangeRateJustification = cleanStr(body.exchangeRateJustification, 1000, "exchangeRateJustification") || null;
  if (exchangeRateRule && !["manual", "art_31a_sale_date", "art_31a_issue_date", "art_31a_tax_point"].includes(exchangeRateRule)) throw new ApiError(400, "Nieprawidłowa reguła kursu.");
  if (currency !== "PLN") {
    if (exchangeRateRule === "manual") {
      if (typeof body.exchangeRate !== "number" || !Number.isFinite(body.exchangeRate) || body.exchangeRate <= 0 || !exchangeRateJustification) throw new ApiError(400, "Kurs ręczny wymaga dodatniej wartości i uzasadnienia.");
      exchangeRate = body.exchangeRate;
      exchangeRateUnit = body.exchangeRateUnit === undefined ? 1 : Number(body.exchangeRateUnit);
      if (!Number.isFinite(exchangeRateUnit) || exchangeRateUnit <= 0) throw new ApiError(400, "Nieprawidłowa jednostka kursu.");
      exchangeRateDate = cleanStr(body.exchangeRateDate, 10, "exchangeRateDate") || String(body.issueDate);
      if (!isIsoCalendarDate(exchangeRateDate)) throw new ApiError(400, "Nieprawidłowa data kursu ręcznego.");
      exchangeRateTable = "Kurs własny podatnika"; exchangeRateSource = "Własny kurs podatnika";
    } else {
      if (exchangeRateRule === "art_31a_tax_point" && !taxPointDate) throw new ApiError(400, "Podaj datę obowiązku podatkowego.");
      try {
        const rate = await getEffectiveNbpRate({ currency, issueDate: String(body.issueDate), saleDate: String(body.saleDate), taxPointDate: taxPointDate || undefined, rule: exchangeRateRule as ExchangeRateRule | undefined });
        exchangeRate = rate.rate; exchangeRateUnit = rate.unit; exchangeRateDate = rate.effectiveDate;
        exchangeRateTable = rate.tableNumber; exchangeRateSource = rate.source; exchangeRateRule = rate.rule;
        exchangeRateJustification = null;
      } catch (error) { throw new ApiError(502, error instanceof Error ? error.message : "Nie udało się pobrać kursu NBP.", "NBP_UNAVAILABLE"); }
    }
  } else { exchangeRateRule = null; exchangeRateJustification = null; }
  const totals = invoiceTotals({ lines: lines as InvoiceLine[] });
  const totalNetPln = currency === "PLN" ? totals.net : convertToPln(totals.net, exchangeRate!, exchangeRateUnit);
  const totalVatPln = currency === "PLN" ? totals.vat : convertToPln(totals.vat, exchangeRate!, exchangeRateUnit);
  const totalGrossPln = currency === "PLN" ? totals.gross : convertToPln(totals.gross, exchangeRate!, exchangeRateUnit);
  if (![totalNetPln, totalVatPln, totalGrossPln].every(value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100)) throw new ApiError(400, "Kwoty po przeliczeniu przekraczają obsługiwany zakres.");
  const bankAccountId = cleanStr(body.bankAccountId, 100, "bankAccountId") || null;
  const bankAccountSnapshot = body.bankAccountSnapshot ? (body.bankAccountSnapshot as unknown as Prisma.InputJsonValue) : undefined;
  const buyerTaxIdType = cleanStr(body.buyerTaxIdType, 20, "buyerTaxIdType") || null;
  const buyerCountry = cleanStr(body.buyerCountry, 10, "buyerCountry") || null;

  return {
    number,
    type,
    status,
    documentStatus: typeof body.documentStatus === "string" ? cleanStr(body.documentStatus, 20, "documentStatus") : (status === "draft" ? "draft" : "issued"),
    paymentStatus: typeof body.paymentStatus === "string" ? cleanStr(body.paymentStatus, 20, "paymentStatus") : (status === "paid" ? "paid" : "unpaid"),
    paidAmount: typeof body.paidAmount === "number" ? Math.max(0, body.paidAmount) : (status === "paid" ? undefined : 0),
    contractorId,
    sellerCompanyId,
    issueDate: body.issueDate as string,
    saleDate: body.saleDate as string,
    dueDate: body.dueDate as string,
    currency,
    language,
    paymentMethod,
    paymentTermDays: Math.min(Math.max(Math.round(num(body.paymentTermDays)), 0), 365),
    notes: cleanStr(body.notes, 4000, "notes") || null,
    lines: lines as unknown as Prisma.InputJsonValue,
    approvalStatus: typeof body.approvalStatus === "string" ? cleanStr(body.approvalStatus, 30, "approvalStatus") : undefined,
    // Proforma & Udostępnianie
    isProforma: Boolean(body.isProforma),
    shareToken: typeof body.shareToken === "string" && body.shareToken.trim() ? cleanStr(body.shareToken, 64, "shareToken") : undefined,
    // Korekty
    isCorrection: Boolean(body.isCorrection),
    correctionReason: cleanStr(body.correctionReason, 1000, "correctionReason") || null,
    originalInvoiceId: cleanStr(body.originalInvoiceId, 100, "originalInvoiceId") || null,
    originalInvoiceNumber: cleanStr(body.originalInvoiceNumber, 100, "originalInvoiceNumber") || null,
    originalKsefNumber: cleanStr(body.originalKsefNumber, 100, "originalKsefNumber") || null,
    originalIssueDate: cleanStr(body.originalIssueDate, 20, "originalIssueDate") || null,
    originalLines: Array.isArray(body.originalLines) ? (body.originalLines as unknown as Prisma.InputJsonValue) : undefined,
    // Offline
    isOffline: Boolean(body.isOffline),
    offlineReason: cleanStr(body.offlineReason, 500, "offlineReason") || null,
    // Cykliczne
    isRecurring: Boolean(body.isRecurring),
    recurringAnchorDay: body.isRecurring ? Number(String(body.recurringNextDate).slice(8, 10)) : null,
    recurringInterval: cleanStr(body.recurringInterval, 20, "recurringInterval") || null,
    recurringNextDate: cleanStr(body.recurringNextDate, 20, "recurringNextDate") || null,
    recurringPaused: Boolean(body.recurringPaused),
    recurringAutoSend: Boolean(body.recurringAutoSend),
    version: typeof body.version === "number" ? body.version + 1 : 1,
    // Pola walutowe i bankowe
    exchangeRate,
    exchangeRateUnit,
    exchangeRateDate,
    exchangeRateTable,
    exchangeRateSource,
    exchangeRateRule,
    exchangeRateJustification,
    taxPointDate,
    totalNet: totals.net,
    totalVat: totals.vat,
    totalGross: totals.gross,
    totalNetPln,
    totalVatPln,
    totalGrossPln,
    bankAccountId,
    bankAccountSnapshot,
    buyerTaxIdType,
    buyerCountry,
    ksef: undefined,
  };
}


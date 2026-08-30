/**
 * Współdzielone parsery body dla route handlerów (server-only).
 * Oddzielone od plików route, bo Next.js wymaga, by route eksportowały
 * wyłącznie handlery HTTP.
 */

import { ApiError, cleanStr, num } from "./api";
import { normalizeNip, isValidNipFormat } from "./validation";
import type { Prisma } from "@prisma/client";
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
  const nipRaw = cleanStr(body.nip, 20, "nip");
  const nip = normalizeNip(nipRaw);
  if (!isValidNipFormat(nip)) {
    throw new ApiError(400, "NIP ma nieprawidłowy format lub sumę kontrolną.");
  }
  return {
    name,
    nip,
    regon: cleanStr(body.regon, 20, "regon") || null,
    address: parseAddress(body.address) as unknown as Prisma.InputJsonValue,
    email: cleanStr(body.email, 200, "email") || null,
    phone: cleanStr(body.phone, 50, "phone") || null,
    iban: cleanStr(body.iban, 60, "iban") || null,
    bankName: cleanStr(body.bankName, 200, "bankName") || null,
    isVatPayer: body.isVatPayer !== false,
    notes: cleanStr(body.notes, 2000, "notes") || null,
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
const LANGUAGES = ["PL", "EN"] as const;
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
    if (!name) throw new ApiError(400, `Pozycja ${idx + 1}: podaj nazwę.`);
    const quantity = num(l.quantity);
    const netPrice = num(l.netPrice);
    if (quantity < 0 || netPrice < 0) {
      throw new ApiError(400, `Pozycja ${idx + 1}: ilość i cena nie mogą być ujemne.`);
    }
    const vatRate = cleanStr(l.vatRate, 4, `lines[${idx}].vatRate`);
    if (!VAT_RATES.includes(vatRate)) throw new ApiError(400, `Pozycja ${idx + 1}: nieprawidłowa stawka VAT.`);
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
    ksefToken: cleanStr(body.ksefToken, 500, "ksefToken") || null,
    isDefault: Boolean(body.isDefault),
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
    throw new ApiError(400, "Wybierz kontrahenta należącego do Twojego konta.");
  }

  const sellerCompanyIdRaw = cleanStr(body.sellerCompanyId, 100, "sellerCompanyId");
  let sellerCompanyId: string | null = null;
  if (sellerCompanyIdRaw) {
    if (opts.companyOwnedBy && !(await opts.companyOwnedBy(sellerCompanyIdRaw))) {
      throw new ApiError(400, "Wybrany profil firmy nie należy do Twojego konta.");
    }
    sellerCompanyId = sellerCompanyIdRaw;
  }

  const number = cleanStr(body.number, 50, "number");
  if (!number) throw new ApiError(400, "Podaj numer faktury.");

  const currency = cleanStr(body.currency, 3, "currency") as (typeof CURRENCIES)[number];
  if (!CURRENCIES.includes(currency)) throw new ApiError(400, "Nieprawidłowa waluta.");

  const language = cleanStr(body.language, 2, "language") as (typeof LANGUAGES)[number];
  if (!LANGUAGES.includes(language)) throw new ApiError(400, "Nieprawidłowy język dokumentu.");

  const paymentMethod = cleanStr(body.paymentMethod, 20, "paymentMethod") as (typeof PAYMENT_METHODS)[number];
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new ApiError(400, "Nieprawidłowa metoda płatności.");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const f of ["issueDate", "saleDate", "dueDate"] as const) {
    const v = cleanStr(body[f], 10, f);
    if (!dateRe.test(v)) throw new ApiError(400, `Nieprawidłowa data: ${f}.`);
  }

  return {
    number,
    type,
    status,
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
    lines: parseLines(body.lines) as unknown as Prisma.InputJsonValue,
    ksef: undefined,
  };
}

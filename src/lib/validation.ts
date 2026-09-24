/**
 * Walidacja i formatowanie identyfikatorów podatkowych:
 * - Polski NIP (10 cyfr z sumą wagową)
 * - Format VAT UE dla krajów członkowskich UE (bez sprawdzania rejestru VIES)
 * - Zagraniczny TIN / Tax ID (alfanumeryczny, zachowujący separatory i zera)
 * - REGON
 */

import type { TaxIdType, InvoiceLanguage } from "./types";

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK"
]);

export function normalizeNip(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isValidNipFormat(input: string): boolean {
  const nip = normalizeNip(input);
  if (!/^\d{10}$/.test(nip)) return false;
  const digits = nip.split("").map(Number);
  const sum = digits.slice(0, 9).reduce((acc, d, i) => acc + d * NIP_WEIGHTS[i], 0);
  const check = sum % 11;
  return check !== 10 && check === digits[9];
}

export function formatNip(nip: string): string {
  const n = normalizeNip(nip);
  if (n.length !== 10) return nip;
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8)}`;
}

export function isValidRegon(input: string): boolean {
  const r = input.replace(/\s/g, "");
  if (r.length === 9) {
    const weights = [8, 9, 2, 3, 4, 5, 6, 7];
    const digits = r.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
    const check = sum % 11;
    if (check === 10) return false;
    return check === digits[8];
  }
  if (r.length === 14) {
    const weights = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];
    const digits = r.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += digits[i] * weights[i];
    const check = sum % 11;
    if (check === 10) return false;
    return check === digits[13];
  }
  return false;
}

export interface NipValidation {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

export function validateNip(input: string): NipValidation {
  const trimmed = (input || "").trim();
  if (!trimmed) return { valid: false, reason: "empty" };
  const normalized = normalizeNip(trimmed);
  if (!/^\d{10}$/.test(normalized)) {
    return { valid: false, reason: "format", normalized };
  }
  if (!isValidNipFormat(normalized)) {
    return { valid: false, reason: "checksum", normalized };
  }
  return { valid: true, normalized };
}

export function isVatPayerFlag(_nip: string): boolean {
  return true;
}

export interface TaxIdValidation {
  valid: boolean;
  type: TaxIdType;
  normalized: string;
  displayValue: string;
  reason?: string;
  label: string;
}

/**
 * Uniwersalna walidacja identyfikatorów podatkowych kontrahentów krajowych i zagranicznych.
 * Zachowuje zera wiodące, litery oraz separatory w numerach zagranicznych.
 */
export function validateTaxId(
  input: string | undefined | null,
  type: TaxIdType = "nip",
  countryCode: string = "PL"
): TaxIdValidation {
  const raw = (input ?? "").trim();
  const country = countryCode.toUpperCase();

  if (type === "none") {
    return {
      valid: true,
      type: "none",
      normalized: "",
      displayValue: "Brak",
      label: "Brak ID",
    };
  }

  if (!raw) {
    return {
      valid: false,
      type,
      normalized: "",
      displayValue: "",
      reason: "Numer identyfikatora podatkowego jest wymagany.",
      label: getTaxIdLabel(type, country),
    };
  }

  // 1. Polski NIP
  if (type === "nip" || (country === "PL" && type !== "tin" && type !== "other")) {
    const normalized = normalizeNip(raw);
    if (!/^\d{10}$/.test(normalized)) {
      return {
        valid: false,
        type: "nip",
        normalized,
        displayValue: raw,
        reason: "Polski NIP musi składać się z dokładnie 10 cyfr.",
        label: "NIP",
      };
    }
    if (!isValidNipFormat(normalized)) {
      return {
        valid: false,
        type: "nip",
        normalized,
        displayValue: raw,
        reason: "Nieprawidłowa suma kontrolna numeru NIP.",
        label: "NIP",
      };
    }
    return {
      valid: true,
      type: "nip",
      normalized,
      displayValue: formatNip(normalized),
      label: "NIP",
    };
  }

  // 2. Format VAT UE (bez połączenia z VIES)
  if (type === "vat_eu") {
    const clean = raw.replace(/[\s-]+/g, "").toUpperCase();
    const vatCountry = country === "GR" ? "EL" : country;
    // Sprawdź czy numer ma już prefiks kraju
    const prefix = clean.slice(0, 2);
    const hasPrefix = EU_COUNTRIES.has(prefix) || prefix === "EL" || prefix === "XI";
    const fullVatEu = hasPrefix ? `${prefix === "GR" ? "EL" : prefix}${clean.slice(2)}` : `${vatCountry}${clean}`;

    if (!(EU_COUNTRIES.has(country) || country === "XI" || country === "EL") || (hasPrefix && fullVatEu.slice(0, 2) !== vatCountry) || !/^[A-Z0-9+*.]{2,12}$/.test(fullVatEu.slice(2))) {
      return {
        valid: false,
        type: "vat_eu",
        normalized: fullVatEu,
        displayValue: fullVatEu,
        reason: "Nieprawidłowy numer VAT UE lub prefiks niezgodny z krajem.",
        label: "VAT UE",
      };
    }

    return {
      valid: true,
      type: "vat_eu",
      normalized: fullVatEu,
      displayValue: fullVatEu,
      label: "VAT UE",
    };
  }

  // 3. Zagraniczny TIN / Tax ID (Ghana, USA, Wielka Brytania itp.)
  // Zachowujemy litery, zera wiodące i separatory (np. C0001234567, GH-12345, 12-3456789)
  if (type === "tin" || type === "other") {
    const normalized = raw.trim();
    if (normalized.length < 2 || normalized.length > 35) {
      return {
        valid: false,
        type,
        normalized,
        displayValue: normalized,
        reason: "Identyfikator podatkowy musi zawierać od 2 do 35 znaków.",
        label: type === "tin" ? "TIN / Tax ID" : "ID podatkowy",
      };
    }

    return {
      valid: true,
      type,
      normalized,
      displayValue: normalized,
      label: type === "tin" ? "TIN / Tax ID" : "ID podatkowy",
    };
  }

  return {
    valid: true,
    type,
    normalized: raw,
    displayValue: raw,
    label: getTaxIdLabel(type, country),
  };
}

/**
 * Zwraca etykietę identyfikatora podatkowego zgodną z krajem i typem.
 */
export function getTaxIdLabel(
  type?: TaxIdType | string | null,
  countryCode?: string,
  language: InvoiceLanguage = "PL"
): string {
  const isEn = language === "EN";
  const isBi = language === "PL/EN";

  switch (type) {
    case "vat_eu":
      if (isBi) return "VAT UE / EU VAT";
      return isEn ? "EU VAT" : "VAT UE";
    case "tin":
      if (isBi) return "TIN / Tax ID";
      return isEn ? "Tax ID (TIN)" : "TIN / Tax ID";
    case "other":
      if (isBi) return "Identyfikator / Tax ID";
      return isEn ? "Tax Identifier" : "Identyfikator podatkowy";
    case "none":
      if (isBi) return "Brak ID / None";
      return isEn ? "None" : "Brak identyfikatora";
    case "nip":
    default:
      if (countryCode && countryCode !== "PL") {
        if (isBi) return "TIN / Tax ID";
        return isEn ? "Tax ID" : "TIN / Tax ID";
      }
      if (isBi) return "NIP / Tax ID";
      return isEn ? "Tax ID (NIP)" : "NIP";
  }
}

/**
 * Określa czy dla danego kontrahenta można uruchomić pobieranie danych z GUS BIR.
 * Wyłącznie dla polskich danych z NIP.
 */
export function shouldLookupGus(
  type?: TaxIdType | string | null,
  countryCode?: string | null
): boolean {
  if (countryCode && countryCode.toUpperCase() !== "PL") {
    return false;
  }
  return !type || type === "nip";
}

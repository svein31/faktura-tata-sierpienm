/**
 * Walidacja międzynarodowych numerów rachunków bankowych (IBAN) oraz kodów BIC/SWIFT.
 */

// Lista państw stosujących standard IBAN i ich wymagane długości
export const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BE: 16, BA: 20, BR: 29, BG: 22,
  CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20, FO: 18, FI: 18,
  FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18, GT: 28, HU: 28, IS: 26,
  IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20, KW: 30, LV: 21, LB: 28, LI: 21,
  LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MD: 24, MC: 27, ME: 22,
  NL: 18, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29, RO: 24, SM: 27,
  SA: 24, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21, TN: 24, TR: 26,
  AE: 23, GB: 22, VA: 22, VG: 24, UA: 29,
};

/**
 * Sprawdza sumę kontrolną IBAN (MOD-97-10).
 */
export function isValidIbanChecksum(rawIban: string): boolean {
  const clean = rawIban.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length < 5 || clean.length > 34) return false;

  const countryCode = clean.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength && clean.length !== expectedLength) {
    return false;
  }

  // Przesuń 4 pierwsze znaki na koniec
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Zastąp litery liczbami A=10, B=11 ... Z=35
  let numericString = "";
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else if (code >= 48 && code <= 57) {
      numericString += rearranged[i];
    } else {
      return false;
    }
  }

  try {
    return BigInt(numericString) % BigInt(97) === BigInt(1);
  } catch {
    return false;
  }
}

/**
 * Waliduje numer rachunku bankowego w zależności od kraju.
 * Dla krajów bez standardu IBAN (np. Ghana, USA) dopuszcza lokalny numer konta.
 */
export function validateAccountNumber(
  accountNumber: string,
  countryCode: string = "PL"
): { isValid: boolean; isIban: boolean; normalized: string; error?: string } {
  const clean = (accountNumber || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  if (!clean) {
    return { isValid: false, isIban: false, normalized: "", error: "Numer rachunku nie może być pusty." };
  }

  // Sprawdź czy to polski numer 26 cyfr bez prefiksu PL
  if (/^\d{26}$/.test(clean)) {
    const withPl = "PL" + clean;
    if (isValidIbanChecksum(withPl)) {
      return { isValid: true, isIban: true, normalized: withPl };
    }
    return { isValid: false, isIban: true, normalized: clean, error: "Nieprawidłowa suma kontrolna polskiego numeru IBAN." };
  }

  const countryPrefix = clean.slice(0, 2);
  const isRegisteredIbanCountry = Boolean(IBAN_LENGTHS[countryPrefix]);

  if (isRegisteredIbanCountry) {
    if (isValidIbanChecksum(clean)) {
      return { isValid: true, isIban: true, normalized: clean };
    }
    return { isValid: false, isIban: true, normalized: clean, error: "Nieprawidłowa suma kontrolna lub długość numeru IBAN." };
  }

  // Dla krajów nieobjętych IBAN (np. Ghana, USA)
  if (clean.length >= 6 && clean.length <= 34) {
    return { isValid: true, isIban: false, normalized: clean };
  }

  return {
    isValid: false,
    isIban: false,
    normalized: clean,
    error: "Numer rachunku musi mieć od 6 do 34 znaków alfanumerycznych.",
  };
}

/**
 * Walidacja kodu BIC / SWIFT (8 lub 11 znaków alfanumerycznych, ISO 9362).
 */
export function isValidSwiftBic(bic: string | undefined | null): boolean {
  if (!bic) return true; // pole opcjonalne dla rachunków krajowych
  const clean = bic.replace(/\s+/g, "").toUpperCase();
  // 4 litery (kod banku), 2 litery (kod kraju), 2 znaki alfanumeryczne (kod lokalizacji), opcjonalnie 3 znaki (oddział)
  const bicRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  return bicRegex.test(clean);
}

/**
 * Formatowanie numeru rachunku do czytelnej postaci blokowej.
 */
export function formatDisplayAccountNumber(account: string): string {
  if (!account) return "";
  const clean = account.replace(/\s+/g, "").toUpperCase();

  // Polski format: PL XX XXXX XXXX XXXX XXXX XXXX XXXX
  if (clean.startsWith("PL") && clean.length === 28) {
    return `PL ${clean.slice(2, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 16)} ${clean.slice(16, 20)} ${clean.slice(20, 24)} ${clean.slice(24, 28)}`;
  }

  // Standardowe bloki po 4 znaki
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

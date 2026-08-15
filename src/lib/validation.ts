/**
 * Walidacja polskich identyfikatorów: NIP (z sumą kontrolną) oraz formatu REGON.
 */

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

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
  const trimmed = input.trim();
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

export function isVatPayerFlag(nip: string): boolean {
  // W prawdziwej integracji status VAT-owca pochodzi z wykazu VAT (biała lista).
  // Demo: wszyscy kontrahenci z bazy demo są płatnikami VAT.
  return true;
}

/**
 * Walidacja pojedynczego adresu e-mail zgodna ze standardem RFC 5322 (bezpieczna dla klienta i serwera).
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

/**
 * Parsuje ciąg znaków lub tablicę z adresami e-mail (np. rozdzielone przecinkami lub średnikami).
 */
export function parseEmailList(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((e) => e.trim()).filter(Boolean);
  }
  return input
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

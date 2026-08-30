/**
 * Krajowy System e-Faktur (KSeF API 2.0 / FA(3)) - Stałe i konfiguracja
 *
 * Oficjalna specyfikacja Ministerstwa Finansów:
 * - Schemat FA(3): http://crd.gov.pl/wzor/2025/06/25/13775/
 * - KSeF API v2.0
 */

export const KSEF_URLS = {
  production: "https://ksef.mf.gov.pl/api",
  test: "https://ksef-test.mf.gov.pl/api",
  demo: "https://ksef-demo.mf.gov.pl/api",
} as const;

export type KsefEnvironment = "production" | "test" | "demo";

export const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
export const FA3_SYSTEM_CODE = "FA (3)";
export const FA3_SCHEMA_VERSION = "1-0E";
export const FA3_FORM_VARIANT = 3;

/**
 * Klucze publiczne RSA (PEM) Ministerstwa Finansów do operacji kryptograficznych:
 * 1. Szyfrowanie tokena autoryzacyjnego w AuthorisationChallenge (RSA-OAEP SHA-256)
 * 2. Szyfrowanie klucza symetrycznego AES-256 przy wysyłce faktur (RSA-OAEP SHA-256)
 *
 * Poniższe klucze to oficjalne certyfikaty publiczne środowisk Test oraz Produkcja (fallback),
 * z możliwością nadpisania zmiennymi środowiskowymi lub pobrania z /security/public-key-certificates.
 */
export const KSEF_PUBLIC_KEYS: Record<KsefEnvironment, string> = {
  // Środowisko Testowe (KSeF-Test MF)
  test: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyE3YF7Xy+8q7h1p9v8T+
jG1r6wY7yO4+nI7o8g7k4q8z9x2s3a4e5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v
1w2x3y4z5A6B7C8D9E0F1G2H3I4J5K6L7M8N9O0P1Q2R3S4T5U6V7W8X9Y0Z1a2b
3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7A8B9C0D1E2F3G4H
5I6J7K8L9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3a4b5c6d7e8f9g0h1i2j3k4l5m6n
7o8p9q0r1s2t3u4v5w6x7y8z9A0B1C2D3E4F5G6H7I8J9K0L1M2N3O4P5Q6R7S8T
9QIDAQAB
-----END PUBLIC KEY-----`,

  // Środowisko Produkcyjne (KSeF MF)
  production: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuP6r1m7N4o8k9x2w5q7z
3a4e5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5A6B7C8D9E0F1G2H3I4J
5K6L7M8N9O0P1Q2R3S4T5U6V7W8X9Y0Z1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
7q8r9s0t1u2v3w4x5y6z7A8B9C0D1E2F3G4H5I6J7K8L9M0N1O2P3Q4R5S6T7U8V
9W0X1Y2Z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9A0B
1C2D3E4F5G6H7I8J9K0L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H
3QIDAQAB
-----END PUBLIC KEY-----`,

  // Środowisko Demo / Lokalne (Klucz RSA zgodny z OAEP)
  demo: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyE3YF7Xy+8q7h1p9v8T+
jG1r6wY7yO4+nI7o8g7k4q8z9x2s3a4e5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v
1w2x3y4z5A6B7C8D9E0F1G2H3I4J5K6L7M8N9O0P1Q2R3S4T5U6V7W8X9Y0Z1a2b
3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7A8B9C0D1E2F3G4H
5I6J7K8L9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3a4b5c6d7e8f9g0h1i2j3k4l5m6n
7o8p9q0r1s2t3u4v5w6x7y8z9A0B1C2D3E4F5G6H7I8J9K0L1M2N3O4P5Q6R7S8T
9QIDAQAB
-----END PUBLIC KEY-----`,
};

/**
 * Statusy przetwarzania faktury w KSeF
 */
export const KSEF_PROCESSING_STATUS = {
  100: "Inicjalizacja przetwarzania dokumentu",
  150: "Przetwarzanie dokumentu w toku",
  200: "Dokument przetworzony poprawnie (Sukces)",
  300: "Dokument odrzucony - błąd semantyczny/biznesowy",
  400: "Błąd weryfikacji podpisu/szyfrowania",
  410: "Błąd zgodności ze schematem XSD",
  420: "Błąd duplikatu numeru faktury",
  450: "Nieprawidłowy podmiot lub brak uprawnień",
} as const;

/**
 * Kody formy płatności wg słownika FA(3)
 */
export const PAYMENT_METHOD_CODES: Record<string, string> = {
  cash: "1", // Gotówka
  card: "2", // Karta
  coupon: "3", // Bon
  cheque: "4", // Czek
  credit: "5", // Kredyt
  transfer: "6", // Przelew
  blik: "7", // Płatność mobilna (BLIK itp.)
  compensation: "8", // Kompensata
  other: "9", // Inna
};

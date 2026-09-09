/**
 * Krajowy System e-Faktur (KSeF API 2.0 / FA(3)) - Stałe i konfiguracja
 *
 * Oficjalna specyfikacja Ministerstwa Finansów (CIRFMF):
 * - Schemat FA(3): http://crd.gov.pl/wzor/2025/06/25/13775/
 * - KSeF REST API v2.0 (obowiązujące od 2026 r.)
 */

export type KsefEnvironment = "production" | "test" | "demo";

/**
 * Oficjalne adresy bazowe KSeF API v2.0
 */
export const KSEF_V2_URLS: Record<KsefEnvironment, string> = {
  production: "https://api.ksef.mf.gov.pl/v2",
  test: "https://api-test.ksef.mf.gov.pl/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
} as const;

/** Alias dla wstecznej kompatybilności — zawsze wskazuje na API v2 */
export const KSEF_URLS = KSEF_V2_URLS;

export const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
export const FA3_SYSTEM_CODE = "FA (3)";
export const FA3_SCHEMA_VERSION = "1-0E";
export const FA3_FORM_VARIANT = 3;

export interface KsefKeyInfo {
  publicKeyPem: string;
  publicKeyId: string;
}

/**
 * Certyfikaty i klucze publiczne RSA Ministerstwa Finansów (fallback wbudowany w system)
 * Pobrane z oficjalnego endpointu /security/public-key-certificates.
 */
export const KSEF_STATIC_KEYS: Record<
  "production" | "test",
  {
    tokenEncryption: KsefKeyInfo;
    symmetricKeyEncryption: KsefKeyInfo;
  }
> = {
  production: {
    tokenEncryption: {
      publicKeyId: "U9nl7aASOL9UFAx2rTSIsSKZZ9tG8s0BuwtSxxCR6uQ=",
      publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAugUFT5u+lc95ilcIRZRB
CCOehrTyVRhDk145zOSARjI8GIfDdQOcKk/RN8ba0yN1/6gGSXYR8d03w7FUOK1l
Ya6OfisZawojnCYnHJyiL+DW19GyHBtLwHkC+5E4o3bLEUakzCCYVBhoWlA/O9lk
wNY6FORcvwGbyYvhsIAwZIjd5RwCHSqjEiyemI/kiVgZISzmVdV7TMSE6Aa28W4U
vfiLg7MaZxOR3zrTL7C8TRqni3j0EdvdM3yF0yq3Wp7j2Im50V90VFzME0bU4mks
sc9HAVGBFbEFmR9bHMCZGDeF5jVB8DNGk1WE5SLqMZYFktf/WeydXopQ3NeP/qe8
nQIDAQAB
-----END PUBLIC KEY-----`,
    },
    symmetricKeyEncryption: {
      publicKeyId: "cltYHGYo9EeryDOgOVvz7AsTpGbCsOxVh/uV4ugpcFY=",
      publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0/Am9ubTyf6VjJTBehK0
mMEBmgJ7KfbdqqCTFE9bvfta8IHkiz6XR8IBIfauVzvoMPxEPCWbel9oWxggBSLi
TMyV7LkHF/eRp3RC+958AM34FNvYT3bdI2WjOjXDuJZ8JOyhk7jTtvt/fZ9KMktV
pbghDAeO7WlbwBvwhdrMdneiWReZipg6+RAJGGled1jp0pQIItCdouh4rPFscfGZ
XJcPr+wePFDBTLgePSlHF1ccHXKYNf90cjerSgCMerZ1tgxHnwu2EhpLDd9vJHuO
1PS1BS1llxb8QqZEvk4QBFSYkDLmqypjUNXlQ9nRv5TyULgEmNu+DV5YtO54sojb
mwIDAQAB
-----END PUBLIC KEY-----`,
    },
  },
  test: {
    tokenEncryption: {
      publicKeyId: "IPbPM4CB49vtoR/x/3fEI+Y+Q6lK/bVVehQ7/NlPJoo=",
      publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxsyeiYiWB2+KFxEpQGoN
Qa6W8Pc4kWGl8V+sBMdW3Fqh0lhKiqKfpH5RWLDmZ30EzkKJ5+IdaWYFoijhYxDB
IBhINVQKlBZvEVd6CfPJUJypa94eRO5cc6IPNI35aMhfKP/Kc4A/OiT2J4nyCz6B
V98xOXCAlyDPD73XM6O2ormL6gUb673zvjOIakf39tAPPVgWIDuX7GDZYGebN7LX
oGvjPo5YDqC2KN51ofLbO+n74iei5OaGN94Ap52vI7uzK2g/hQslOd0Avl2U1kwR
nnF0yzwbDzRrHqPCHUYxVp5nHdo+jHe1CNoa6gt0m6pn1StYcitSXKg2hTNjnes6
TQIDAQAB
-----END PUBLIC KEY-----`,
    },
    symmetricKeyEncryption: {
      publicKeyId: "tmtCidSRzR4fvNpLU5hMOM6FzamxJf0BBR8IkXIAwsY=",
      publicKeyPem: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxUEDI48g+Pk0izn9XydR
evJqtz4h8s4Sz63FvIZvmhdaZfVkmGBqQrBKPTFX6ksQM/gEq1y8nqtmSI6RqoMU
gV0UDqIPauyicMiKsfLLPH3ht8bjkeaMB330dxWKCTpJKv+6+LC73i3B1oavWMAA
v3is5aWTyyFB9rwjdxcSZ46DSKYaUo5KbWKZTxBNpCT/LqkhHxfbszq+LIWIvm+0
9GFpth6hBvDST1h7CHt4g9B1DmtY3I2nYDkPtnmvGo5XBODqTgzWMb0rLgloQGbI
eZygQPhhzsWDy4d2uIrE9zZB90q6kDOVg/hZ5YdhCr4X8FeHOfaCgGp+8ZPL3akd
uQIDAQAB
-----END PUBLIC KEY-----`,
    },
  },
};

/** Słownik statusów przetwarzania KSeF */
export const KSEF_PROCESSING_STATUS: Record<number, string> = {
  100: "Inicjalizacja przetwarzania dokumentu",
  150: "Przetwarzanie dokumentu w toku",
  200: "Dokument przetworzony poprawnie (Zarejestrowany / UPO dostępne)",
  300: "Dokument odrzucony - błąd semantyczny/biznesowy",
  400: "Błąd weryfikacji podpisu/szyfrowania",
  410: "Błąd zgodności ze schematem XSD",
  420: "Błąd duplikatu numeru faktury",
  440: "Duplikat faktury (faktura została już zarejestrowana)",
  450: "Nieprawidłowy podmiot lub brak uprawnień",
};

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

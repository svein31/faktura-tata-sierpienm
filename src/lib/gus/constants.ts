/**
 * GUS BIR 1.1 (Baza Internetowa REGON) - Stałe i konfiguracja
 */

export const GUS_URLS = {
  test: "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc",
  prod: "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc",
  production: "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc",
} as const;

export type GusEnvironment = "test" | "prod" | "production";

/** Oficjalny klucz testowy udostępniany przez Główny Urząd Statystyczny */
export const GUS_TEST_KEY = "abcde12345abcde12345";

export const GUS_ACTIONS = {
  login: "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj",
  search: "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty",
  logout: "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj",
  getValue: "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/GetValue",
} as const;

export const GUS_ERROR_CODES: Record<string, string> = {
  "0": "Brak błędu.",
  "1": "Kod niepoprawny lub brak danych dla podanych kryteriów.",
  "2": "Przekroczono maksymalną liczbę zapytań w sesji.",
  "3": "Nie znaleziono podmiotów w bazie REGON.",
  "4": "Nie znaleziono podmiotu dla wskazanego numeru NIP.",
  "5": "Brak sesji lub sesja wygasła. Wymagane ponowne logowanie.",
  "7": "Brak sesji. Klient nie jest zalogowany.",
  "10": "Nieprawidłowy klucz użytkownika (userKey).",
};

export interface GusRawEntity {
  Regon?: string;
  Nip?: string;
  StatusNip?: string;
  Nazwa?: string;
  Wojewodztwo?: string;
  Powiat?: string;
  Gmina?: string;
  Miejscowosc?: string;
  KodPocztowy?: string;
  Ulica?: string;
  NrNieruchomosci?: string;
  NrLokalu?: string;
  Typ?: string; // F - działalność fizyczna, P - osoba prawna
  SilosID?: string; // 1 - CEIDG, 6 - KRS, itp.
  DataZakonczeniaDzialalnosci?: string;
  MiejscowoscPoczty?: string;
  ErrorCode?: string;
  ErrorMessagePl?: string;
}

export interface GusNormalizedCompany {
  nip: string;
  name: string;
  regon: string;
  street: string;
  buildingNumber: string;
  flatNumber: string;
  city: string;
  postalCode: string;
  fullAddress: string;
  voivodeship?: string;
  county?: string;
  commune?: string;
  type?: "F" | "P" | string;
  silosId?: string;
  isActive: boolean;
}

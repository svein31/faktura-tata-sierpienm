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
  fullReport: "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DanePobierzPelnyRaport",
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

export interface GusFullReportRaw {
  [key: string]: string | undefined;
  // Pola osoby fizycznej (CEIDG / Dane Ogólne)
  fiz_imie1?: string;
  fiz_imie2?: string;
  fiz_nazwisko?: string;
  fiz_nazwiskoGrupowe?: string;
  fiz_nip?: string;
  fiz_regon9?: string;
  fiz_nazwa?: string;
  fiz_nazwaSkrocona?: string;
  fiz_adSiedzWojewodztwo_Nazwa?: string;
  fiz_adSiedzPowiat_Nazwa?: string;
  fiz_adSiedzGmina_Nazwa?: string;
  fiz_adSiedzMiejscowosc_Nazwa?: string;
  fiz_adSiedzKodPocztowy?: string;
  fiz_adSiedzUlica_Nazwa?: string;
  fiz_adSiedzNrNieruchomosci?: string;
  fiz_adSiedzNrLokalu?: string;
  fiz_adSiedzNietypoweMiejsceLokalizacji?: string;
  fiz_dataRozpoczeciaDzialalnosci?: string;
  fiz_dataZakonczeniaDzialalnosci?: string;

  // Pola osoby prawnej (KRS / Inna)
  praw_nip?: string;
  praw_regon9?: string;
  praw_regon14?: string;
  praw_krs?: string;
  praw_nazwa?: string;
  praw_nazwaSkrocona?: string;
  praw_adSiedzWojewodztwo_Nazwa?: string;
  praw_adSiedzPowiat_Nazwa?: string;
  praw_adSiedzGmina_Nazwa?: string;
  praw_adSiedzMiejscowosc_Nazwa?: string;
  praw_adSiedzKodPocztowy?: string;
  praw_adSiedzUlica_Nazwa?: string;
  praw_adSiedzNrNieruchomosci?: string;
  praw_adSiedzNrLokalu?: string;
  praw_formaPrawna_Nazwa?: string;
  praw_dataRozpoczeciaDzialalnosci?: string;
  praw_dataZakonczeniaDzialalnosci?: string;
}

export interface GusNormalizedCompany {
  nip: string;
  name: string;
  companyName: string;
  regon: string;
  krs?: string;
  type: "PERSONAL" | "COMPANY";
  firstName?: string;
  lastName?: string;
  secondName?: string;
  street: string;
  buildingNumber: string;
  flatNumber: string;
  city: string;
  postalCode: string;
  fullAddress: string;
  province?: string;
  district?: string;
  voivodeship?: string;
  county?: string;
  commune?: string;
  silosId?: string;
  rawType?: string;
  bankAccount?: string;
  isActive: boolean;
}

/**
 * Wspólne typy wejściowe, słowniki kodów i reguły mapowania dla generatorów JPK.
 *
 * Generatory przyjmują neutralne struktury danych (nie modele Prisma), dzięki
 * czemu są w pełni testowalne bez bazy i nie zależą od warstwy ORM.
 */

import { round2 } from "./money";

// ─────────────────────────────────────────────────────────────────────────────
// Walidacja
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: ValidationLevel;
  /** Stabilny kod problemu, np. „JPK_MISSING_NIP". */
  code: string;
  message: string;
  /** Numer wiersza ewidencji (LpSprzedazy / LpZakupu), jeżeli dotyczy. */
  row?: number;
  /** Numer dokumentu, którego dotyczy problem. */
  document?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Podmiot składający (Podmiot1)
// ─────────────────────────────────────────────────────────────────────────────

export type JpkEntityType = "nonPhysical" | "physical";

export interface JpkEntity {
  entityType: JpkEntityType;
  /** NIP — 10 cyfr, bez separatorów. */
  nip: string;
  /** Pełna nazwa (osoba niefizyczna). */
  fullName?: string | null;
  /** Imię pierwsze (osoba fizyczna). */
  firstName?: string | null;
  /** Nazwisko (osoba fizyczna). */
  lastName?: string | null;
  /** Data urodzenia „YYYY-MM-DD" (osoba fizyczna). */
  birthDate?: string | null;
  /** Adres e-mail — element WYMAGANY w Podmiot1 schematów JPK_V7. */
  email: string;
  phone?: string | null;

  // Adres — wykorzystywany w JPK_FA (AdresPodmiotu)
  countryCode?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  flatNumber?: string | null;
  city?: string | null;
  postalCode?: string | null;
  /** Adres w jednej linii — używany, gdy brak danych szczegółowych. */
  addressLine?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dokumenty
// ─────────────────────────────────────────────────────────────────────────────

/** Stawki VAT obsługiwane w ewidencji (w tym historyczne 22 % i 7 %). */
export type JpkVatRate = "23" | "22" | "8" | "7" | "5" | "0" | "zw" | "np" | "oo";

export interface JpkDocumentLine {
  name: string;
  unit?: string | null;
  quantity: number;
  netPrice: number;
  vatRate: string;
  /** Kwota opustu / obniżki ceny (P_10 w JPK_FA). */
  discount?: number | null;
}

/** Typ dokumentu w ewidencji sprzedaży (§ 10 ust. 5 rozporządzenia). */
export type JpkSalesDocType = "RO" | "WEW" | "FP";

/** Typ dokumentu w ewidencji zakupu (§ 11 ust. 8 rozporządzenia). */
export type JpkPurchaseDocType = "MK" | "VAT_RR" | "WEW";

export interface JpkSalesDocument {
  id?: string;
  /** DowodSprzedazy — numer dokumentu. */
  number: string;
  /** DataWystawienia. */
  issueDate: string;
  /** DataSprzedazy — pomijana, gdy równa dacie wystawienia. */
  saleDate?: string | null;

  contractorName: string;
  contractorNip?: string | null;
  /** Dwuliterowy kod kraju nabywcy (ISO 3166-1 alfa-2). */
  contractorCountry?: string | null;
  contractorAddress?: string | null;

  lines: JpkDocumentLine[];

  currency?: string | null;
  exchangeRate?: number | null;
  exchangeRateUnit?: number | null;
  totalNetPln?: number | null;
  totalVatPln?: number | null;
  totalGrossPln?: number | null;

  /** Numer KSeF nadany fakturze. */
  ksefNumber?: string | null;
  /** Faktura wystawiona w trybie offline (art. 106nf / 106nh ustawy o VAT). */
  isOffline?: boolean | null;

  gtuCodes?: string[] | null;
  jpkProcedures?: string[] | null;
  jpkDocumentType?: string | null;
  /** MPP — mechanizm podzielonej płatności (art. 108a ustawy o VAT, zał. 15). */
  isSplitPayment?: boolean | null;
  /** WSTO / usługi TBE rozliczane w procedurze OSS. */
  isWstoEe?: boolean | null;

  isCorrection?: boolean | null;
  correctionReason?: string | null;
  originalInvoiceNumber?: string | null;
  /** Faktura zaliczkowa. */
  isAdvance?: boolean | null;
  /** Faktura zwolniona z VAT — podstawa zwolnienia. */
  exemptionLegalBasis?: string | null;
  /** Procedura marży — biuro podróży (art. 119 ustawy o VAT). */
  marginTravel?: boolean | null;
  /** Procedura marży — towary używane, dzieła sztuki (art. 120 ustawy o VAT). */
  marginUsedGoods?: boolean | null;
  /** Kwota sprzedaży brutto w procedurze marży (SprzedazVAT_Marza). */
  marginGrossAmount?: number | null;
  /** Metoda kasowa (art. 21 ustawy o VAT). */
  cashMethod?: boolean | null;
  /** Samofakturowanie (art. 106d ustawy o VAT). */
  selfBilling?: boolean | null;

  /** KorektaPodstawyOpodt — korekta z art. 89a ust. 1 / ust. 4 ustawy o VAT. */
  correctionOfTaxBase?: boolean | null;
  /** TerminPlatnosci — dla korekty z art. 89a ust. 1. */
  paymentTermDate?: string | null;
  /** DataZaplaty — dla korekty z art. 89a ust. 4. */
  paymentDate?: string | null;
}

export interface JpkPurchaseDocument {
  id?: string;
  /** DowodZakupu. */
  number: string;
  /** DataZakupu — data wystawienia dokumentu przez dostawcę. */
  issueDate: string;
  /** DataWplywu — pomijana, gdy równa dacie zakupu. */
  receivedAt?: string | null;

  contractorName: string;
  contractorNip?: string | null;
  contractorCountry?: string | null;

  totalNet: number;
  totalVat: number;

  currency?: string | null;
  exchangeRate?: number | null;
  exchangeRateUnit?: number | null;

  purchaseDocType?: string | null;
  /** Procedura IMP — import towarów rozliczany w deklaracji (art. 33a ustawy o VAT). */
  isImport?: boolean | null;
  /** Czy przysługuje prawo do odliczenia (art. 86 ust. 1 ustawy o VAT). */
  vatDeductible?: boolean | null;
  /** Procent odliczenia, np. 50 dla samochodów osobowych (art. 86a ustawy o VAT). */
  vatDeductiblePercent?: number | null;
  /** Nabycie zaliczane do środków trwałych → K_40/K_41 zamiast K_42/K_43. */
  isFixedAsset?: boolean | null;

  ksefNumber?: string | null;
  isOffline?: boolean | null;

  /** Kwota nabycia brutto w procedurze marży (ZakupVAT_Marza). */
  marginGrossAmount?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Słowniki kodów
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kody grup towarów i usług — § 10 ust. 3 rozporządzenia Ministra Finansów
 * z 15.10.2019 r. w sprawie szczegółowego zakresu danych zawartych w deklaracjach
 * podatkowych i w ewidencji w zakresie podatku od towarów i usług.
 */
export const GTU_CODES = [
  "GTU_01",
  "GTU_02",
  "GTU_03",
  "GTU_04",
  "GTU_05",
  "GTU_06",
  "GTU_07",
  "GTU_08",
  "GTU_09",
  "GTU_10",
  "GTU_11",
  "GTU_12",
  "GTU_13",
] as const;

export type GtuCode = (typeof GTU_CODES)[number];

/** Opisy kodów GTU — pomoc kontekstowa w interfejsie. */
export const GTU_DESCRIPTIONS: Record<string, string> = {
  GTU_01: "Napoje alkoholowe — alkohol etylowy, piwo, wino, napoje fermentowane i wyroby pośrednie",
  GTU_02: "Towary z art. 103 ust. 5aa ustawy o VAT (paliwa silnikowe, oleje, biopaliwa)",
  GTU_03: "Oleje opałowe i smarowe (z wyłączeniem towarów z GTU_02)",
  GTU_04: "Wyroby i susz tytoniowy, płyn do papierosów elektronicznych, wyroby nowatorskie",
  GTU_05: "Odpady — wyłącznie określone w poz. 79–91 załącznika nr 15 do ustawy o VAT",
  GTU_06: "Urządzenia elektroniczne oraz części i materiały do nich (poz. 7–9, 59–63, 65, 66, 69, 94–96 zał. 15)",
  GTU_07: "Pojazdy oraz części samochodowe (CN 8701–8708 oraz CN 8708 10)",
  GTU_08: "Metale szlachetne oraz nieszlachetne (poz. 1–3 zał. 12 oraz poz. 12–25, 33–40, 45, 46, 56, 78 zał. 15)",
  GTU_09: "Produkty lecznicze, środki spożywcze specjalnego przeznaczenia i wyroby medyczne (art. 37av ust. 1 Prawa farmaceutycznego)",
  GTU_10: "Budynki, budowle i grunty oraz ich części i udziały w prawie własności",
  GTU_11: "Usługi w zakresie przenoszenia uprawnień do emisji gazów cieplarnianych",
  GTU_12: "Usługi niematerialne — doradcze, księgowe, prawne, zarządcze, szkoleniowe, marketingowe, reklamowe, badania rynku, badania naukowe i prace rozwojowe",
  GTU_13: "Usługi transportowe i gospodarki magazynowej (PKWiU 49.4, 52.1)",
};

/**
 * Oznaczenia procedur w ewidencji sprzedaży — § 10 ust. 4 rozporządzenia.
 * Kolejność tablicy odpowiada kolejności elementów w schemacie XSD.
 */
export const SALES_PROCEDURE_CODES = [
  "WSTO_EE",
  "IED",
  "TP",
  "TT_WNT",
  "TT_D",
  "MR_T",
  "MR_UZ",
  "I_42",
  "I_63",
  "B_SPV",
  "B_SPV_DOSTAWA",
  "B_MPV_PROWIZJA",
] as const;

export type SalesProcedureCode = (typeof SALES_PROCEDURE_CODES)[number];

/** Opisy oznaczeń procedur — pomoc kontekstowa w interfejsie. */
export const SALES_PROCEDURE_DESCRIPTIONS: Record<string, string> = {
  WSTO_EE:
    "Wewnątrzwspólnotowa sprzedaż towarów na odległość oraz usługi telekomunikacyjne, nadawcze " +
    "i elektroniczne na rzecz konsumentów z innych państw UE (art. 22a ust. 1 pkt 3 ustawy o VAT)",
  IED: "Dostawa przez interfejs elektroniczny — operator platformy (art. 7a ust. 1 i 2 ustawy o VAT)",
  TP: "Powiązania między nabywcą a dostawcą (art. 32 ust. 2 pkt 1 ustawy o VAT)",
  TT_WNT: "Wewnątrzwspólnotowe nabycie towarów w ramach transakcji trójstronnej uproszczonej (art. 135–138)",
  TT_D: "Dostawa towarów poza terytorium kraju przez drugiego w kolejności podatnika w transakcji trójstronnej",
  MR_T: "Świadczenie usług turystyki opodatkowanych na zasadach marży (art. 119 ustawy o VAT)",
  MR_UZ: "Dostawa towarów używanych, dzieł sztuki, przedmiotów kolekcjonerskich i antyków (art. 120)",
  I_42: "Wewnątrzwspólnotowa dostawa towarów po imporcie w procedurze celnej 42",
  I_63: "Wewnątrzwspólnotowa dostawa towarów po imporcie w procedurze celnej 63",
  B_SPV: "Transfer bonu jednego przeznaczenia przez podatnika działającego we własnym imieniu (art. 8a ust. 1)",
  B_SPV_DOSTAWA: "Dostawa towarów oraz świadczenie usług objęte bonem jednego przeznaczenia (art. 8a ust. 4)",
  B_MPV_PROWIZJA: "Usługi pośrednictwa dotyczące transferu bonu różnego przeznaczenia (art. 8b ust. 2)",
};

/** Typy dokumentów sprzedaży dopuszczone w schemacie. */
export const SALES_DOC_TYPES: readonly JpkSalesDocType[] = ["RO", "WEW", "FP"];

/** Typy dokumentów zakupu dopuszczone w schemacie (element `DokumentZakupu`). */
export const PURCHASE_DOC_TYPES: readonly JpkPurchaseDocType[] = ["MK", "VAT_RR", "WEW"];

/**
 * Wzorzec numeru KSeF: NIP-RRRRMMDD-identyfikator-suma kontrolna.
 * Zgodny z numeracją KSeF 1.0 oraz KSeF 2.0 (identyfikator 6–12 znaków hex).
 */
export const KSEF_NUMBER_PATTERN = /^\d{10}-\d{8}-[0-9A-F]{6,12}-[0-9A-F]{2,6}$/i;

/**
 * Państwa członkowskie Unii Europejskiej (kody ISO 3166-1 alfa-2)
 * — do rozpoznania WDT (K_21) oraz eksportu poza UE (K_22).
 */
export const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze funkcje mapujące
// ─────────────────────────────────────────────────────────────────────────────

/** Czyści NIP do samych cyfr. */
export function cleanNip(nip: string | null | undefined): string {
  return String(nip ?? "").replace(/[^0-9]/g, "");
}

/** Normalizuje kod kraju do dwóch wielkich liter. */
export function normalizeCountry(country: string | null | undefined): string {
  return String(country ?? "").trim().toUpperCase().slice(0, 2);
}

/**
 * Zwraca wartość elementu `KodKrajuNadaniaTIN` albo `null`, gdy element
 * należy pominąć.
 *
 * Reguły:
 *  • dla Polski (PL) elementu NIE wysyła się — numer krajowy jest domyślny;
 *  • schemat wymaga kodu `EL` dla Grecji (kod `GR` jest odrzucany przez bramkę MF),
 *    dlatego `GR` mapujemy na `EL`;
 *  • dla pozostałych państw zwracamy kod dwuliterowy.
 */
export function resolveTinCountryCode(country: string | null | undefined): string | null {
  const code = normalizeCountry(country);
  if (!code || code === "PL") return null;
  if (code === "GR") return "EL";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

/** Stawka VAT w procentach; `null` dla stawek nieliczbowych (zw, np, oo). */
export function vatRatePercent(rate: string | null | undefined): number | null {
  const raw = String(rate ?? "").trim().toLowerCase();
  if (raw === "zw" || raw === "np" || raw === "oo") return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalizuje zapis stawki VAT do postaci używanej w mapowaniu pól K_. */
export function normalizeVatRate(rate: string | null | undefined): JpkVatRate {
  const raw = String(rate ?? "").trim().toLowerCase();
  if (raw === "zw") return "zw";
  if (raw === "np") return "np";
  if (raw === "oo") return "oo";
  const percent = vatRatePercent(raw);
  if (percent === 23) return "23";
  if (percent === 22) return "22";
  if (percent === 8) return "8";
  if (percent === 7) return "7";
  if (percent === 5) return "5";
  if (percent === 0) return "0";
  // Stawki nieznane traktujemy jak „np" (poza terytorium kraju) i raportujemy ostrzeżenie.
  return "np";
}

/** Kierunek sprzedaży ze stawką 0 % — decyduje o polu K_13 / K_21 / K_22. */
export type ZeroRateDirection = "domestic" | "intraCommunity" | "export";

export function classifyZeroRate(country: string | null | undefined): ZeroRateDirection {
  const code = normalizeCountry(country);
  if (!code || code === "PL") return "domestic";
  if (EU_MEMBER_STATES.has(code)) return "intraCommunity";
  return "export";
}

/**
 * Współczynnik przeliczenia kwot dokumentu na złote (art. 31a ustawy o VAT).
 * Zwraca `0`, gdy dokumentu nie da się przeliczyć — generator zgłasza wtedy błąd.
 */
export function plnConversionFactor(doc: {
  currency?: string | null;
  exchangeRate?: number | null;
  exchangeRateUnit?: number | null;
  totalNetPln?: number | null;
}, documentNetInCurrency: number): number {
  const currency = String(doc.currency ?? "PLN").toUpperCase();
  if (currency === "PLN") return 1;

  const unit = doc.exchangeRateUnit && doc.exchangeRateUnit > 0 ? doc.exchangeRateUnit : 1;
  if (doc.exchangeRate && doc.exchangeRate > 0) return doc.exchangeRate / unit;

  // Awaryjnie odtwarzamy kurs z zapisanej kwoty w PLN.
  if (doc.totalNetPln && documentNetInCurrency > 0) {
    return doc.totalNetPln / documentNetInCurrency;
  }
  return 0;
}

/** Wartość netto pozycji w walucie dokumentu. */
export function lineNetAmount(line: JpkDocumentLine): number {
  const discount = round2(Math.max(0, line.discount ?? 0));
  return round2(round2(line.quantity * line.netPrice) - discount);
}

/** Kwota VAT pozycji w walucie dokumentu. */
export function lineVatAmount(line: JpkDocumentLine): number {
  const percent = vatRatePercent(line.vatRate);
  if (percent === null) return 0;
  return round2((lineNetAmount(line) * percent) / 100);
}

/** Czy dokument jest fakturą do paragonu (FP) — wyłączaną z sum kontrolnych. */
export function isReceiptInvoice(doc: JpkSalesDocument): boolean {
  return String(doc.jpkDocumentType ?? "").toUpperCase() === "FP";
}

/**
 * Czy dokument może być oznaczony kodami GTU.
 *
 * § 10 ust. 3a rozporządzenia — oznaczeń GTU nie stosuje się do dokumentów
 * zbiorczych wewnętrznych („WEW") oraz do raportów z kasy rejestrującej („RO").
 */
export function allowsGtuCodes(doc: JpkSalesDocument): boolean {
  const type = String(doc.jpkDocumentType ?? "").toUpperCase();
  return type !== "RO" && type !== "WEW";
}

/** Filtruje i porządkuje kody GTU zgodnie z kolejnością ze schematu. */
export function orderedGtuCodes(codes: readonly string[] | null | undefined): GtuCode[] {
  const set = new Set((codes ?? []).map((code) => String(code).trim().toUpperCase()));
  return GTU_CODES.filter((code) => set.has(code));
}

/** Filtruje i porządkuje oznaczenia procedur zgodnie z kolejnością ze schematu. */
export function orderedProcedures(codes: readonly string[] | null | undefined): SalesProcedureCode[] {
  const set = new Set((codes ?? []).map((code) => String(code).trim().toUpperCase()));
  return SALES_PROCEDURE_CODES.filter((code) => set.has(code));
}

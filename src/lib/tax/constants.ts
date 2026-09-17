/**
 * Parametry roczne podatkowo-ZUS-owe — ŹRÓDŁO PRAWDY modułu „Podatki i ZUS".
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * UWAGA — STAN PRAWNY
 * ──────────────────────────────────────────────────────────────────────────────
 * Reforma składki zdrowotnej przedsiębiorców uchwalona w 2025 r. została
 * ZAWETOWANA i NIE OBOWIĄZUJE. Moduł liczy składkę zdrowotną według zasad
 * „Polskiego Ładu" (art. 79a i art. 81 ust. 2, 2c, 2e ustawy z 27.08.2004 r.
 * o świadczeniach opieki zdrowotnej finansowanych ze środków publicznych):
 *   • skala podatkowa  → 9 % dochodu z miesiąca poprzedzającego,
 *   • podatek liniowy  → 4,9 % dochodu, nie mniej niż 9 % minimalnego wynagrodzenia,
 *   • ryczałt          → 9 % od podstawy zryczałtowanej (3 progi przychodu).
 * W szczególności NIE stosuje się progu 1,5-krotności przeciętnego wynagrodzenia
 * dla podatku liniowego — to element zawetowanej ustawy.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ROK SKŁADKOWY ≠ ROK KALENDARZOWY
 * ──────────────────────────────────────────────────────────────────────────────
 * Minimalna podstawa składki zdrowotnej obowiązuje w ROKU SKŁADKOWYM, który
 * trwa od 1 lutego do 31 stycznia roku następnego (art. 81 ust. 2 pkt 1 w zw.
 * z art. 81 ust. 2 ustawy o świadczeniach). Dlatego:
 *   • za styczeń 2026 obowiązuje jeszcze minimum roku składkowego 02/2025–01/2026,
 *     tj. 3 499,50 zł → składka 314,96 zł,
 *   • od lutego 2026 obowiązuje minimum 4 806,00 zł → składka 432,54 zł.
 * Podstawa zryczałtowana dla ryczałtu ewidencjonowanego zmienia się natomiast
 * z początkiem ROKU KALENDARZOWEGO (art. 81 ust. 2e ustawy o świadczeniach).
 */

/** Forma opodatkowania — zgodna z `TaxationForm` z `@/lib/types`. */
export type TaxationFormCode = "ryczalt" | "liniowy" | "skala";

/** Schemat ZUS — zgodny z `ZusScheme` z `@/lib/types`. */
export type ZusSchemeCode = "full" | "preferential" | "ulga_na_start" | "maly_zus_plus" | "none";

/** Zestaw parametrów obowiązujących w danym roku. */
export interface TaxYearParams {
  /** Rok, dla którego parametry obowiązują. */
  year: number;

  // ── Wynagrodzenia bazowe ────────────────────────────────────────────────
  /** Minimalne wynagrodzenie za pracę (rozporządzenie Rady Ministrów). */
  minWage: number;
  /** Prognozowane przeciętne wynagrodzenie miesięczne (ustawa budżetowa). */
  projectedAverageWage: number;
  /**
   * Przeciętne miesięczne wynagrodzenie w sektorze przedsiębiorstw włącznie
   * z wypłatami z zysku w IV kwartale roku poprzedniego (GUS) — baza podstawy
   * składki zdrowotnej dla ryczałtu (art. 81 ust. 2e ustawy o świadczeniach).
   */
  enterpriseAverageWageQ4: number;

  // ── Podstawy składek społecznych ────────────────────────────────────────
  /** Duży ZUS — 60 % prognozowanego przeciętnego wynagrodzenia (art. 18 ust. 8 u.s.u.s.). */
  socialBaseFull: number;
  /** Preferencyjny ZUS — 30 % minimalnego wynagrodzenia (art. 18a ust. 1 u.s.u.s.). */
  socialBasePreferential: number;
  /** Mały ZUS Plus — dolna granica podstawy (art. 18c ust. 2 u.s.u.s.). */
  malyZusPlusMin: number;
  /** Mały ZUS Plus — górna granica podstawy (art. 18c ust. 2 u.s.u.s.). */
  malyZusPlusMax: number;

  // ── Limity ──────────────────────────────────────────────────────────────
  /** Roczna podstawa wymiaru składek emerytalno-rentowych — 30-krotność (art. 19 ust. 1 u.s.u.s.). */
  annualPensionCap: number;
  /** Miesięczny limit podstawy dobrowolnego ubezpieczenia chorobowego (art. 20 ust. 3 u.s.u.s.). */
  monthlySicknessCap: number;
  /** Roczny limit odliczenia składki zdrowotnej przy podatku liniowym (art. 30c ust. 2 pkt 2 updof). */
  linearHealthDeductionLimit: number;

  // ── Składka zdrowotna ───────────────────────────────────────────────────
  /**
   * Minimalna podstawa składki zdrowotnej obowiązująca w ROKU SKŁADKOWYM
   * rozpoczynającym się 1 lutego tego roku i trwającym do 31 stycznia roku
   * następnego (art. 81 ust. 2 ustawy o świadczeniach).
   */
  healthMinBaseFromFebruary: number;
}

/** Stopy składek na ubezpieczenia społeczne — art. 22 ust. 1 u.s.u.s. (stałe). */
export const ZUS_RATES = {
  /** Emerytalna — art. 22 ust. 1 pkt 1 u.s.u.s. */
  pension: 19.52,
  /** Rentowa — art. 22 ust. 1 pkt 2 u.s.u.s. */
  disability: 8.0,
  /** Chorobowa (dobrowolna dla przedsiębiorcy) — art. 22 ust. 1 pkt 3 u.s.u.s. */
  sickness: 2.45,
  /** Wypadkowa — domyślnie 1,67 % (do 9 ubezpieczonych, rozporządzenie MPiPS). */
  accidentDefault: 1.67,
  /** Fundusz Pracy + Fundusz Solidarnościowy — art. 104 ustawy o promocji zatrudnienia. */
  labourFund: 2.45,
} as const;

/** Stopa składki zdrowotnej — 9 % (art. 79 ust. 1 ustawy o świadczeniach). */
export const HEALTH_RATE = 9.0;

/** Stopa składki zdrowotnej dla podatku liniowego — 4,9 % (art. 79a ust. 1 ustawy o świadczeniach). */
export const HEALTH_RATE_LINEAR = 4.9;

/** Progi podstawy zryczałtowanej składki zdrowotnej dla ryczałtu (art. 81 ust. 2e ustawy o świadczeniach). */
export const HEALTH_RYCZALT_THRESHOLDS = {
  /** Przychód ≤ 60 000 zł → 60 % przeciętnego wynagrodzenia. */
  lowerRevenue: 60000,
  lowerFactor: 0.6,
  /** Przychód > 60 000 zł i ≤ 300 000 zł → 100 % przeciętnego wynagrodzenia. */
  upperRevenue: 300000,
  middleFactor: 1.0,
  /** Przychód > 300 000 zł → 180 % przeciętnego wynagrodzenia. */
  upperFactor: 1.8,
} as const;

// ── PIT — skala podatkowa (art. 27 ust. 1 updof) ─────────────────────────────

/** Górna granica I progu skali podatkowej. */
export const PIT_SCALE_THRESHOLD = 120000;
/** Stawka I progu skali. */
export const PIT_SCALE_RATE_LOW = 12;
/** Stawka II progu skali. */
export const PIT_SCALE_RATE_HIGH = 32;
/** Kwota zmniejszająca podatek (roczna) — art. 27 ust. 1 updof. */
export const PIT_TAX_REDUCING_AMOUNT = 3600;
/** Kwota wolna od podatku = 3 600 / 12 % (art. 27 ust. 1 updof). */
export const PIT_TAX_FREE_AMOUNT = 30000;
/**
 * Podatek na granicy I progu po uwzględnieniu kwoty zmniejszającej:
 * 120 000 × 12 % − 3 600 = 10 800 zł.
 */
export const PIT_SCALE_BASE_TAX_AT_THRESHOLD = 10800;
/** Podatek na granicy I progu BEZ kwoty zmniejszającej: 120 000 × 12 % = 14 400 zł. */
export const PIT_SCALE_BASE_TAX_AT_THRESHOLD_NO_RELIEF = 14400;

/** Stawka podatku liniowego — art. 30c ust. 1 updof. */
export const PIT_LINEAR_RATE = 19;

/**
 * Próg odroczenia wpłaty zaliczki na PIT — art. 44 ust. 15–16 updof.
 * Podatnik nie ma obowiązku wpłacania zaliczki, dopóki podatek należny od
 * dochodu osiągniętego od początku roku pomniejszony o zaliczki wpłacone
 * nie przekroczy 1 000 zł.
 */
export const PIT_ADVANCE_DEFERRAL_THRESHOLD = 1000;

/**
 * Pełny katalog stawek ryczałtu od przychodów ewidencjonowanych
 * (art. 12 ust. 1 ustawy z 20.11.1998 r. o zryczałtowanym podatku dochodowym).
 */
export const RYCZALT_RATES = [2, 3, 5.5, 8.5, 10, 12, 14, 15, 17] as const;

/**
 * Dodatkowa stawka 12,5 % od nadwyżki przychodów z najmu ponad 100 000 zł
 * — art. 12 ust. 1 pkt 4 lit. a ustawy o ryczałcie.
 */
export const RYCZALT_SURCHARGE_RATE = 12.5;
export const RYCZALT_SURCHARGE_THRESHOLD = 100000;

/**
 * Część zapłaconych składek zdrowotnych odliczana od przychodu przy ryczałcie
 * — 50 %, bez limitu kwotowego (art. 11 ust. 1a ustawy o ryczałcie).
 */
export const RYCZALT_HEALTH_DEDUCTION_SHARE = 0.5;

/** Dzień miesiąca, do którego wpłaca się zaliczkę PIT i składki ZUS dla JDG. */
export const PAYMENT_DEADLINE_DAY = 20;

/** Opisy najczęstszych stawek ryczałtu — pomoc kontekstowa w UI. */
export const RYCZALT_RATE_DESCRIPTIONS: Record<string, string> = {
  "2":
    "2 % — sprzedaż przetworzonych w sposób inny niż przemysłowy produktów roślinnych i zwierzęcych " +
    "z własnej uprawy, hodowli lub chowu (art. 12 ust. 1 pkt 8 ustawy o ryczałcie).",
  "3":
    "3 % — działalność gastronomiczna w zakresie sprzedaży napojów o zawartości alkoholu powyżej 1,5 %, " +
    "działalność usługowa w zakresie handlu, usługi związane z produkcją zwierzęcą, odpłatne zbycie " +
    "składników majątku (art. 12 ust. 1 pkt 7 ustawy o ryczałcie).",
  "5.5":
    "5,5 % — działalność wytwórcza, roboty budowlane, przewóz ładunków taborem o ładowności powyżej 2 ton, " +
    "prowizja ze sprzedaży biletów komunikacji miejskiej i znaczków (art. 12 ust. 1 pkt 6 ustawy o ryczałcie).",
  "8.5":
    "8,5 % — działalność usługowa (stawka podstawowa), przychody z najmu i dzierżawy w ramach działalności " +
    "gospodarczej, działalność gastronomiczna z wyjątkiem napojów powyżej 1,5 % alkoholu, usługi w zakresie " +
    "edukacji (PKWiU dział 85), przychody z działalności polegającej na wytwarzaniu przedmiotów z materiału " +
    "powierzonego (art. 12 ust. 1 pkt 5 ustawy o ryczałcie).",
  "10":
    "10 % — przychody ze świadczenia usług w zakresie kupna i sprzedaży nieruchomości na własny rachunek " +
    "(PKWiU 68.10.1) (art. 12 ust. 1 pkt 3 ustawy o ryczałcie).",
  "12":
    "12 % — branża IT: usługi związane z wydawaniem pakietów gier komputerowych (PKWiU ex 58.21.10.0), " +
    "pakietów oprogramowania systemowego (58.29.1) i użytkowego (58.29.2), oprogramowania komputerowego " +
    "pobieranego z Internetu (ex 58.29.3), usługi związane z doradztwem w zakresie sprzętu komputerowego " +
    "(PKWiU 62.02.10.0), usługi związane z oprogramowaniem (ex 62.01.1), doradztwo w zakresie oprogramowania " +
    "(ex 62.02), instalowanie oprogramowania (ex 62.09.20.0), zarządzanie siecią i systemami informatycznymi " +
    "(62.03.1) (art. 12 ust. 1 pkt 2b ustawy o ryczałcie).",
  "14":
    "14 % — usługi w zakresie opieki zdrowotnej (PKWiU dział 86), usługi architektoniczne i inżynierskie, " +
    "badania i analizy techniczne (PKWiU dział 71), usługi w zakresie specjalistycznego projektowania " +
    "(PKWiU 74.1) (art. 12 ust. 1 pkt 2a ustawy o ryczałcie).",
  "15":
    "15 % — m.in. usługi pośrednictwa w sprzedaży hurtowej (PKWiU grupa 46.1), usługi przetwarzania danych " +
    "(ex 63.11.1), usługi reklamowe, badania rynku i opinii publicznej (dział 73), usługi doradztwa " +
    "związane z zarządzaniem (ex dział 70.22), usługi prawne, rachunkowo-księgowe i doradztwa podatkowego " +
    "(dział 69) świadczone poza wolnymi zawodami, usługi finansowe i ubezpieczeniowe (dział 64–66), " +
    "usługi kulturalne i rozrywkowe (dział 90) (art. 12 ust. 1 pkt 2 ustawy o ryczałcie).",
  "17":
    "17 % — przychody osiągane w zakresie wolnych zawodów w rozumieniu art. 4 ust. 1 pkt 11 ustawy " +
    "o ryczałcie (m.in. lekarz, dentysta, weterynarz, tłumacz, adwokat, notariusz, radca prawny, " +
    "doradca podatkowy, księgowy, rzecznik patentowy — wykonywane wyłącznie osobiście, bez zatrudniania " +
    "osób wykonujących czynności związane z istotą danego zawodu) (art. 12 ust. 1 pkt 1 ustawy o ryczałcie).",
};

/**
 * Parametry roczne.
 *
 * Źródła 2025:
 *  • minimalne wynagrodzenie 4 666,00 zł — rozporządzenie RM z 12.09.2024 r. (Dz.U. 2024 poz. 1362);
 *  • prognozowane przeciętne wynagrodzenie 8 673,00 zł — ustawa budżetowa na 2025 r.;
 *  • podstawa duży ZUS 5 203,80 zł = 60 % × 8 673,00;
 *  • podstawa preferencyjna 1 399,80 zł = 30 % × 4 666,00;
 *  • przeciętne wynagrodzenie w sektorze przedsiębiorstw w IV kw. 2024 r. 8 549,18 zł — obwieszczenie Prezesa GUS;
 *  • 30-krotność 260 190,00 zł; miesięczny limit chorobowej 21 682,50 zł;
 *  • limit odliczenia składki zdrowotnej (liniowy) 12 900,00 zł;
 *  • minimalna podstawa zdrowotnej w roku składkowym 02/2025–01/2026: 3 499,50 zł
 *    (75 % minimalnego wynagrodzenia 2025) → składka 314,96 zł.
 *
 * Źródła 2026:
 *  • minimalne wynagrodzenie 4 806,00 zł — rozporządzenie RM w sprawie wysokości minimalnego wynagrodzenia w 2026 r.;
 *  • prognozowane przeciętne wynagrodzenie 9 420,00 zł — ustawa budżetowa na 2026 r.;
 *  • podstawa duży ZUS 5 652,00 zł = 60 % × 9 420,00;
 *  • podstawa preferencyjna 1 441,80 zł = 30 % × 4 806,00;
 *  • przeciętne wynagrodzenie w sektorze przedsiębiorstw w IV kw. 2025 r. 9 228,64 zł — obwieszczenie Prezesa GUS;
 *  • 30-krotność 282 600,00 zł; miesięczny limit chorobowej 23 550,00 zł;
 *  • limit odliczenia składki zdrowotnej (liniowy) 14 100,00 zł;
 *  • minimalna podstawa zdrowotnej w roku składkowym 02/2026–01/2027: 4 806,00 zł → składka 432,54 zł.
 */
export const TAX_YEAR_PARAMS: Record<number, TaxYearParams> = {
  2025: {
    year: 2025,
    minWage: 4666.0,
    projectedAverageWage: 8673.0,
    enterpriseAverageWageQ4: 8549.18,
    socialBaseFull: 5203.8,
    socialBasePreferential: 1399.8,
    malyZusPlusMin: 1399.8,
    malyZusPlusMax: 5203.8,
    annualPensionCap: 260190.0,
    monthlySicknessCap: 21682.5,
    linearHealthDeductionLimit: 12900.0,
    healthMinBaseFromFebruary: 3499.5,
  },
  2026: {
    year: 2026,
    minWage: 4806.0,
    projectedAverageWage: 9420.0,
    enterpriseAverageWageQ4: 9228.64,
    socialBaseFull: 5652.0,
    socialBasePreferential: 1441.8,
    malyZusPlusMin: 1441.8,
    malyZusPlusMax: 5652.0,
    annualPensionCap: 282600.0,
    monthlySicknessCap: 23550.0,
    linearHealthDeductionLimit: 14100.0,
    healthMinBaseFromFebruary: 4806.0,
  },
};

/** Najnowszy rok, dla którego znamy pełny zestaw parametrów. */
export const LATEST_PARAMS_YEAR = 2026;

/** Najstarszy rok, dla którego znamy pełny zestaw parametrów. */
export const EARLIEST_PARAMS_YEAR = 2025;

/**
 * Zwraca parametry dla roku. Dla lat poza zakresem stosuje najbliższy znany
 * rocznik (z zachowaniem `year`), aby kalkulator nigdy nie zwracał zer.
 */
export function getYearParams(year: number): TaxYearParams {
  const exact = TAX_YEAR_PARAMS[year];
  if (exact) return exact;
  const fallbackYear = year < EARLIEST_PARAMS_YEAR ? EARLIEST_PARAMS_YEAR : LATEST_PARAMS_YEAR;
  return { ...TAX_YEAR_PARAMS[fallbackYear], year };
}

/**
 * Minimalna podstawa składki zdrowotnej dla okresu (rok, miesiąc)
 * z uwzględnieniem ROKU SKŁADKOWEGO (1 lutego – 31 stycznia).
 *
 * Styczeń należy jeszcze do roku składkowego rozpoczętego 1 lutego roku
 * poprzedniego, dlatego dla `month === 1` bierzemy parametr z roku `year - 1`.
 */
export function healthMinBaseForPeriod(year: number, month: number): number {
  const contributionYear = month === 1 ? year - 1 : year;
  return getYearParams(contributionYear).healthMinBaseFromFebruary;
}

/** Czy dana stawka ryczałtu mieści się w ustawowym katalogu. */
export function isValidRyczaltRate(rate: number): boolean {
  return (RYCZALT_RATES as readonly number[]).includes(rate);
}

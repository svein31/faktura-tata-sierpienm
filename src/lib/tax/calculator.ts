/**
 * Kalkulator podatkowo-ZUS-owy w czasie rzeczywistym dla jednoosobowej
 * działalności gospodarczej (JDG).
 *
 * Funkcja `calculateTaxes` jest CZYSTA — nie wykonuje żadnych operacji I/O,
 * nie czyta bazy ani daty systemowej poza wyliczeniem licznika dni do terminu
 * (datę „dziś" można wstrzyknąć parametrem `today`). Dzięki temu cała logika
 * jest w 100 % testowalna.
 *
 * Podstawy prawne:
 *  • art. 22 ust. 1, art. 18, 18a, 18c, 19, 20 ustawy z 13.10.1998 r.
 *    o systemie ubezpieczeń społecznych (u.s.u.s.) — składki społeczne,
 *  • art. 17a u.s.u.s. — wakacje składkowe,
 *  • art. 79, 79a, 81 ustawy z 27.08.2004 r. o świadczeniach opieki zdrowotnej
 *    finansowanych ze środków publicznych — składka zdrowotna,
 *  • art. 26 ust. 1 pkt 2, art. 27 ust. 1, art. 30c, art. 44 ustawy z 26.07.1991 r.
 *    o podatku dochodowym od osób fizycznych (updof) — PIT,
 *  • art. 11 i art. 12 ustawy z 20.11.1998 r. o zryczałtowanym podatku dochodowym
 *    od niektórych przychodów osiąganych przez osoby fizyczne — ryczałt,
 *  • art. 63 § 1 Ordynacji podatkowej — zaokrąglanie do pełnych złotych,
 *  • art. 103 ust. 1 ustawy o VAT oraz art. 47 ust. 1 pkt 3 u.s.u.s. — terminy.
 */

import type { TaxationForm, ZusScheme } from "@/lib/types";
import {
  HEALTH_RATE,
  HEALTH_RATE_LINEAR,
  HEALTH_RYCZALT_THRESHOLDS,
  PAYMENT_DEADLINE_DAY,
  PIT_ADVANCE_DEFERRAL_THRESHOLD,
  PIT_LINEAR_RATE,
  PIT_SCALE_BASE_TAX_AT_THRESHOLD,
  PIT_SCALE_BASE_TAX_AT_THRESHOLD_NO_RELIEF,
  PIT_SCALE_RATE_HIGH,
  PIT_SCALE_RATE_LOW,
  PIT_SCALE_THRESHOLD,
  PIT_TAX_REDUCING_AMOUNT,
  RYCZALT_HEALTH_DEDUCTION_SHARE,
  RYCZALT_SURCHARGE_RATE,
  RYCZALT_SURCHARGE_THRESHOLD,
  ZUS_RATES,
  getYearParams,
  type TaxYearParams,
} from "./constants";
import { clampZero, percentOf, round2, roundToZloty, sumMoney } from "./money";

// ─────────────────────────────────────────────────────────────────────────────
// Typy publiczne
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxCalculationInput {
  /** Rok okresu rozliczeniowego. */
  year: number;
  /** Miesiąc okresu rozliczeniowego (1..12). */
  month: number;

  taxationForm: TaxationForm;
  /** Stawka ryczałtu w % (wymagana dla `taxationForm === "ryczalt"`). */
  ryczaltRate?: number;
  /**
   * Stawka 12,5 % od nadwyżki przychodów ponad 100 000 zł
   * — art. 12 ust. 1 pkt 4 lit. a ustawy o ryczałcie (najem prywatny/dzierżawa).
   */
  ryczaltSurchargeEnabled?: boolean;

  /** Przychód netto za okres. */
  revenueNet: number;
  /** Koszty netto za okres. */
  costsNet: number;
  /** Przychód netto narastająco od początku roku, Z TYM okresem. */
  revenueYtd: number;
  /** Koszty netto narastająco od początku roku, Z TYM okresem. */
  costsYtd: number;

  /**
   * Dochód z miesiąca POPRZEDZAJĄCEGO — podstawa składki zdrowotnej
   * przy skali podatkowej i podatku liniowym (art. 81 ust. 2 ustawy o świadczeniach).
   */
  previousMonthIncome?: number;

  zusScheme: ZusScheme;
  /** Dobrowolne ubezpieczenie chorobowe. */
  zusSickness: boolean;
  /** Składka na Fundusz Pracy i Fundusz Solidarnościowy. */
  zusLabourFund: boolean;
  /** Stopa składki wypadkowej w % (standardowo 1,67). */
  zusAccidentRate: number;
  /** Indywidualna podstawa dla Małego ZUS Plus (art. 18c u.s.u.s.). */
  zusCustomSocialBase?: number | null;
  /** Miesiąc wakacji składkowych (1..12) — art. 17a u.s.u.s. */
  zusHolidayMonth?: number | null;

  /**
   * `true` — składki społeczne ujęte w kosztach uzyskania przychodu (art. 22 ust. 1 updof),
   * `false` — odliczane od dochodu (art. 26 ust. 1 pkt 2 updof).
   */
  socialInCosts: boolean;

  /** Stosowanie kwoty zmniejszającej podatek 3 600 zł (tylko skala). */
  applyTaxReducingAmount: boolean;
  /** Strata z lat poprzednich do odliczenia (art. 9 ust. 3 updof). */
  lossCarryForward: number;
  /** Zaliczki na PIT wpłacone od początku roku. */
  paidAdvancesYtd: number;

  /** Zapłacone składki zdrowotne narastająco od początku roku. */
  healthPaidYtd?: number;
  /** Faktycznie zapłacone składki społeczne bez FP/FS; brak = symulacja nominalna. */
  socialPaidYtd?: number;

  /** Kwota VAT do zapłaty za okres (P_51 z JPK_V7). */
  vatDue?: number;

  /** Nadpisania parametrów rocznych z `TaxProfile.parameterOverrides`. */
  params?: Partial<TaxYearParams>;

  /** Data „dziś" — wyłącznie do licznika dni; wstrzykiwana w testach. */
  today?: Date;
}

/** Pojedynczy krok śladu obliczeniowego prezentowanego w UI. */
export interface TaxCalculationStep {
  label: string;
  formula: string;
  value: number;
  legalBasis?: string;
}

export interface TaxCalculationResult {
  year: number;
  month: number;
  /** Etykieta okresu w formacie „YYYY-MM". */
  periodLabel: string;

  taxationForm: TaxationForm;
  ryczaltRate: number | null;
  /** Efektywnie użyte parametry roczne (po nadpisaniach). */
  params: TaxYearParams;

  // Podstawy
  revenueNet: number;
  costsNet: number;
  incomeBase: number;
  revenueYtd: number;
  costsYtd: number;
  incomeYtd: number;

  // ZUS
  zusSocialBase: number;
  zusPension: number;
  zusDisability: number;
  zusSickness: number;
  zusAccident: number;
  zusLabourFund: number;
  zusSocialTotal: number;
  zusHealthBase: number;
  zusHealth: number;
  zusTotal: number;
  /** Składki społeczne odliczone od dochodu/przychodu narastająco. */
  zusSocialDeductedYtd: number;
  /** Składka zdrowotna odliczona od dochodu/przychodu narastająco. */
  zusHealthDeductedYtd: number;
  /** Czy okres objęty wakacjami składkowymi (art. 17a u.s.u.s.). */
  zusHolidayApplied: boolean;

  // PIT
  pitBase: number;
  pitRateApplied: number;
  pitTaxYtd: number;
  pitAdvance: number;
  pitAdvanceRounded: number;
  pitDeferred: boolean;

  // VAT
  vatDue: number;

  totalDue: number;
  /** Termin płatności w formacie „YYYY-MM-20". */
  dueDate: string;
  /** Liczba dni do terminu (ujemna = po terminie). */
  daysLeft: number;
  isOverdue: boolean;

  steps: TaxCalculationStep[];
  /** Ostrzeżenia i objaśnienia dla użytkownika. */
  notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminy płatności
// ─────────────────────────────────────────────────────────────────────────────

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Liczba pełnych dni między dwiema datami kalendarzowymi (bez wpływu strefy czasowej). */
function daysBetween(from: Date, toYear: number, toMonth: number, toDay: number): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toUtc - fromUtc) / 86400000);
}

export interface PaymentDeadline {
  dueDate: string;
  daysLeft: number;
  isOverdue: boolean;
}

/**
 * Termin wpłaty zaliczki na PIT oraz składek ZUS dla JDG — do 20. dnia
 * miesiąca następującego po okresie rozliczeniowym (art. 44 ust. 6 updof
 * oraz art. 47 ust. 1 pkt 3 u.s.u.s.). Za grudzień termin przypada
 * 20 stycznia roku następnego.
 */
export function nextPaymentDeadline(year: number, month: number, today?: Date): PaymentDeadline {
  let dueYear = year;
  let dueMonth = month + 1;
  if (dueMonth > 12) {
    dueMonth = 1;
    dueYear += 1;
  }
  const daysLeft = daysBetween(today ?? new Date(), dueYear, dueMonth, PAYMENT_DEADLINE_DAY);
  return {
    dueDate: `${dueYear}-${pad2(dueMonth)}-${pad2(PAYMENT_DEADLINE_DAY)}`,
    daysLeft,
    isOverdue: daysLeft < 0,
  };
}

/**
 * Termin wpłaty przy rozliczeniu kwartalnym — 20. dzień miesiąca następującego
 * po kwartale: 20.04, 20.07, 20.10 oraz 20.01 roku następnego
 * (art. 44 ust. 6 updof, art. 103 ust. 2a ustawy o VAT).
 */
export function quarterlyPaymentDeadline(year: number, quarter: number, today?: Date): PaymentDeadline {
  const safeQuarter = Math.min(4, Math.max(1, Math.trunc(quarter)));
  return nextPaymentDeadline(year, safeQuarter * 3, today);
}

/** Ostatni miesiąc kwartału (1..12). */
export function quarterLastMonth(quarter: number): number {
  return Math.min(4, Math.max(1, Math.trunc(quarter))) * 3;
}

/** Kwartał, do którego należy miesiąc. */
export function monthToQuarter(month: number): number {
  return Math.floor((Math.min(12, Math.max(1, Math.trunc(month))) - 1) / 3) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Składki ZUS
// ─────────────────────────────────────────────────────────────────────────────

interface SocialBreakdown {
  base: number;
  pension: number;
  disability: number;
  sickness: number;
  accident: number;
  labourFund: number;
  /** Suma składek społecznych (bez FP/FS i bez zdrowotnej). */
  insuranceTotal: number;
  /** Suma do zapłaty do ZUS z tytułu społecznych + FP/FS. */
  total: number;
}

/** Podstawa wymiaru składek społecznych dla wybranego schematu. */
function resolveSocialBase(input: TaxCalculationInput, params: TaxYearParams): number {
  switch (input.zusScheme) {
    case "full":
      // art. 18 ust. 8 u.s.u.s. — 60 % prognozowanego przeciętnego wynagrodzenia
      return params.socialBaseFull;
    case "preferential":
      // art. 18a ust. 1 u.s.u.s. — 30 % minimalnego wynagrodzenia, przez 24 miesiące
      return params.socialBasePreferential;
    case "maly_zus_plus": {
      // art. 18c ust. 2 u.s.u.s. — podstawa indywidualna, ograniczona widełkami
      const custom = input.zusCustomSocialBase ?? params.malyZusPlusMin;
      return Math.min(params.malyZusPlusMax, Math.max(params.malyZusPlusMin, custom));
    }
    case "ulga_na_start":
      // art. 18 ust. 1 ustawy — Prawo przedsiębiorców: 6 miesięcy bez składek społecznych
      return 0;
    case "none":
    default:
      return 0;
  }
}

/** Rozkład składek społecznych od danej podstawy (bez uwzględnienia wakacji składkowych). */
function computeSocial(input: TaxCalculationInput, params: TaxYearParams, base: number): SocialBreakdown {
  if (base <= 0) {
    return {
      base: 0,
      pension: 0,
      disability: 0,
      sickness: 0,
      accident: 0,
      labourFund: 0,
      insuranceTotal: 0,
      total: 0,
    };
  }

  const pension = percentOf(base, ZUS_RATES.pension);
  const disability = percentOf(base, ZUS_RATES.disability);

  // art. 20 ust. 3 u.s.u.s. — podstawa chorobowej ograniczona miesięcznym limitem
  const sicknessBase = Math.min(base, params.monthlySicknessCap);
  const sickness = input.zusSickness ? percentOf(sicknessBase, ZUS_RATES.sickness) : 0;

  const accidentRate = Number.isFinite(input.zusAccidentRate) && input.zusAccidentRate > 0
    ? input.zusAccidentRate
    : ZUS_RATES.accidentDefault;
  const accident = percentOf(base, accidentRate);

  /**
   * art. 104 ust. 1 i art. 104b ustawy o promocji zatrudnienia — składki na FP i FS
   * opłaca się tylko wtedy, gdy podstawa wymiaru jest co najmniej równa minimalnemu
   * wynagrodzeniu. Przy preferencyjnej podstawie (30 % minimalnego wynagrodzenia)
   * składka FP/FS nie występuje.
   */
  const labourFundDue = input.zusLabourFund && base >= params.minWage;
  const labourFund = labourFundDue ? percentOf(base, ZUS_RATES.labourFund) : 0;

  const insuranceTotal = sumMoney([pension, disability, sickness, accident]);

  return {
    base: round2(base),
    pension,
    disability,
    sickness,
    accident,
    labourFund,
    insuranceTotal,
    total: sumMoney([insuranceTotal, labourFund]),
  };
}

/**
 * Minimalna podstawa składki zdrowotnej obowiązująca w ROKU SKŁADKOWYM
 * (1 lutego – 31 stycznia). Dla stycznia obowiązuje jeszcze minimum ustalone
 * 1 lutego roku poprzedniego, dlatego nadpisania parametrów bieżącego roku
 * nie mają wtedy zastosowania.
 */
function resolveHealthMinBase(year: number, month: number, merged: TaxYearParams): number {
  if (month === 1) return getYearParams(year - 1).healthMinBaseFromFebruary;
  return merged.healthMinBaseFromFebruary;
}

interface HealthBreakdown {
  base: number;
  amount: number;
  description: string;
  legalBasis: string;
}

/** Składka zdrowotna według formy opodatkowania (zasady „Polskiego Ładu"). */
function computeHealth(
  input: TaxCalculationInput,
  params: TaxYearParams,
  minBase: number
): HealthBreakdown {
  if (input.zusScheme === "none") {
    return {
      base: 0,
      amount: 0,
      description: "Brak tytułu do ubezpieczenia zdrowotnego w działalności.",
      legalBasis: "art. 66 ustawy o świadczeniach opieki zdrowotnej",
    };
  }

  if (input.taxationForm === "ryczalt") {
    // art. 81 ust. 2e ustawy o świadczeniach — 3 progi przychodu narastająco
    // liczone od początku ROKU KALENDARZOWEGO.
    const revenue = Math.max(0, input.revenueYtd);
    const { lowerRevenue, upperRevenue, lowerFactor, middleFactor, upperFactor } =
      HEALTH_RYCZALT_THRESHOLDS;

    let factor: number = upperFactor;
    let bracket = `powyżej ${upperRevenue.toLocaleString("pl-PL")} zł → 180 %`;
    if (revenue <= lowerRevenue) {
      factor = lowerFactor;
      bracket = `do ${lowerRevenue.toLocaleString("pl-PL")} zł → 60 %`;
    } else if (revenue <= upperRevenue) {
      factor = middleFactor;
      bracket = `do ${upperRevenue.toLocaleString("pl-PL")} zł → 100 %`;
    }

    const base = round2(params.enterpriseAverageWageQ4 * factor);
    return {
      base,
      amount: percentOf(base, HEALTH_RATE),
      description:
        `Przychód narastająco ${round2(revenue).toFixed(2)} zł (${bracket}) → podstawa ` +
        `${base.toFixed(2)} zł × 9 %`,
      legalBasis: "art. 81 ust. 2e ustawy o świadczeniach opieki zdrowotnej",
    };
  }

  const previousIncome = Math.max(0, input.previousMonthIncome ?? 0);

  if (input.taxationForm === "liniowy") {
    // art. 79a ust. 1 i art. 81 ust. 2 pkt 1 ustawy o świadczeniach — 4,9 % dochodu,
    // nie mniej niż 9 % minimalnej podstawy roku składkowego.
    const fromIncome = percentOf(previousIncome, HEALTH_RATE_LINEAR);
    const minimum = percentOf(minBase, HEALTH_RATE);
    if (fromIncome >= minimum) {
      return {
        base: round2(previousIncome),
        amount: fromIncome,
        description: `4,9 % × dochód z miesiąca poprzedniego (${round2(previousIncome).toFixed(2)} zł)`,
        legalBasis: "art. 79a ust. 1 ustawy o świadczeniach opieki zdrowotnej",
      };
    }
    return {
      base: round2(minBase),
      amount: minimum,
      description:
        `4,9 % × ${round2(previousIncome).toFixed(2)} zł = ${fromIncome.toFixed(2)} zł ` +
        `< minimum 9 % × ${round2(minBase).toFixed(2)} zł`,
      legalBasis: "art. 81 ust. 2 pkt 1 ustawy o świadczeniach opieki zdrowotnej (minimalna podstawa)",
    };
  }

  // Skala podatkowa — 9 % dochodu z miesiąca poprzedzającego, nie mniej niż
  // 9 % minimalnej podstawy roku składkowego (art. 79 ust. 1, art. 81 ust. 2).
  const effectiveBase = Math.max(previousIncome, minBase);
  const usedMinimum = effectiveBase === minBase && previousIncome < minBase;
  return {
    base: round2(effectiveBase),
    amount: percentOf(effectiveBase, HEALTH_RATE),
    description: usedMinimum
      ? `9 % × minimalna podstawa roku składkowego (${round2(minBase).toFixed(2)} zł)`
      : `9 % × dochód z miesiąca poprzedniego (${round2(previousIncome).toFixed(2)} zł)`,
    legalBasis: "art. 79 ust. 1 w zw. z art. 81 ust. 2 ustawy o świadczeniach opieki zdrowotnej",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIT
// ─────────────────────────────────────────────────────────────────────────────

/** Podatek według skali podatkowej (art. 27 ust. 1 updof) od podstawy w pełnych złotych. */
export function pitScaleTax(base: number, applyTaxReducingAmount: boolean): number {
  if (base <= 0) return 0;
  if (base <= PIT_SCALE_THRESHOLD) {
    const gross = (base * PIT_SCALE_RATE_LOW) / 100;
    const relief = applyTaxReducingAmount ? PIT_TAX_REDUCING_AMOUNT : 0;
    return clampZero(round2(gross - relief));
  }
  const fixed = applyTaxReducingAmount
    ? PIT_SCALE_BASE_TAX_AT_THRESHOLD
    : PIT_SCALE_BASE_TAX_AT_THRESHOLD_NO_RELIEF;
  return round2(fixed + ((base - PIT_SCALE_THRESHOLD) * PIT_SCALE_RATE_HIGH) / 100);
}

/** Podatek ryczałtowy od przychodu (art. 12 ustawy o ryczałcie). */
export function ryczaltTax(base: number, rate: number, surchargeEnabled: boolean): number {
  if (base <= 0) return 0;
  if (!surchargeEnabled) return round2((base * rate) / 100);
  // art. 12 ust. 1 pkt 4 lit. a — 12,5 % od nadwyżki ponad 100 000 zł
  const lower = Math.min(base, RYCZALT_SURCHARGE_THRESHOLD);
  const upper = clampZero(base - RYCZALT_SURCHARGE_THRESHOLD);
  return round2((lower * rate) / 100 + (upper * RYCZALT_SURCHARGE_RATE) / 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Kalkulator główny
// ─────────────────────────────────────────────────────────────────────────────

export function calculateTaxes(input: TaxCalculationInput): TaxCalculationResult {
  const month = Math.min(12, Math.max(1, Math.trunc(input.month)));
  const year = Math.trunc(input.year);

  // Parametry roczne + nadpisania z profilu podatkowego
  const params: TaxYearParams = { ...getYearParams(year), ...(input.params ?? {}), year };

  const steps: TaxCalculationStep[] = [];
  const notes: string[] = [];

  // ── Podstawy ────────────────────────────────────────────────────────────
  const revenueNet = round2(input.revenueNet);
  const costsNet = round2(input.costsNet);
  const incomeBase = round2(revenueNet - costsNet);
  const revenueYtd = round2(input.revenueYtd);
  const costsYtd = round2(input.costsYtd);
  const incomeYtd = round2(revenueYtd - costsYtd);

  steps.push({
    label: "Dochód za okres",
    formula: `${revenueNet.toFixed(2)} zł (przychód) − ${costsNet.toFixed(2)} zł (koszty)`,
    value: incomeBase,
    legalBasis: "art. 9 ust. 2 updof",
  });
  steps.push({
    label: "Dochód narastająco od początku roku",
    formula: `${revenueYtd.toFixed(2)} zł − ${costsYtd.toFixed(2)} zł`,
    value: incomeYtd,
    legalBasis: "art. 44 ust. 3 updof",
  });

  // ── ZUS — składki społeczne ─────────────────────────────────────────────
  const socialBase = resolveSocialBase(input, params);
  const nominalSocial = computeSocial(input, params, socialBase);

  const holidayMonth = input.zusHolidayMonth ?? null;
  const zusHolidayApplied =
    holidayMonth !== null && holidayMonth === month && socialBase > 0;

  const social: SocialBreakdown = zusHolidayApplied
    ? {
        ...nominalSocial,
        pension: 0,
        disability: 0,
        sickness: 0,
        accident: 0,
        labourFund: 0,
        insuranceTotal: 0,
        total: 0,
      }
    : nominalSocial;

  if (zusHolidayApplied) {
    notes.push(
      "Wakacje składkowe — składki społeczne i FP/FS za ten miesiąc finansuje budżet państwa " +
        "(art. 17a ustawy o systemie ubezpieczeń społecznych). Składka zdrowotna pozostaje do zapłaty."
    );
  }

  if (input.zusScheme === "ulga_na_start") {
    notes.push(
      "Ulga na start — przez 6 miesięcy nie opłaca się składek społecznych ani FP/FS " +
        "(art. 18 ustawy Prawo przedsiębiorców). Składka zdrowotna jest należna w pełnej wysokości."
    );
  }

  if (socialBase > 0 && input.zusLabourFund && socialBase < params.minWage) {
    notes.push(
      `Składka FP/FS nie jest należna — podstawa ${round2(socialBase).toFixed(2)} zł jest niższa ` +
        `od minimalnego wynagrodzenia ${params.minWage.toFixed(2)} zł (art. 104 ustawy o promocji zatrudnienia).`
    );
  }

  if (socialBase > 0) {
    steps.push({
      label: "Podstawa wymiaru składek społecznych",
      formula:
        input.zusScheme === "full"
          ? `60 % × ${params.projectedAverageWage.toFixed(2)} zł (prognozowane przeciętne wynagrodzenie)`
          : input.zusScheme === "preferential"
            ? `30 % × ${params.minWage.toFixed(2)} zł (minimalne wynagrodzenie)`
            : `podstawa indywidualna Mały ZUS Plus (widełki ${params.malyZusPlusMin.toFixed(2)}–${params.malyZusPlusMax.toFixed(2)} zł)`,
      value: round2(socialBase),
      legalBasis:
        input.zusScheme === "full"
          ? "art. 18 ust. 8 u.s.u.s."
          : input.zusScheme === "preferential"
            ? "art. 18a ust. 1 u.s.u.s."
            : "art. 18c ust. 2 u.s.u.s.",
    });
    steps.push({
      label: "Składka emerytalna",
      formula: `${round2(socialBase).toFixed(2)} zł × 19,52 %`,
      value: social.pension,
      legalBasis: "art. 22 ust. 1 pkt 1 u.s.u.s.",
    });
    steps.push({
      label: "Składka rentowa",
      formula: `${round2(socialBase).toFixed(2)} zł × 8,00 %`,
      value: social.disability,
      legalBasis: "art. 22 ust. 1 pkt 2 u.s.u.s.",
    });
    if (input.zusSickness) {
      steps.push({
        label: "Składka chorobowa (dobrowolna)",
        formula: `${round2(socialBase).toFixed(2)} zł × 2,45 %`,
        value: social.sickness,
        legalBasis: "art. 22 ust. 1 pkt 3 u.s.u.s.",
      });
    }
    steps.push({
      label: "Składka wypadkowa",
      formula: `${round2(socialBase).toFixed(2)} zł × ${(input.zusAccidentRate || ZUS_RATES.accidentDefault)
        .toFixed(2)
        .replace(".", ",")} %`,
      value: social.accident,
      legalBasis: "art. 22 ust. 1 pkt 4 u.s.u.s.",
    });
    steps.push({
      label: "Fundusz Pracy i Fundusz Solidarnościowy",
      formula:
        social.labourFund > 0
          ? `${round2(socialBase).toFixed(2)} zł × 2,45 %`
          : "nie dotyczy (podstawa niższa od minimalnego wynagrodzenia lub wyłączone)",
      value: social.labourFund,
      legalBasis: "art. 104 ustawy o promocji zatrudnienia i instytucjach rynku pracy",
    });
  }

  steps.push({
    label: "Składki społeczne razem (z FP/FS)",
    formula: "emerytalna + rentowa + chorobowa + wypadkowa + FP/FS",
    value: social.total,
    legalBasis: "art. 22 u.s.u.s.",
  });

  // ── ZUS — składka zdrowotna ─────────────────────────────────────────────
  const healthMinBase = resolveHealthMinBase(year, month, params);
  const health = computeHealth(input, params, healthMinBase);

  steps.push({
    label: "Składka zdrowotna",
    formula: health.description,
    value: health.amount,
    legalBasis: health.legalBasis,
  });

  if (month === 1 && input.taxationForm !== "ryczalt") {
    notes.push(
      `Za styczeń obowiązuje jeszcze minimalna podstawa składki zdrowotnej z roku składkowego ` +
        `02/${year - 1}–01/${year}, tj. ${healthMinBase.toFixed(2)} zł ` +
        `(rok składkowy trwa od 1 lutego do 31 stycznia — art. 81 ust. 2 ustawy o świadczeniach).`
    );
  }

  const zusTotal = sumMoney([social.total, health.amount]);

  // ── Odliczenia składkowe narastająco ────────────────────────────────────
  /**
   * Liczba miesięcy, w których składki były faktycznie należne — z wyłączeniem
   * miesiąca wakacji składkowych, jeżeli już upłynął.
   */
  const holidayAlreadyPassed =
    holidayMonth !== null && holidayMonth >= 1 && holidayMonth <= month && socialBase > 0;
  const contributionMonths = Math.max(0, month - (holidayAlreadyPassed ? 1 : 0));

  /**
   * Do odliczenia od dochodu (art. 26 ust. 1 pkt 2 updof) kwalifikują się tylko
   * składki na ubezpieczenia społeczne. Składka na FP/FS nie jest odliczana
   * od dochodu — stanowi wyłącznie koszt uzyskania przychodu (art. 22 ust. 1 updof).
   */
  const socialInsuranceYtd = round2(input.socialPaidYtd === undefined ? nominalSocial.insuranceTotal * contributionMonths : Math.max(0,input.socialPaidYtd));
  const healthPaidYtd = round2(Math.max(0, input.healthPaidYtd ?? 0));

  const lossCarryForward = round2(Math.max(0, input.lossCarryForward));
  const paidAdvancesYtd = round2(Math.max(0, input.paidAdvancesYtd));

  let pitBase = 0;
  let pitTaxYtd = 0;
  let pitRateApplied = 0;
  let socialDeductedYtd = 0;
  let healthDeductedYtd = 0;

  if (input.taxationForm === "ryczalt") {
    // ── Ryczałt od przychodów ewidencjonowanych ──────────────────────────
    const rate = input.ryczaltRate ?? 8.5;

    // art. 11 ust. 1 ustawy o ryczałcie — składki społeczne odliczane od przychodu
    // (ryczałt nie zna kosztów uzyskania przychodu, więc odliczenie jest zawsze bezpośrednie).
    socialDeductedYtd = socialInsuranceYtd;
    // art. 11 ust. 1a ustawy o ryczałcie — 50 % zapłaconych składek zdrowotnych, bez limitu
    healthDeductedYtd = round2(healthPaidYtd * RYCZALT_HEALTH_DEDUCTION_SHARE);

    const rawBase = revenueYtd - socialDeductedYtd - healthDeductedYtd;
    pitBase = roundToZloty(clampZero(rawBase));

    steps.push({
      label: "Podstawa ryczałtu narastająco",
      formula:
        `${revenueYtd.toFixed(2)} zł (przychód) − ${socialDeductedYtd.toFixed(2)} zł (składki społeczne) ` +
        `− ${healthDeductedYtd.toFixed(2)} zł (50 % składki zdrowotnej)`,
      value: pitBase,
      legalBasis: "art. 11 ust. 1 i 1a ustawy o zryczałtowanym podatku dochodowym",
    });

    const surchargeEnabled = input.ryczaltSurchargeEnabled === true;
    pitTaxYtd = roundToZloty(ryczaltTax(pitBase, rate, surchargeEnabled));
    pitRateApplied =
      surchargeEnabled && pitBase > RYCZALT_SURCHARGE_THRESHOLD ? RYCZALT_SURCHARGE_RATE : rate;

    steps.push({
      label: "Ryczałt narastająco",
      formula: surchargeEnabled
        ? `${rate.toString().replace(".", ",")} % do 100 000 zł + 12,5 % od nadwyżki`
        : `${pitBase.toFixed(2)} zł × ${rate.toString().replace(".", ",")} %`,
      value: pitTaxYtd,
      legalBasis: "art. 12 ust. 1 ustawy o zryczałtowanym podatku dochodowym",
    });
  } else {
    // ── Skala podatkowa / podatek liniowy ────────────────────────────────
    socialDeductedYtd = input.socialInCosts ? 0 : socialInsuranceYtd;

    if (input.taxationForm === "liniowy") {
      // art. 30c ust. 2 pkt 2 updof — składka zdrowotna odliczana od dochodu
      // (albo ujmowana w KUP) do rocznego limitu.
      healthDeductedYtd = round2(Math.min(healthPaidYtd, params.linearHealthDeductionLimit));
      if (healthPaidYtd > params.linearHealthDeductionLimit) {
        notes.push(
          `Odliczenie składki zdrowotnej ograniczono do rocznego limitu ` +
            `${params.linearHealthDeductionLimit.toFixed(2)} zł (art. 30c ust. 2 pkt 2 updof).`
        );
      }
    } else {
      // Skala podatkowa — składka zdrowotna NIE podlega odliczeniu
      // (uchylony art. 27b updof; zasady „Polskiego Ładu").
      healthDeductedYtd = 0;
      notes.push(
        "Przy skali podatkowej składka zdrowotna nie podlega odliczeniu od podatku ani od dochodu " +
          "(art. 27b updof został uchylony)."
      );
    }

    const rawBase = incomeYtd - lossCarryForward - socialDeductedYtd - healthDeductedYtd;
    pitBase = roundToZloty(clampZero(rawBase));

    const deductionParts = [`${incomeYtd.toFixed(2)} zł (dochód narastająco)`];
    if (lossCarryForward > 0) deductionParts.push(`− ${lossCarryForward.toFixed(2)} zł (strata z lat poprzednich)`);
    if (socialDeductedYtd > 0) deductionParts.push(`− ${socialDeductedYtd.toFixed(2)} zł (składki społeczne)`);
    if (healthDeductedYtd > 0) deductionParts.push(`− ${healthDeductedYtd.toFixed(2)} zł (składka zdrowotna)`);

    steps.push({
      label: "Podstawa obliczenia podatku narastająco",
      formula: deductionParts.join(" "),
      value: pitBase,
      legalBasis:
        input.taxationForm === "liniowy"
          ? "art. 30c ust. 2 updof, art. 26 ust. 1 pkt 2 updof, art. 63 § 1 Ordynacji podatkowej"
          : "art. 26 ust. 1 pkt 2 updof, art. 63 § 1 Ordynacji podatkowej",
    });

    if (input.taxationForm === "liniowy") {
      pitTaxYtd = roundToZloty((pitBase * PIT_LINEAR_RATE) / 100);
      pitRateApplied = PIT_LINEAR_RATE;
      steps.push({
        label: "Podatek liniowy narastająco",
        formula: `${pitBase.toFixed(2)} zł × 19 %`,
        value: pitTaxYtd,
        legalBasis: "art. 30c ust. 1 updof",
      });
    } else {
      pitTaxYtd = roundToZloty(pitScaleTax(pitBase, input.applyTaxReducingAmount));
      pitRateApplied = pitBase > PIT_SCALE_THRESHOLD ? PIT_SCALE_RATE_HIGH : PIT_SCALE_RATE_LOW;
      steps.push({
        label: "Podatek według skali narastająco",
        formula:
          pitBase > PIT_SCALE_THRESHOLD
            ? `${input.applyTaxReducingAmount ? "10 800,00" : "14 400,00"} zł + 32 % × ` +
              `(${pitBase.toFixed(2)} zł − 120 000,00 zł)`
            : `${pitBase.toFixed(2)} zł × 12 %` +
              (input.applyTaxReducingAmount ? " − 3 600,00 zł (kwota zmniejszająca)" : ""),
        value: pitTaxYtd,
        legalBasis: "art. 27 ust. 1 updof",
      });
    }
  }

  // ── Zaliczka na PIT ─────────────────────────────────────────────────────
  const pitAdvance = round2(clampZero(pitTaxYtd - paidAdvancesYtd));
  const pitDeferred = pitAdvance > 0 && pitAdvance <= PIT_ADVANCE_DEFERRAL_THRESHOLD;
  const pitAdvanceRounded = pitDeferred ? 0 : roundToZloty(pitAdvance);

  steps.push({
    label: "Zaliczka za okres",
    formula: `${pitTaxYtd.toFixed(2)} zł (podatek narastająco) − ${paidAdvancesYtd.toFixed(2)} zł (zaliczki wpłacone)`,
    value: pitAdvance,
    legalBasis: "art. 44 ust. 3 updof",
  });

  if (pitDeferred) {
    notes.push(
      `Zaliczki nie wpłaca się — podatek należny od dochodu od początku roku pomniejszony o wpłacone ` +
        `zaliczki (${pitAdvance.toFixed(2)} zł) nie przekroczył 1 000,00 zł ` +
        `(art. 44 ust. 15–16 updof). Obowiązek powstanie w miesiącu przekroczenia progu.`
    );
    steps.push({
      label: "Próg odroczenia wpłaty zaliczki",
      formula: `${pitAdvance.toFixed(2)} zł ≤ 1 000,00 zł → zaliczki nie wpłaca się`,
      value: 0,
      legalBasis: "art. 44 ust. 15–16 updof",
    });
  } else if (pitAdvanceRounded > 0) {
    steps.push({
      label: "Zaliczka po zaokrągleniu do pełnych złotych",
      formula: `${pitAdvance.toFixed(2)} zł → ${pitAdvanceRounded.toFixed(2)} zł`,
      value: pitAdvanceRounded,
      legalBasis: "art. 63 § 1 Ordynacji podatkowej",
    });
  }

  // ── VAT i suma ──────────────────────────────────────────────────────────
  const vatDue = round2(Math.max(0, input.vatDue ?? 0));
  if (vatDue > 0) {
    steps.push({
      label: "VAT do zapłaty za okres",
      formula: "pozycja P_51 deklaracji JPK_V7",
      value: vatDue,
      legalBasis: "art. 103 ust. 1 ustawy o VAT",
    });
  }

  const totalDue = sumMoney([zusTotal, pitAdvanceRounded, vatDue]);
  steps.push({
    label: "Razem do zapłaty",
    formula: `${zusTotal.toFixed(2)} zł (ZUS) + ${pitAdvanceRounded.toFixed(2)} zł (PIT) + ${vatDue.toFixed(2)} zł (VAT)`,
    value: totalDue,
  });

  const deadline = nextPaymentDeadline(year, month, input.today);

  return {
    year,
    month,
    periodLabel: `${year}-${pad2(month)}`,

    taxationForm: input.taxationForm,
    ryczaltRate: input.taxationForm === "ryczalt" ? (input.ryczaltRate ?? 8.5) : null,
    params,

    revenueNet,
    costsNet,
    incomeBase,
    revenueYtd,
    costsYtd,
    incomeYtd,

    zusSocialBase: social.base,
    zusPension: social.pension,
    zusDisability: social.disability,
    zusSickness: social.sickness,
    zusAccident: social.accident,
    zusLabourFund: social.labourFund,
    zusSocialTotal: social.total,
    zusHealthBase: health.base,
    zusHealth: health.amount,
    zusTotal,
    zusSocialDeductedYtd: socialDeductedYtd,
    zusHealthDeductedYtd: healthDeductedYtd,
    zusHolidayApplied,

    pitBase,
    pitRateApplied,
    pitTaxYtd,
    pitAdvance,
    pitAdvanceRounded,
    pitDeferred,

    vatDue,
    totalDue,
    dueDate: deadline.dueDate,
    daysLeft: deadline.daysLeft,
    isOverdue: deadline.isOverdue,

    steps,
    notes,
  };
}

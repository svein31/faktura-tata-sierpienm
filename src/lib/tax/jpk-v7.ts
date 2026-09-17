/**
 * Generator plików JPK_V7M i JPK_V7K — ewidencja VAT wraz z deklaracją.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * WERSJE SCHEMATÓW
 * ──────────────────────────────────────────────────────────────────────────────
 * Wariant (3) obowiązuje od rozliczeń za LUTY 2026 r. Okresy do stycznia 2026 r.
 * włącznie rozlicza się jeszcze wariantem (2). Najważniejsze różnice wariantu (3):
 *  • obowiązkowy węzeł wyboru identyfikacji dokumentu w KSeF w każdym wierszu
 *    ewidencji (`NrKSeF` | `OFF` | `BFK` | `DI`),
 *  • nowe pola korygujące `K_360` (ewidencja) i `P_360` (deklaracja),
 *  • deklaracja VAT-7 w wersji 23 (VAT-7K w wersji 17).
 *
 * Podstawy prawne:
 *  • art. 99 ust. 11c i art. 109 ust. 3b ustawy z 11.03.2004 r. o podatku
 *    od towarów i usług — obowiązek przesyłania ewidencji wraz z deklaracją,
 *  • rozporządzenie Ministra Finansów z 15.10.2019 r. w sprawie szczegółowego
 *    zakresu danych zawartych w deklaracjach podatkowych i w ewidencji VAT
 *    (§ 10 — ewidencja sprzedaży, § 11 — ewidencja zakupu),
 *  • art. 106nf i art. 106nh ustawy o VAT — tryby offline w KSeF.
 */

import { round2, roundToZloty, sumMoney } from "./money";
import {
  allowsGtuCodes,
  classifyZeroRate,
  cleanNip,
  isReceiptInvoice,
  KSEF_NUMBER_PATTERN,
  lineNetAmount,
  lineVatAmount,
  normalizeVatRate,
  orderedGtuCodes,
  orderedProcedures,
  plnConversionFactor,
  PURCHASE_DOC_TYPES,
  resolveTinCountryCode,
  SALES_DOC_TYPES,
  type JpkEntity,
  type JpkPurchaseDocument,
  type JpkSalesDocument,
  type ValidationIssue,
} from "./jpk-common";
import { el, flag, integer, money, node, required, xmlDateTime, xmlDocument, type XmlChild, type XmlNode } from "./xml";

// ─────────────────────────────────────────────────────────────────────────────
// Warianty schematów
// ─────────────────────────────────────────────────────────────────────────────

export type JpkV7Kind = "JPK_V7M" | "JPK_V7K";
export type JpkV7VariantNumber = "2" | "3";

export interface JpkV7Variant {
  kind: JpkV7Kind;
  variant: JpkV7VariantNumber;
  /** Przestrzeń nazw docelowa schematu (targetNamespace). */
  namespaceUri: string;
  /** Atrybut `kodSystemowy` elementu KodFormularza. */
  systemCode: string;
  /** Atrybut `wersjaSchemy` elementu KodFormularza. */
  schemaVersion: string;
  /** Wartość elementu WariantFormularza. */
  formVariant: JpkV7VariantNumber;
  /** Wartość elementu KodFormularzaDekl (VAT-7 / VAT-7K). */
  declarationFormCode: "VAT-7" | "VAT-7K";
  /** Atrybut `kodSystemowy` deklaracji, np. „VAT-7 (23)". */
  declarationSystemCode: string;
  /** Wartość elementu WariantFormularzaDekl. */
  declarationVariant: string;
}

/** Przestrzeń nazw typów wspólnych Ministerstwa Finansów. */
const ETD_NAMESPACE =
  "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

/** Nazwa systemu wpisywana do nagłówka pliku. */
export const JPK_SYSTEM_NAME = "Fakturo 2.0";

export const JPK_V7_VARIANTS: Record<string, JpkV7Variant> = {
  "JPK_V7M(3)": {
    kind: "JPK_V7M",
    variant: "3",
    namespaceUri: "http://crd.gov.pl/wzor/2025/12/19/14090/",
    systemCode: "JPK_V7M (3)",
    schemaVersion: "1-0E",
    formVariant: "3",
    declarationFormCode: "VAT-7",
    declarationSystemCode: "VAT-7 (23)",
    declarationVariant: "23",
  },
  "JPK_V7K(3)": {
    kind: "JPK_V7K",
    variant: "3",
    namespaceUri: "http://crd.gov.pl/wzor/2025/12/19/14089/",
    systemCode: "JPK_V7K (3)",
    schemaVersion: "1-0E",
    formVariant: "3",
    declarationFormCode: "VAT-7K",
    declarationSystemCode: "VAT-7K (17)",
    declarationVariant: "17",
  },
  "JPK_V7M(2)": {
    kind: "JPK_V7M",
    variant: "2",
    namespaceUri: "http://crd.gov.pl/wzor/2021/12/27/11148/",
    systemCode: "JPK_V7M (2)",
    schemaVersion: "1-0E",
    formVariant: "2",
    declarationFormCode: "VAT-7",
    declarationSystemCode: "VAT-7 (22)",
    declarationVariant: "22",
  },
  "JPK_V7K(2)": {
    kind: "JPK_V7K",
    variant: "2",
    namespaceUri: "http://crd.gov.pl/wzor/2021/12/27/11149/",
    systemCode: "JPK_V7K (2)",
    schemaVersion: "1-0E",
    formVariant: "2",
    declarationFormCode: "VAT-7K",
    declarationSystemCode: "VAT-7K (16)",
    declarationVariant: "16",
  },
};

/**
 * Pierwszy okres rozliczany wariantem (3) — luty 2026 r.
 * Wyrażony jako indeks miesiąca (rok × 12 + miesiąc) dla prostego porównania.
 */
const VARIANT_3_FIRST_PERIOD = 2026 * 12 + 2;

/** Wybiera wariant schematu na podstawie okresu rozliczeniowego. */
export function resolveJpkV7Variant(
  kind: JpkV7Kind,
  year: number,
  month: number
): JpkV7Variant {
  const periodIndex = year * 12 + month;
  const variant: JpkV7VariantNumber = periodIndex >= VARIANT_3_FIRST_PERIOD ? "3" : "2";
  return JPK_V7_VARIANTS[`${kind}(${variant})`];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pola ewidencji
// ─────────────────────────────────────────────────────────────────────────────

/** Pola ewidencji sprzedaży w kolejności wymaganej przez schemat. */
const SALES_K_FIELDS = [
  "K_10", "K_11", "K_12", "K_13", "K_14", "K_15", "K_16", "K_17", "K_18",
  "K_19", "K_20", "K_21", "K_22", "K_23", "K_24", "K_25", "K_26", "K_27",
  "K_28", "K_29", "K_30", "K_31", "K_32", "K_33", "K_34", "K_35", "K_36",
] as const;

type SalesKField = (typeof SALES_K_FIELDS)[number] | "K_360";

type SalesAmounts = Record<SalesKField, number>;

function emptySalesAmounts(): SalesAmounts {
  const amounts = {} as SalesAmounts;
  for (const field of SALES_K_FIELDS) amounts[field] = 0;
  amounts.K_360 = 0;
  return amounts;
}

/** Pola ewidencji zakupu w kolejności wymaganej przez schemat. */
const PURCHASE_K_FIELDS = ["K_40", "K_41", "K_42", "K_43", "K_44", "K_45", "K_46", "K_47"] as const;

type PurchaseKField = (typeof PURCHASE_K_FIELDS)[number];

type PurchaseAmounts = Record<PurchaseKField, number>;

function emptyPurchaseAmounts(): PurchaseAmounts {
  const amounts = {} as PurchaseAmounts;
  for (const field of PURCHASE_K_FIELDS) amounts[field] = 0;
  return amounts;
}

/**
 * Rozdziela kwoty dokumentu sprzedaży na pola K_ ewidencji.
 *
 * Mapowanie stawek:
 *  • 23 % / 22 %          → K_19 (podstawa) i K_20 (podatek),
 *  • 8 % / 7 %            → K_17 i K_18,
 *  • 5 %                  → K_15 i K_16,
 *  • 0 % krajowa          → K_13,
 *  • 0 % do UE (WDT)      → K_21,
 *  • 0 % poza UE (eksport)→ K_22,
 *  • „zw"                 → K_10,
 *  • „np" / poza krajem   → K_11,
 *  • „oo" (art. 17 ust. 1 pkt 5) → K_31 i K_32.
 */
export function computeSalesAmounts(
  doc: JpkSalesDocument,
  issues: ValidationIssue[],
  row: number
): { amounts: SalesAmounts; net: number; vat: number; gross: number } {
  const amounts = emptySalesAmounts();

  const netInCurrency = sumMoney(doc.lines.map(lineNetAmount));
  const factor = plnConversionFactor(doc, netInCurrency);

  if (factor === 0) {
    issues.push({
      level: "error",
      code: "JPK_MISSING_EXCHANGE_RATE",
      message:
        `Dokument ${doc.number} jest wystawiony w walucie ${String(doc.currency).toUpperCase()}, ` +
        "ale nie ma zapisanego kursu NBP ani kwot w PLN. Ewidencja VAT musi być prowadzona w złotych " +
        "(art. 31a ustawy o VAT).",
      row,
      document: doc.number,
    });
  }

  const rate = factor === 0 ? 1 : factor;
  const zeroDirection = classifyZeroRate(doc.contractorCountry);
  const wstoEe = doc.isWstoEe === true;

  let net = 0;
  let vat = 0;

  for (const line of doc.lines) {
    const lineNetPln = round2(lineNetAmount(line) * rate);
    const lineVatPln = round2(lineVatAmount(line) * rate);
    net = round2(net + lineNetPln);
    vat = round2(vat + lineVatPln);

    const normalized = normalizeVatRate(line.vatRate);

    /**
     * WSTO oraz usługi TBE rozliczane w procedurze OSS nie są opodatkowane
     * w Polsce — w ewidencji krajowej trafiają do K_11 (dostawa poza
     * terytorium kraju), a szczegóły wykazuje deklaracja VIU-DO.
     */
    if (wstoEe) {
      amounts.K_11 = round2(amounts.K_11 + lineNetPln);
      continue;
    }

    switch (normalized) {
      case "23":
      case "22":
        amounts.K_19 = round2(amounts.K_19 + lineNetPln);
        amounts.K_20 = round2(amounts.K_20 + lineVatPln);
        break;
      case "8":
      case "7":
        amounts.K_17 = round2(amounts.K_17 + lineNetPln);
        amounts.K_18 = round2(amounts.K_18 + lineVatPln);
        break;
      case "5":
        amounts.K_15 = round2(amounts.K_15 + lineNetPln);
        amounts.K_16 = round2(amounts.K_16 + lineVatPln);
        break;
      case "0":
        if (zeroDirection === "intraCommunity") {
          amounts.K_21 = round2(amounts.K_21 + lineNetPln);
        } else if (zeroDirection === "export") {
          amounts.K_22 = round2(amounts.K_22 + lineNetPln);
        } else {
          amounts.K_13 = round2(amounts.K_13 + lineNetPln);
        }
        break;
      case "zw":
        amounts.K_10 = round2(amounts.K_10 + lineNetPln);
        break;
      case "oo":
        amounts.K_31 = round2(amounts.K_31 + lineNetPln);
        amounts.K_32 = round2(amounts.K_32 + lineVatPln);
        break;
      case "np":
      default:
        amounts.K_11 = round2(amounts.K_11 + lineNetPln);
        break;
    }
  }

  return { amounts, net, vat, gross: round2(net + vat) };
}

/**
 * Rozdziela kwoty dokumentu zakupu na pola K_40–K_43.
 *
 * Nabycia zaliczane do środków trwałych trafiają do K_40 (netto) i K_41 (VAT).
 * Pozostałe nabycia towarów i usług trafiają do K_42 (netto) i K_43 (VAT).
 */
export function mapPurchaseAmounts(
  doc: JpkPurchaseDocument,
  row: number,
  issues: ValidationIssue[]
): {
  amounts: { K_40: number; K_41: number; K_42: number; K_43: number };
  net: number;
  vat: number;
} {
  const factor = plnConversionFactor(doc as any, doc.totalNet);
  const rate = factor === 0 ? 1 : factor;

  const deductibleRatio = doc.vatDeductible === false ? 0 : ((doc.vatDeductiblePercent ?? 100) / 100);
  const netPln = round2((doc as any).totalNetPln ?? (doc.totalNet * rate));
  const vatPln = round2(((doc as any).totalVatPln ?? (doc.totalVat * rate)) * deductibleRatio);

  const amounts = { K_40: 0, K_41: 0, K_42: 0, K_43: 0 };
  if (doc.isFixedAsset) {
    amounts.K_40 = netPln;
    amounts.K_41 = vatPln;
  } else {
    amounts.K_42 = netPln;
    amounts.K_43 = vatPln;
  }

  return { amounts, net: netPln, vat: vatPln };
}
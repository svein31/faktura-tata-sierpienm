/**
 * Silnik kursów walut NBP zgodny z art. 31a ustawy o VAT.
 * 
 * Przepisy art. 31a:
 * - ust. 1: Przeliczenia na złote dokonuje się według kursu średniego danej waluty obcej
 *   ogłoszonego przez Narodowy Bank Polski na ostatni dzień roboczy poprzedzający dzień
 *   powstania obowiązku podatkowego.
 * - ust. 2: W przypadku gdy podatnik wystawia fakturę przed powstaniem obowiązku podatkowego,
 *   przeliczenia dokonuje się według kursu średniego ogłoszonego przez NBP na ostatni dzień
 *   roboczy poprzedzający dzień wystawienia faktury.
 */

import type { ExchangeRateRule } from "./types";

export interface NbpRateResponse {
  table: string;
  currency: string;
  code: string;
  rates: Array<{
    no: string;
    effectiveDate: string;
    mid: number;
  }>;
}

export interface ExchangeRateResult {
  currency: string;
  rate: number;
  unit: number;
  tableNumber: string;
  effectiveDate: string;
  source: string;
  rule: ExchangeRateRule;
  ruleDescription: string;
  targetReferenceDate: string;
  calculationNote: string;
}

export class NbpApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "NbpApiError";
    this.statusCode = statusCode;
  }
}

/** Słownik znanych walut notowanych w wielokrotnościach jednostki (np. 100 HUF w starszych zestawieniach) */
export const CURRENCY_UNITS: Record<string, number> = {
  HUF: 1, // NBP podaje obecnie za 1 HUF (dawniej za 100)
  JPY: 1,
  KRW: 1,
};

/**
 * Ustala właściwą datę referencyjną i zastosowaną regułę prawną.
 */
export function resolveRateRuleAndDate(params: {
  rule?: ExchangeRateRule | string | null;
  issueDate: string;
  saleDate: string;
  taxPointDate?: string | null;
}): { targetDate: string; resolvedRule: ExchangeRateRule; ruleDescription: string } {
  const { rule, issueDate, saleDate, taxPointDate } = params;

  // 1. Jeśli użytkownik jawnie wskazał datę powstania obowiązku podatkowego
  if (rule === "art_31a_tax_point" && taxPointDate) {
    return {
      targetDate: taxPointDate,
      resolvedRule: "art_31a_tax_point",
      ruleDescription: `art. 31a ust. 1 ustawy o VAT — dzień powstania obowiązku podatkowego (${taxPointDate})`,
    };
  }

  // 2. Jeśli użytkownik wymusił datę wystawienia faktury
  if (rule === "art_31a_issue_date") {
    return {
      targetDate: issueDate,
      resolvedRule: "art_31a_issue_date",
      ruleDescription: `art. 31a ust. 2 ustawy o VAT — faktura wystawiona przed powstaniem obowiązku (${issueDate})`,
    };
  }

  // 3. Jeśli użytkownik wymusił datę sprzedaży
  if (rule === "art_31a_sale_date") {
    return {
      targetDate: saleDate,
      resolvedRule: "art_31a_sale_date",
      ruleDescription: `art. 31a ust. 1 ustawy o VAT — data wykonania usługi / dostawy towaru (${saleDate})`,
    };
  }

  // 4. Automatyczny wybór wg daty: jeśli wystawiono przed datą sprzedaży (art. 31a ust. 2)
  if (issueDate < saleDate) {
    return {
      targetDate: issueDate,
      resolvedRule: "art_31a_issue_date",
      ruleDescription: `art. 31a ust. 2 ustawy o VAT — wystawienie (${issueDate}) przed datą sprzedaży (${saleDate})`,
    };
  }

  // 5. Zasada podstawowa (art. 31a ust. 1): data sprzedaży / wykonania usługi
  return {
    targetDate: saleDate || issueDate,
    resolvedRule: "art_31a_sale_date",
    ruleDescription: `art. 31a ust. 1 ustawy o VAT — data sprzedaży (${saleDate || issueDate})`,
  };
}

/**
 * Formatuje obiekt Date do "YYYY-MM-DD"
 */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Pobiera oficjalny średni kurs NBP dla danej waluty i daty referencyjnej,
 * cofając się do ostatniego opublikowanego dnia roboczego przed wskazaną datą.
 * 
 * Obsługuje:
 * - weekendy i święta (404 oznacza cofnięcie o kolejny dzień roboczy);
 * - awarie serwera NBP (5xx rzuca NbpApiError, nie podstawia fałszywych kursów);
 * - Tabelę A oraz awaryjnie Tabelę B dla rzadszych walut;
 * - brak podstawiania kursu dzisiejszego ani wartości 1.0!
 */
export async function getEffectiveNbpRate(options: {
  currency: string;
  issueDate: string;
  saleDate?: string;
  taxPointDate?: string;
  rule?: ExchangeRateRule;
}): Promise<ExchangeRateResult> {
  const curr = options.currency.toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(curr)) throw new Error("Nieprawidłowy kod waluty ISO 4217.");
  for (const date of [options.issueDate, options.saleDate, options.taxPointDate]) if (date && !isIsoCalendarDate(date)) throw new Error(`Nieprawidłowa data: ${date}`);
  if (!options.issueDate) throw new Error("Brak daty wystawienia.");

  if (curr === "PLN") {
    return {
      currency: "PLN",
      rate: 1.0,
      unit: 1,
      tableNumber: "N/A",
      effectiveDate: options.saleDate || options.issueDate || toIsoDate(new Date()),
      source: "PLN (waluta bazowa)",
      rule: options.rule || "art_31a_sale_date",
      ruleDescription: "Waluta bazowa PLN (kurs 1:1)",
      targetReferenceDate: options.saleDate || options.issueDate || toIsoDate(new Date()),
      calculationNote: "1 PLN = 1.0000 PLN",
    };
  }

  const { targetDate, resolvedRule, ruleDescription } = resolveRateRuleAndDate({
    rule: options.rule,
    issueDate: options.issueDate,
    saleDate: options.saleDate || options.issueDate,
    taxPointDate: options.taxPointDate,
  });

  const baseDate = new Date(`${targetDate}T12:00:00Z`);
  if (isNaN(baseDate.getTime())) {
    throw new Error(`Nieprawidłowa data referencyjna: ${targetDate}`);
  }

  // Zgodnie z prawem stosujemy kurs z dnia POPRZEDZAJĄCEGO dzień zdarzenia (ostatni roboczy dzień przed)
  baseDate.setUTCDate(baseDate.getUTCDate() - 1);

  const signal = AbortSignal.timeout(15_000);
  const tablesToTry: Array<"a" | "b"> = ["a", "b"];

  for (const tableType of tablesToTry) {
    // Cofamy się maksymalnie do 14 dni wstecz, aby ominąć długie weekendy i święta
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const checkDate = new Date(baseDate);
      checkDate.setUTCDate(checkDate.getUTCDate() - dayOffset);
      const dateStr = toIsoDate(checkDate);

      const url = `https://api.nbp.pl/api/exchangerates/rates/${tableType}/${curr}/${dateStr}/?format=json`;

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal,
        });
      } catch (networkError: any) {
        throw new NbpApiError(
          `Błąd połączenia z serwerem API NBP: ${networkError?.message || "brak odpowiedzi"}. Sprawdź połączenie sieciowe lub wprowadź kurs ręcznie.`
        );
      }

      // Jeśli serwer NBP zgłasza awarię (5xx)
      if (res.status >= 500) {
        throw new NbpApiError(
          `Awaria serwera NBP (HTTP ${res.status}). Serwis NBP jest chwilowo niedostępny. Spróbuj za chwilę lub wprowadź kurs ręcznie z uzasadnieniem.`,
          res.status
        );
      }

      // 404 = brak publikacji tabeli w danym dniu (sobota, niedziela, święto państwowe)
      if (res.status === 404) {
        continue;
      }

      if (!res.ok) throw new NbpApiError(`Błąd odpowiedzi NBP (HTTP ${res.status}).`, res.status);
      if (res.ok) {
        const data = (await res.json()) as NbpRateResponse;
        if (data.rates && data.rates.length > 0) {
          const rateItem = data.rates[0];
          if (data.code !== curr || !Number.isFinite(rateItem.mid) || rateItem.mid <= 0 || rateItem.effectiveDate !== dateStr || !rateItem.no) throw new NbpApiError("NBP zwrócił nieprawidłowy kurs lub datę tabeli.", 502);
          const unit = CURRENCY_UNITS[curr] || 1;
          const tableName = `Tabela ${tableType.toUpperCase()} nr ${rateItem.no} z dnia ${rateItem.effectiveDate}`;

          return {
            currency: curr,
            rate: rateItem.mid,
            unit,
            tableNumber: rateItem.no,
            effectiveDate: rateItem.effectiveDate,
            source: `NBP ${tableName}`,
            rule: resolvedRule,
            ruleDescription,
            targetReferenceDate: targetDate,
            calculationNote: `${unit} ${curr} = ${rateItem.mid.toFixed(4)} PLN (NBP ${rateItem.no} z ${rateItem.effectiveDate})`,
          };
        }
        throw new NbpApiError("NBP zwrócił pustą odpowiedź kursową.", 502);
      }
    }
  }

  throw new NbpApiError(
    `Nie znaleziono tabeli kursów NBP dla waluty ${curr} w okresie 14 dni przed ${targetDate}. Upewnij się, że waluta jest notowana w NBP lub wprowadź kurs własny z uzasadnieniem.`
  );
}

/**
 * Przelicza kwotę w walucie obcej na PLN z dokładnym zaokrągleniem do 2 miejsc po przecinku.
 */
export function convertToPln(amount: number, rate: number, unit: number = 1): number {
  if (!amount || isNaN(amount)) return 0;
  if (!rate || isNaN(rate) || rate <= 0) return 0;
  const effectiveRate = rate / (unit > 0 ? unit : 1);
  return Math.round((amount * effectiveRate + Number.EPSILON) * 100) / 100;
}


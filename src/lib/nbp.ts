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
  tableNumber: string;
  effectiveDate: string;
  source: string;
}

/**
 * Pobiera średni kurs waluty z NBP (Tabela A) na dzień poprzedzający wskazaną datę.
 * Zgodnie z art. 31a ustawy o VAT, stosuje się kurs średni NBP z ostatniego dnia roboczego
 * poprzedzającego dzień powstania obowiązku podatkowego lub wystawienia faktury.
 */
export async function getEffectiveNbpRate(
  currency: string,
  targetDateStr?: string
): Promise<ExchangeRateResult | null> {
  const curr = currency.toUpperCase().trim();
  if (curr === "PLN") {
    return {
      currency: "PLN",
      rate: 1.0,
      tableNumber: "N/A",
      effectiveDate: targetDateStr || new Date().toISOString().slice(0, 10),
      source: "PLN (waluta bazowa)",
    };
  }

  // Obliczamy datę początkową (dzień przed wskazaną datą)
  const baseDate = targetDateStr ? new Date(targetDateStr) : new Date();
  // Cofamy o 1 dzień jako punkt wyjścia (ostatni dzień roboczy przed)
  baseDate.setDate(baseDate.getDate() - 1);

  // Sprawdzamy do 7 dni wstecz, aby ominąć weekendy i święta
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(baseDate);
    checkDate.setDate(checkDate.getDate() - i);
    const dateFormatted = checkDate.toISOString().slice(0, 10);

    try {
      const url = `https://api.nbp.pl/api/exchangerates/rates/a/${curr}/${dateFormatted}/?format=json`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const data = (await res.json()) as NbpRateResponse;
        if (data.rates && data.rates.length > 0) {
          const r = data.rates[0];
          return {
            currency: curr,
            rate: r.mid,
            tableNumber: r.no,
            effectiveDate: r.effectiveDate,
            source: `NBP Tabela A nr ${r.no} z dnia ${r.effectiveDate}`,
          };
        }
      }
    } catch {
      // Ignorujemy i cofamy się kolejny dzień
    }
  }

  // Fallback: pobierz najnowszy dostępny kurs
  try {
    const fallbackUrl = `https://api.nbp.pl/api/exchangerates/rates/a/${curr}/?format=json`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Accept: "application/json" },
    });
    if (fallbackRes.ok) {
      const data = (await fallbackRes.json()) as NbpRateResponse;
      if (data.rates && data.rates.length > 0) {
        const r = data.rates[0];
        return {
          currency: curr,
          rate: r.mid,
          tableNumber: r.no,
          effectiveDate: r.effectiveDate,
          source: `NBP Tabela A nr ${r.no} z dnia ${r.effectiveDate} (najnowszy)`,
        };
      }
    }
  } catch (err) {
    console.error("Błąd pobierania kursu NBP:", err);
  }

  return null;
}

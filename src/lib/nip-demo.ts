import type { NipLookupResult } from "./types";
import { normalizeNip, validateNip } from "./validation";

/**
 * ADAPTER DEMO — lookup NIP w GUS (BIR / REGON).
 *
 * W tej wersji aplikacji endpoint /api/nip-lookup działa w trybie demo:
 * zwraca firmę z lokalnej, przykładowej bazy (rekordy mają poprawne sumy
 * kontrolne NIP, ale NIE są danymi z rejestru GUS).
 *
 * Prawdziwa integracja GUS BIR wymaga klucza API (https://api.stat.gov.pl)
 * i wywołań SOAP do usługi https://bip.gus.pl (po stronie backendu),
 * a następnie odczytu rejestru REGON. Zob. README → „Integracje (mocki)".
 */

export interface DemoCompany {
  nip: string;
  regon: string;
  name: string;
  street: string;
  postal: string;
  city: string;
  country: string;
  isVatPayer: boolean;
}

// Przykładowe podmioty z POPRAWNYMI sumami kontrolnymi NIP (dane fikcyjne, demo).
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    nip: "5270000024",
    regon: "146981234",
    name: "DemoIT Solutions Sp. z o.o.",
    street: "ul. Przykładowa 1",
    postal: "00-001",
    city: "Warszawa",
    country: "PL",
    isVatPayer: true,
  },
  {
    nip: "7010000011",
    regon: "365842177",
    name: "Handel Detaliczny Nowak",
    street: "ul. Polna 12",
    postal: "30-001",
    city: "Kraków",
    country: "PL",
    isVatPayer: true,
  },
  {
    nip: "9510000015",
    regon: "520134668",
    name: "Usługi Budowlane Wiśniewski",
    street: "ul. Leśna 7",
    postal: "80-001",
    city: "Gdańsk",
    country: "PL",
    isVatPayer: true,
  },
  {
    nip: "5250000015",
    regon: "015278944",
    name: "Konsulting Fiskalny Kowalski",
    street: "ul. Miodowa 5",
    postal: "00-123",
    city: "Warszawa",
    country: "PL",
    isVatPayer: true,
  },
  {
    nip: "1130000080",
    regon: "100345672",
    name: "Transport Ekspres Wójcik",
    street: "ul. Długa 3",
    postal: "90-001",
    city: "Łódź",
    country: "PL",
    isVatPayer: true,
  },
];

export function lookupDemoNip(rawNip: string): NipLookupResult {
  const v = validateNip(rawNip);
  if (!v.valid) {
    const reason =
      v.reason === "checksum"
        ? "Nieprawidłowa suma kontrolna NIP — sprawdź numer."
        : v.reason === "format"
          ? "NIP musi zawierać 10 cyfr (np. 527-000-00-24)."
          : "Podaj numer NIP.";
    return { source: "demo", demo: true, error: "INVALID_NIP", message: reason };
  }
  const nip = normalizeNip(rawNip);
  const found = DEMO_COMPANIES.find((c) => c.nip === nip);
  if (!found) {
    return {
      source: "demo",
      demo: true,
      error: "NOT_FOUND",
      message:
        "Nie znaleziono podmiotu w trybie demo. Dostępne numery demo: " +
        DEMO_COMPANIES.map((c) => c.nip).join(", "),
    };
  }
  return {
    source: "demo",
    demo: true,
    company: {
      name: found.name,
      nip: found.nip,
      regon: found.regon,
      address: {
        street: found.street,
        city: found.city,
        postal: found.postal,
        country: found.country,
      },
      isVatPayer: found.isVatPayer,
    },
  };
}

/** Sprawdzenie poprawności sumy kontrolnej (używane też w formularzu). */
export { validateNip, isValidNipFormat, formatNip } from "./validation";

/**
 * Parser odpowiedzi SOAP 1.2 oraz danych podmiotów z GUS BIR 1.1
 */

import type { GusNormalizedCompany, GusRawEntity } from "./constants";

/**
 * Odbezpiecza encje XML (HTML unescape)
 */
export function unescapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, "\r")
    .replace(/&#xA;/g, "\n")
    .replace(/&amp;/g, "&");
}

/**
 * Wyciąga zawartość pojedynczego tagu XML (uwzględnia przestrzenie nazw)
 */
export function extractTagContent(xml: string, tagName: string): string | null {
  if (!xml) return null;
  // Szukamy <tag>...</tag> lub <ns:tag>...</ns:tag>
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Wyciąga wszystkie rekordy zawarte w tagu <dane>...</dane>
 */
export function parseRawGusEntities(rawXml: string): GusRawEntity[] {
  const unescaped = unescapeXml(rawXml);
  const daneBlocks = unescaped.match(/<dane[\s\S]*?<\/dane>/gi);

  if (!daneBlocks || daneBlocks.length === 0) {
    return [];
  }

  return daneBlocks.map((block) => {
    const fields: GusRawEntity = {};
    const tags = [
      "Regon",
      "Nip",
      "StatusNip",
      "Nazwa",
      "Wojewodztwo",
      "Powiat",
      "Gmina",
      "Miejscowosc",
      "KodPocztowy",
      "Ulica",
      "NrNieruchomosci",
      "NrLokalu",
      "Typ",
      "SilosID",
      "DataZakonczeniaDzialalnosci",
      "MiejscowoscPoczty",
      "ErrorCode",
      "ErrorMessagePl",
    ];

    for (const tag of tags) {
      const val = extractTagContent(block, tag);
      if (val !== null && val !== "") {
        (fields as any)[tag] = val;
      }
    }

    return fields;
  });
}

/**
 * Formatuje kod pocztowy do postaci XX-XXX
 */
export function formatPostalCode(postal: string | undefined): string {
  if (!postal) return "";
  const digits = postal.replace(/[^0-9]/g, "");
  if (digits.length === 5) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return postal.trim();
}

/**
 * Czyści nazwę ulicy (np. usuwa zdublowane przedrostki 'ul.')
 */
export function cleanStreet(street: string | undefined): string {
  if (!street) return "";
  let s = street.trim();
  // Usuń zbędne przedrostki jeśli występują
  s = s.replace(/^ul\.\s*/i, "").replace(/^al\.\s*/i, "Al. ").replace(/^pl\.\s*/i, "Pl. ");
  return s;
}

/**
 * Buduje pełny czytelny adres jedno-linijkowy
 */
export function formatFullAddress(
  street: string,
  building: string,
  flat: string,
  postal: string,
  city: string
): string {
  const addressParts: string[] = [];

  // Część ulicowa / numerowa
  let streetPart = "";
  if (street) {
    streetPart = street;
    if (building) {
      streetPart += ` ${building}`;
      if (flat) {
        streetPart += `/${flat}`;
      }
    }
  } else if (building) {
    streetPart = `${city} ${building}`;
    if (flat) {
      streetPart += `/${flat}`;
    }
  }

  if (streetPart) addressParts.push(streetPart);

  // Część miasto i kod
  const cityPart = `${formatPostalCode(postal)} ${city}`.trim();
  if (cityPart) addressParts.push(cityPart);

  return addressParts.join(", ");
}

/**
 * Normalizuje surowe dane z GUS do obiektu GusNormalizedCompany
 */
export function normalizeGusCompany(raw: GusRawEntity): GusNormalizedCompany {
  const nip = (raw.Nip || "").replace(/[^0-9]/g, "").trim();
  const regon = (raw.Regon || "").replace(/[^0-9]/g, "").trim();
  const name = (raw.Nazwa || "").trim();
  const street = cleanStreet(raw.Ulica);
  const buildingNumber = (raw.NrNieruchomosci || "").trim();
  const flatNumber = (raw.NrLokalu || "").trim();
  const city = (raw.Miejscowosc || raw.MiejscowoscPoczty || "").trim();
  const postalCode = formatPostalCode(raw.KodPocztowy);
  const voivodeship = (raw.Wojewodztwo || "").trim();
  const county = (raw.Powiat || "").trim();
  const commune = (raw.Gmina || "").trim();
  const type = raw.Typ || "";
  const silosId = raw.SilosID || "";

  // Sprawdzamy czy działalność jest aktywna
  const isTerminated = Boolean(raw.DataZakonczeniaDzialalnosci && raw.DataZakonczeniaDzialalnosci.trim().length > 0);
  const isActive = !isTerminated;

  const fullAddress = formatFullAddress(street, buildingNumber, flatNumber, postalCode, city);

  return {
    nip,
    name,
    regon,
    street,
    buildingNumber,
    flatNumber,
    city,
    postalCode,
    fullAddress,
    voivodeship: voivodeship || undefined,
    county: county || undefined,
    commune: commune || undefined,
    type: type || undefined,
    silosId: silosId || undefined,
    isActive,
  };
}

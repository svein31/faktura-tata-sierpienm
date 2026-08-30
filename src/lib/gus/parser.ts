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
 * Parsuje dowolny pełny raport XML zwracany przez DanePobierzPelnyRaport
 */
export function parseRawGusFullReport(rawXml: string): Record<string, string> {
  const unescaped = unescapeXml(rawXml);
  const result: Record<string, string> = {};

  // Wyszukaj wszystkie tagi <nazwa>wartość</nazwa> wewnątrz <dane>...</dane> lub całego XML
  const tagRegex = /<([a-zA-Z0-9_]+)>([^<]*)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(unescaped)) !== null) {
    const tagName = match[1];
    const val = match[2]?.trim();
    if (val) {
      result[tagName] = val;
    }
  }

  return result;
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

  const cityPart = `${formatPostalCode(postal)} ${city}`.trim();
  if (cityPart) addressParts.push(cityPart);

  return addressParts.join(", ");
}

/**
 * Próbuje wydobyć Imię i Nazwisko z pełnej nazwy firmy JDG (np. "MICHAŁ KOWALSKI FIRMA")
 */
export function extractNameFromCompanyName(companyName: string): { firstName?: string; lastName?: string } {
  if (!companyName) return {};
  const cleaned = companyName.replace(/["'”„]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    // Sprawdź czy pierwsze dwa słowa wyglądają jak imię i nazwisko (wielkie litery)
    const first = words[0];
    const second = words[1];
    // Jeśli nie są typowymi słowami korporacyjnymi
    const nonNames = ["SP.", "SPÓŁKA", "PRZEDSIĘBIORSTWO", "FIRMA", "ZAKŁAD", "BIURO", "USŁUGI", "HANDEL", "AGENCJA", "GRUPA"];
    if (!nonNames.includes(first.toUpperCase()) && !nonNames.includes(second.toUpperCase())) {
      return { firstName: first, lastName: second };
    }
  }
  return {};
}

/**
 * Łączy dane bazowe z raportu DaneSzukajPodmioty oraz raportów szczegółowych DanePobierzPelnyRaport
 */
export function mergeGusFullData(
  base: GusRawEntity,
  reportData: Record<string, string> = {}
): GusNormalizedCompany {
  const nip = (reportData.fiz_nip || reportData.praw_nip || base.Nip || "").replace(/[^0-9]/g, "").trim();
  const regon = (reportData.fiz_regon9 || reportData.praw_regon9 || reportData.praw_regon14 || base.Regon || "").replace(/[^0-9]/g, "").trim();
  const krs = reportData.praw_krs || reportData.krs || undefined;

  const isPhysical =
    base.Typ === "F" ||
    base.SilosID === "1" ||
    Boolean(reportData.fiz_imie1 || reportData.fiz_nazwisko || reportData.fiz_nazwa);

  const type: "PERSONAL" | "COMPANY" = isPhysical ? "PERSONAL" : "COMPANY";

  let firstName: string | undefined = reportData.fiz_imie1;
  let lastName: string | undefined = reportData.fiz_nazwisko;
  const secondName: string | undefined = reportData.fiz_imie2;

  const rawCompanyName =
    reportData.fiz_nazwa ||
    reportData.praw_nazwa ||
    base.Nazwa ||
    "";
  const companyName = rawCompanyName.trim();

  // Jeśli brak imienia i nazwiska w polach raportu, spróbuj wyciągnąć z nazwy JDG
  if (isPhysical && (!firstName || !lastName) && companyName) {
    const extracted = extractNameFromCompanyName(companyName);
    if (!firstName) firstName = extracted.firstName;
    if (!lastName) lastName = extracted.lastName;
  }

  const street = cleanStreet(
    reportData.fiz_adSiedzUlica_Nazwa ||
    reportData.praw_adSiedzUlica_Nazwa ||
    reportData.adSiedzUlica_Nazwa ||
    base.Ulica
  );

  const buildingNumber = (
    reportData.fiz_adSiedzNrNieruchomosci ||
    reportData.praw_adSiedzNrNieruchomosci ||
    reportData.adSiedzNrNieruchomosci ||
    base.NrNieruchomosci ||
    ""
  ).trim();

  const flatNumber = (
    reportData.fiz_adSiedzNrLokalu ||
    reportData.praw_adSiedzNrLokalu ||
    reportData.adSiedzNrLokalu ||
    base.NrLokalu ||
    ""
  ).trim();

  const city = (
    reportData.fiz_adSiedzMiejscowosc_Nazwa ||
    reportData.praw_adSiedzMiejscowosc_Nazwa ||
    reportData.adSiedzMiejscowosc_Nazwa ||
    base.Miejscowosc ||
    base.MiejscowoscPoczty ||
    ""
  ).trim();

  const postalCode = formatPostalCode(
    reportData.fiz_adSiedzKodPocztowy ||
    reportData.praw_adSiedzKodPocztowy ||
    reportData.adSiedzKodPocztowy ||
    base.KodPocztowy
  );

  const voivodeship = (
    reportData.fiz_adSiedzWojewodztwo_Nazwa ||
    reportData.praw_adSiedzWojewodztwo_Nazwa ||
    reportData.adSiedzWojewodztwo_Nazwa ||
    base.Wojewodztwo ||
    ""
  ).trim();

  const county = (
    reportData.fiz_adSiedzPowiat_Nazwa ||
    reportData.praw_adSiedzPowiat_Nazwa ||
    reportData.adSiedzPowiat_Nazwa ||
    base.Powiat ||
    ""
  ).trim();

  const commune = (
    reportData.fiz_adSiedzGmina_Nazwa ||
    reportData.praw_adSiedzGmina_Nazwa ||
    reportData.adSiedzGmina_Nazwa ||
    base.Gmina ||
    ""
  ).trim();

  const isTerminated = Boolean(
    reportData.fiz_dataZakonczeniaDzialalnosci ||
    reportData.praw_dataZakonczeniaDzialalnosci ||
    base.DataZakonczeniaDzialalnosci
  );
  const isActive = !isTerminated;

  const fullAddress = formatFullAddress(street, buildingNumber, flatNumber, postalCode, city);

  return {
    nip,
    name: companyName,
    companyName,
    regon,
    krs,
    type,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    secondName: secondName || undefined,
    street,
    buildingNumber,
    flatNumber,
    city,
    postalCode,
    fullAddress,
    province: voivodeship || undefined,
    district: county || undefined,
    voivodeship: voivodeship || undefined,
    county: county || undefined,
    commune: commune || undefined,
    silosId: base.SilosID || undefined,
    rawType: base.Typ || undefined,
    isActive,
  };
}

/**
 * Normalizuje surowe dane podstawowe z GUS do obiektu GusNormalizedCompany
 */
export function normalizeGusCompany(raw: GusRawEntity): GusNormalizedCompany {
  return mergeGusFullData(raw, {});
}

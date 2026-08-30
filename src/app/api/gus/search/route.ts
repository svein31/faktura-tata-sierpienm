import { NextRequest } from "next/server";
import { json, handleApiError, ApiError } from "@/lib/api";
import { isValidNipFormat, normalizeNip } from "@/lib/validation";
import { GusClient, extractNameFromCompanyName } from "@/lib/gus/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Zamienia ciąg wielkich liter na czytelną wielkość liter (Title Case)
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Parsuje adres z formatu Białej Listy MF (np. "OGÓRKOWA 63S, 04-998 WARSZAWA" lub "UL. KRUCZA 24/2, 61-546 POZNAŃ")
 */
function parseWhiteListAddress(rawAddress: string | null | undefined) {
  if (!rawAddress) {
    return { street: "", buildingNumber: "", flatNumber: "", city: "", postalCode: "", fullAddress: "" };
  }

  const trimmed = rawAddress.trim();
  const postalMatch = trimmed.match(/(\d{2}-\d{3})\s+([^,]+)$/i);
  let postalCode = "";
  let rawCity = "";
  let streetPart = trimmed;

  if (postalMatch) {
    postalCode = postalMatch[1];
    rawCity = postalMatch[2].trim();
    streetPart = trimmed.substring(0, postalMatch.index).replace(/,\s*$/, "").trim();
  }

  let rawStreet = streetPart;
  let buildingNumber = "";
  let flatNumber = "";

  // Wyciągamy numer budynku / lokalu z końcówki ulicy (np. "OGÓRKOWA 63S" lub "KRUCZA 24/2")
  const numberMatch = streetPart.match(/\s+(\d+[a-zA-Z]?)(\/(\d+[a-zA-Z]?))?$/);
  if (numberMatch) {
    buildingNumber = numberMatch[1] || "";
    flatNumber = numberMatch[3] || "";
    rawStreet = streetPart.substring(0, numberMatch.index).trim();
  }

  // Usunięcie zbędnych przedrostków
  rawStreet = rawStreet
    .replace(/^ul\.\s+/i, "")
    .replace(/^al\.\s+/i, "Al. ")
    .replace(/^pl\.\s+/i, "Pl. ");

  const city = rawCity.length > 2 && rawCity === rawCity.toUpperCase() ? toTitleCase(rawCity) : rawCity;
  const street = rawStreet.length > 2 && rawStreet === rawStreet.toUpperCase() ? toTitleCase(rawStreet) : rawStreet;

  const fullAddress = (street ? `${street} ${buildingNumber}${flatNumber ? "/" + flatNumber : ""}, ` : "") + `${postalCode} ${city}`;

  return {
    street,
    buildingNumber,
    flatNumber,
    city,
    postalCode,
    fullAddress,
  };
}

/**
 * Pobiera dane podmiotu z oficjalnego API Białej Listy Podatników VAT Ministerstwa Finansów (MF).
 * Działa bezpłatnie w czasie rzeczywistym dla każdego aktywnego polskiego podmiotu gospodarczego.
 */
async function lookupWhiteListMf(nip: string) {
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${dateStr}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Fakturo-App/2.0",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const subject = data?.result?.subject;
    if (!subject || !subject.name) return null;

    const addrStr = subject.workingAddress || subject.residenceAddress || "";
    const parsedAddr = parseWhiteListAddress(addrStr);
    const bankAccount = Array.isArray(subject.accountNumbers) && subject.accountNumbers.length > 0
      ? subject.accountNumbers[0]
      : "";

    const isCompany = Boolean(subject.krs) || /sp\.\s*z\s*o\.\s*o\.|spółka|s\.a\./i.test(subject.name);
    const names = !isCompany ? extractNameFromCompanyName(subject.name) : {};

    return {
      nip: subject.nip || nip,
      name: subject.name,
      companyName: subject.name,
      regon: subject.regon || "",
      krs: subject.krs || "",
      type: isCompany ? "COMPANY" : "PERSONAL",
      firstName: names.firstName || "",
      lastName: names.lastName || "",
      street: parsedAddr.street,
      buildingNumber: parsedAddr.buildingNumber,
      flatNumber: parsedAddr.flatNumber,
      city: parsedAddr.city,
      postalCode: parsedAddr.postalCode,
      fullAddress: parsedAddr.fullAddress || addrStr,
      bankAccount,
      isActive: subject.statusVat === "Czynny" || subject.statusVat === "Zwolniony",
    };
  } catch (e) {
    console.warn("[WhiteList MF Lookup Error]:", e);
    return null;
  }
}

/**
 * GET /api/gus/search?nip=XXXXXXXXXX
 *
 * Pobranie autentycznych danych podmiotu z rejestru GUS BIR 1.1 oraz Białej Listy VAT Ministerstwa Finansów.
 * Zero sztucznych mocków / danych testowych.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const rawNip = url.searchParams.get("nip") ?? "";
    const cleanNip = normalizeNip(rawNip);

    if (!cleanNip) {
      throw new ApiError(400, "Wymagany jest parametr 'nip' (10 cyfr).", "MISSING_NIP");
    }

    if (cleanNip.length !== 10 || !/^\d{10}$/.test(cleanNip)) {
      throw new ApiError(400, "Numer NIP musi składać się z dokładnie 10 cyfr.", "INVALID_NIP_FORMAT");
    }

    if (!isValidNipFormat(cleanNip)) {
      throw new ApiError(400, "Nieprawidłowa suma kontrolna numeru NIP.", "INVALID_NIP_CHECKSUM");
    }

    let companyData: any = null;
    let source = "mf-whitelist";

    // ── 1. Zapytanie do oficjalnego API Białej Listy Podatników VAT (Ministerstwo Finansów) ──
    const mfData = await lookupWhiteListMf(cleanNip);
    if (mfData) {
      companyData = mfData;
      source = "mf-whitelist";
    }

    // ── 2. Zapytanie do GUS BIR 1.1 (jeśli skonfigurowano lub jako uzupełnienie) ──
    try {
      const gusCompany = await GusClient.searchByNipAuto(cleanNip);
      // Odrzucamy ewentualne sztuczne mocki ze środowiska testowego GUS (np. z prefiksem "Test-")
      const isTestMock = Boolean(gusCompany?.street?.startsWith("Test-") || gusCompany?.name?.includes("Test-"));

      if (gusCompany && !isTestMock) {
        if (!companyData) {
          companyData = gusCompany;
          source = "gus-bir";
        } else {
          // Wzbogacamy dane o szczegóły z raportu GUS (nazwa handlowa, dokładne imię i nazwisko)
          companyData = {
            ...companyData,
            companyName: gusCompany.companyName || gusCompany.name || companyData.companyName,
            name: gusCompany.companyName || gusCompany.name || companyData.name,
            firstName: gusCompany.firstName || companyData.firstName,
            lastName: gusCompany.lastName || companyData.lastName,
            secondName: gusCompany.secondName || companyData.secondName,
            regon: gusCompany.regon || companyData.regon,
            krs: gusCompany.krs || companyData.krs,
            street: gusCompany.street || companyData.street,
            buildingNumber: gusCompany.buildingNumber || companyData.buildingNumber,
            flatNumber: gusCompany.flatNumber || companyData.flatNumber,
            city: gusCompany.city || companyData.city,
            postalCode: gusCompany.postalCode || companyData.postalCode,
            province: gusCompany.province || companyData.province,
            district: gusCompany.district || companyData.district,
          };
          source = "gus-bir+mf";
        }
      }
    } catch (err: any) {
      console.warn(`[GUS BIR Lookup for NIP ${cleanNip}]:`, err?.message || err);
    }

    if (!companyData) {
      throw new ApiError(
        404,
        `Nie znaleziono podmiotu w oficjalnych rejestrach państwowych (Biała Lista VAT MF / GUS REGON) dla podanego numeru NIP (${cleanNip}).`,
        "NOT_FOUND"
      );
    }

    const compName = companyData.companyName || companyData.name || "";
    const province = companyData.province || companyData.voivodeship || "";
    const district = companyData.district || companyData.county || "";

    return json({
      success: true,
      source,
      data: {
        nip: companyData.nip,
        regon: companyData.regon || "",
        krs: companyData.krs || "",
        type: companyData.type || "COMPANY",
        firstName: companyData.firstName || "",
        lastName: companyData.lastName || "",
        secondName: companyData.secondName || "",
        name: compName,
        companyName: compName,
        street: companyData.street || "",
        buildingNumber: companyData.buildingNumber || "",
        flatNumber: companyData.flatNumber || "",
        city: companyData.city || "",
        postalCode: companyData.postalCode || "",
        province: province,
        district: district,
        voivodeship: province,
        county: district,
        commune: companyData.commune || "",
        fullAddress: companyData.fullAddress || "",
        bankAccount: companyData.bankAccount || "",
        isActive: companyData.isActive ?? true,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

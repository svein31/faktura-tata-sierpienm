import { NextRequest } from "next/server";
import { json, handleApiError, ApiError } from "@/lib/api";
import { isValidNipFormat, normalizeNip } from "@/lib/validation";
import { GusClient, GusApiError, extractNameFromCompanyName } from "@/lib/gus/index";
import { lookupDemoNip } from "@/lib/nip-demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Parsuje adres z formatu Białej Listy MF (np. "UL. MARSZAŁKOWSKA 10A/4, 00-001 WARSZAWA")
 */
function parseWhiteListAddress(rawAddress: string | null | undefined) {
  if (!rawAddress) {
    return { street: "", buildingNumber: "", flatNumber: "", city: "", postalCode: "", fullAddress: "" };
  }

  const trimmed = rawAddress.trim();
  const postalMatch = trimmed.match(/(\d{2}-\d{3})\s+([^,]+)$/i);
  let postalCode = "";
  let city = "";
  let streetPart = trimmed;

  if (postalMatch) {
    postalCode = postalMatch[1];
    city = postalMatch[2].trim();
    streetPart = trimmed.substring(0, postalMatch.index).replace(/,\s*$/, "").trim();
  }

  let street = streetPart;
  let buildingNumber = "";
  let flatNumber = "";

  // Wyciągamy numer budynku / lokalu z końcówki ulicy (np. "MARSZAŁKOWSKA 10A/4" lub "UL. KRUCZA 1")
  const numberMatch = streetPart.match(/\s+(\d+[a-zA-Z]?)(\/(\d+[a-zA-Z]?))?$/);
  if (numberMatch) {
    buildingNumber = numberMatch[1] || "";
    flatNumber = numberMatch[3] || "";
    street = streetPart.substring(0, numberMatch.index).trim();
  }

  // Usunięcie prefiksu "UL. "
  street = street.replace(/^ul\.\s+/i, "");

  return {
    street,
    buildingNumber,
    flatNumber,
    city,
    postalCode,
    fullAddress: trimmed,
  };
}

/**
 * Pobiera dane podmiotu z oficjalnego API Białej Listy Podatników VAT Ministerstwa Finansów (MF).
 * Działa bezpłatnie dla każdego aktywnego polskiego podmiotu gospodarczego.
 */
async function lookupWhiteListMf(nip: string) {
  try {
    const today = new Date();
    // Bezpieczna data bieżąca (format RRRR-MM-DD)
    const dateStr = today.toISOString().slice(0, 10);
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${dateStr}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Fakturo-KSeF-Client/2.0",
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
 * Pobranie pełnych danych podmiotu z rejestru GUS BIR 1.1 (dwuetapowe) oraz Białej Listy MF.
 * 1. Walidacja formatu i sumy kontrolnej NIP (algorytm modulo 11).
 * 2. Dwuetapowe pobranie danych z GUS BIR 1.1 (SOAP 1.2: DaneSzukajPodmioty + DanePobierzPelnyRaport).
 * 3. Fallback do Białej Listy VAT Ministerstwa Finansów (REST API z numerami kont IBAN).
 * 4. Fallback do bazy demonstracyjnej.
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

    // Walidacja sumy kontrolnej NIP (modulo 11)
    if (!isValidNipFormat(cleanNip)) {
      throw new ApiError(400, "Nieprawidłowa suma kontrolna numeru NIP.", "INVALID_NIP_CHECKSUM");
    }

    // Środowisko GUS: test / prod
    const env = (process.env.GUS_ENV || "test").toLowerCase();
    const isDemoExplicit = env === "demo";

    let companyData: any = null;
    let source = "gus-bir";

    if (!isDemoExplicit) {
      // ── 1. Próba wyszukania w GUS BIR 1.1 (Dwuetapowe) ──
      try {
        companyData = await GusClient.searchByNipAuto(cleanNip);
        if (companyData) {
          source = "gus-bir";
        }
      } catch (err: any) {
        console.warn(`[GUS BIR Warning for NIP ${cleanNip}]:`, err?.message || err);
      }

      // ── 2. Jeśli GUS nie znalazł (lub tryb testowy z nowym NIP), odpytujemy Białą Listę MF ──
      if (!companyData) {
        const mfData = await lookupWhiteListMf(cleanNip);
        if (mfData) {
          companyData = mfData;
          source = "mf-whitelist";
        }
      }
    }

    // ── 3. Fallback do bazy DEMO ──
    if (!companyData) {
      const demoRes = lookupDemoNip(cleanNip);
      if (demoRes.company) {
        companyData = {
          nip: demoRes.company.nip,
          name: demoRes.company.name,
          companyName: demoRes.company.name,
          regon: demoRes.company.regon,
          street: demoRes.company.address.street,
          buildingNumber: "",
          flatNumber: "",
          city: demoRes.company.address.city,
          postalCode: demoRes.company.address.postal,
          fullAddress: `${demoRes.company.address.street}, ${demoRes.company.address.postal} ${demoRes.company.address.city}`,
          bankAccount: "",
          type: "COMPANY",
          isActive: true,
        };
        source = isDemoExplicit ? "demo" : "demo-fallback";
      }
    }

    if (!companyData) {
      throw new ApiError(
        404,
        `Nie znaleziono podmiotu w bazie rejestrów (GUS BIR / Biała Lista MF) dla podanego numeru NIP (${cleanNip}).`,
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

import { NextRequest } from "next/server";
import { json, handleApiError, ApiError } from "@/lib/api";
import { isValidNipFormat, normalizeNip } from "@/lib/validation";
import { GusClient, GusApiError } from "@/lib/gus/index";
import { lookupDemoNip } from "@/lib/nip-demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/gus/search?nip=XXXXXXXXXX
 *
 * Pobranie danych kontrahenta z rejestru GUS BIR 1.1 (Baza Internetowa REGON).
 * 1. Walidacja formatu i sumy kontrolnej NIP (algorytm modulo 11).
 * 2. Autoryzacja i wywołanie metody DaneSzukajPodmioty w GUS API.
 * 3. Parsowanie i ujednolicenie danych adresowych firmy.
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
    const isDemo = env === "demo" || (!process.env.GUS_API_KEY && env !== "test");

    let companyData = null;

    if (!isDemo) {
      try {
        companyData = await GusClient.searchByNipAuto(cleanNip);
      } catch (err) {
        if (err instanceof GusApiError) {
          // Jeśli klucz testowy lub serwer testowy ma przerwę techniczną, sprawdzamy bazę demo jako fallback
          if (env === "test" && (err.errorCode === "NETWORK_ERROR" || err.errorCode === "TIMEOUT" || err.errorCode === "INVALID_API_KEY")) {
            console.warn(`[GUS Fallback to Demo]: ${err.message}`);
            const demoRes = lookupDemoNip(cleanNip);
            if (demoRes.company) {
              return json({
                success: true,
                source: "demo-fallback",
                data: {
                  nip: demoRes.company.nip,
                  name: demoRes.company.name,
                  regon: demoRes.company.regon,
                  street: demoRes.company.address.street,
                  buildingNumber: "",
                  flatNumber: "",
                  city: demoRes.company.address.city,
                  postalCode: demoRes.company.address.postal,
                  fullAddress: `${demoRes.company.address.street}, ${demoRes.company.address.postal} ${demoRes.company.address.city}`,
                  isActive: true,
                },
              });
            }
          }
          throw new ApiError(err.statusCode || 500, err.message, err.errorCode);
        }
        throw err;
      }
    } else {
      // Tryb demo
      const demoRes = lookupDemoNip(cleanNip);
      if (!demoRes.company) {
        throw new ApiError(404, "Nie znaleziono podmiotu w bazie REGON dla podanego numeru NIP.", "NOT_FOUND");
      }
      return json({
        success: true,
        source: "demo",
        data: {
          nip: demoRes.company.nip,
          name: demoRes.company.name,
          regon: demoRes.company.regon,
          street: demoRes.company.address.street,
          buildingNumber: "",
          flatNumber: "",
          city: demoRes.company.address.city,
          postalCode: demoRes.company.address.postal,
          fullAddress: `${demoRes.company.address.street}, ${demoRes.company.address.postal} ${demoRes.company.address.city}`,
          isActive: true,
        },
      });
    }

    if (!companyData) {
      throw new ApiError(404, "Nie znaleziono podmiotu w bazie REGON dla podanego numeru NIP.", "NOT_FOUND");
    }

    return json({
      success: true,
      source: "gus-bir",
      data: {
        nip: companyData.nip,
        name: companyData.name,
        regon: companyData.regon,
        street: companyData.street,
        buildingNumber: companyData.buildingNumber,
        flatNumber: companyData.flatNumber,
        city: companyData.city,
        postalCode: companyData.postalCode,
        fullAddress: companyData.fullAddress,
        voivodeship: companyData.voivodeship,
        county: companyData.county,
        commune: companyData.commune,
        type: companyData.type,
        silosId: companyData.silosId,
        isActive: companyData.isActive,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

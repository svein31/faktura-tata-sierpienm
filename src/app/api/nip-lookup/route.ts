import { NextRequest, NextResponse } from "next/server";
import { normalizeNip, isValidNipFormat } from "@/lib/validation";
import { GusClient } from "@/lib/gus/index";

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
 * Parsuje adres z formatu Białej Listy MF
 */
function parseAddress(rawAddress: string) {
  const trimmed = rawAddress.trim();
  const postalMatch = trimmed.match(/(\d{2}-\d{3})\s+([^,]+)$/i);
  let postal = "";
  let rawCity = "";
  let streetPart = trimmed;

  if (postalMatch) {
    postal = postalMatch[1];
    rawCity = postalMatch[2].trim();
    streetPart = trimmed.substring(0, postalMatch.index).replace(/,\s*$/, "").trim();
  }

  const cleanStreet = streetPart
    .replace(/^ul\.\s+/i, "")
    .replace(/^al\.\s+/i, "Al. ")
    .replace(/^pl\.\s+/i, "Pl. ");

  const city = rawCity.length > 2 && rawCity === rawCity.toUpperCase() ? toTitleCase(rawCity) : rawCity;
  const street = cleanStreet.length > 2 && cleanStreet === cleanStreet.toUpperCase() ? toTitleCase(cleanStreet) : cleanStreet;

  return {
    street,
    city,
    postal,
    country: "PL",
  };
}

/**
 * GET /api/nip-lookup?nip=XXXXXXXXXX
 *
 * Pobranie autentycznych danych kontrahenta z oficjalnych rejestrów (Biała Lista MF + GUS BIR 1.1).
 */
export async function GET(req: NextRequest) {
  const rawNip = req.nextUrl.searchParams.get("nip") ?? "";
  const cleanNip = normalizeNip(rawNip);

  if (!cleanNip || cleanNip.length !== 10) {
    return NextResponse.json(
      { success: false, error: "INVALID_NIP", message: "NIP musi składać się z 10 cyfr." },
      { status: 400 }
    );
  }

  if (!isValidNipFormat(cleanNip)) {
    return NextResponse.json(
      { success: false, error: "INVALID_NIP", message: "Nieprawidłowa suma kontrolna NIP." },
      { status: 400 }
    );
  }

  // 1. Oficjalne API Białej Listy Podatników VAT (Ministerstwo Finansów) - dane na żywo w czasie rzeczywistym
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    const mfRes = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${dateStr}`, {
      headers: { Accept: "application/json", "User-Agent": "Fakturo/2.0" },
      next: { revalidate: 3600 },
    });

    if (mfRes.ok) {
      const mfData = await mfRes.json();
      const subj = mfData?.result?.subject;
      if (subj && subj.name) {
        const addrStr = subj.workingAddress || subj.residenceAddress || "";
        const parsed = parseAddress(addrStr);

        return NextResponse.json({
          success: true,
          source: "mf-whitelist",
          company: {
            name: subj.name,
            nip: subj.nip || cleanNip,
            regon: subj.regon || "",
            address: parsed,
            isVatPayer: subj.statusVat === "Czynny" || subj.statusVat === "Zwolniony",
          },
        });
      }
    }
  } catch (err) {
    console.warn(`[nip-lookup] Błąd Białej Listy MF dla NIP ${cleanNip}:`, err);
  }

  // 2. Próba GUS BIR 1.1
  try {
    const gusCompany = await GusClient.searchByNipAuto(cleanNip);
    const isTestMock = Boolean(gusCompany?.street?.startsWith("Test-") || gusCompany?.name?.includes("Test-"));

    if (gusCompany && gusCompany.name && !isTestMock) {
      const streetFull = [gusCompany.street, gusCompany.buildingNumber].filter(Boolean).join(" ");
      const streetWithFlat = gusCompany.flatNumber ? `${streetFull}/${gusCompany.flatNumber}` : streetFull;

      return NextResponse.json({
        success: true,
        source: "gus",
        company: {
          name: gusCompany.name,
          nip: gusCompany.nip,
          regon: gusCompany.regon,
          address: {
            street: streetWithFlat || gusCompany.street || "",
            city: gusCompany.city || "",
            postal: gusCompany.postalCode || "",
            country: "PL",
          },
          isVatPayer: gusCompany.isActive ?? true,
        },
      });
    }
  } catch (err) {
    console.warn(`[nip-lookup] Błąd GUS BIR dla NIP ${cleanNip}:`, err);
  }

  return NextResponse.json(
    {
      success: false,
      error: "NOT_FOUND",
      message: `Nie znaleziono podmiotu w rejestrach państwowych (Biała Lista MF / GUS) dla NIP: ${cleanNip}.`,
    },
    { status: 404 }
  );
}

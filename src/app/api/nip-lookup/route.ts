import { NextRequest, NextResponse } from "next/server";
import { normalizeNip, isValidNipFormat } from "@/lib/validation";
import { GusClient } from "@/lib/gus/index";
import { lookupDemoNip } from "@/lib/nip-demo";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Parsuje adres z formatu Białej Listy MF
 */
function parseAddress(rawAddress: string) {
  const postalMatch = rawAddress.match(/(\d{2}-\d{3})\s+([^,]+)$/i);
  let postal = "";
  let city = "";
  let street = rawAddress;

  if (postalMatch) {
    postal = postalMatch[1];
    city = postalMatch[2].trim();
    street = rawAddress.substring(0, postalMatch.index).replace(/,\s*$/, "").trim();
  }

  return {
    street: street.replace(/^ul\.\s+/i, ""),
    city,
    postal,
    country: "PL",
  };
}

/**
 * GET /api/nip-lookup?nip=XXXXXXXXXX
 *
 * Pobranie danych kontrahenta (GUS BIR 1.1 + Biała Lista MF + fallback Demo).
 */
export async function GET(req: NextRequest) {
  const rawNip = req.nextUrl.searchParams.get("nip") ?? "";
  const cleanNip = normalizeNip(rawNip);

  if (!cleanNip || cleanNip.length !== 10) {
    return NextResponse.json(
      { source: "demo", demo: true, error: "INVALID_NIP", message: "NIP musi składać się z 10 cyfr." },
      { status: 400 }
    );
  }

  if (!isValidNipFormat(cleanNip)) {
    return NextResponse.json(
      { source: "demo", demo: true, error: "INVALID_NIP", message: "Nieprawidłowa suma kontrolna NIP." },
      { status: 400 }
    );
  }

  // 1. Próba GUS BIR 1.1
  try {
    const gusCompany = await GusClient.searchByNipAuto(cleanNip);
    if (gusCompany && gusCompany.name) {
      const streetFull = [gusCompany.street, gusCompany.buildingNumber].filter(Boolean).join(" ");
      const streetWithFlat = gusCompany.flatNumber ? `${streetFull}/${gusCompany.flatNumber}` : streetFull;

      return NextResponse.json({
        source: "gus",
        demo: false,
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

  // 2. Próba Biała Lista MF
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
          source: "gus",
          demo: false,
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

  // 3. Fallback Demo
  const demoResult = lookupDemoNip(cleanNip);
  if (demoResult.company) {
    return NextResponse.json(demoResult);
  }

  return NextResponse.json(
    {
      source: "demo",
      demo: true,
      error: "NOT_FOUND",
      message: `Nie znaleziono podmiotu w rejestrach dla NIP: ${cleanNip}.`,
    },
    { status: 404 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { lookupDemoNip } from "@/lib/nip-demo";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/nip-lookup?nip=5270000024
 *
 * Adapter lookup NIP (GUS BIR / REGON) — TRYB DEMO.
 * Wymaga uwierzytelnienia (middleware + weryfikacja sesji).
 *
 * - Walidacja formatu i sumy kontrolnej NIP (zawsze, niezależnie od trybu).
 * - Tryb demo (domyślny): dane z lokalnej przykładowej bazy (zob. src/lib/nip-demo.ts).
 * - Prawdziwa integracja GUS BIR wymaga klucza API (https://api.stat.gov.pl)
 *   i klienta SOAP bip.gus.pl — patrz README → „Integracje (mocki)".
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const nip = req.nextUrl.searchParams.get("nip") ?? "";
  const result = lookupDemoNip(nip);
  const status =
    result.error === "NOT_FOUND"
      ? 404
      : result.error === "INVALID_NIP"
        ? 400
        : 200;

  return NextResponse.json(
    {
      ...result,
      integration: "demo",
      note:
        "Adapter demo. Prawdziwy rejestr GUS BIR wymaga klucza API i integracji SOAP (backend).",
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

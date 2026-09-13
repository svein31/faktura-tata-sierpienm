import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { json } from "@/lib/api";
import { recordLegalConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/user/accept-terms
 * Rejestruje akceptację zaktualizowanego regulaminu przez istniejącego użytkownika.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return json({ error: "Brak autoryzacji." }, { status: 401 });
    }

    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const clientUa = req.headers.get("user-agent") || null;

    // Zarejestruj zgodę prawną
    await recordLegalConsent({
      userId: user.id,
      documentType: "terms_of_service",
      documentVersion: LEGAL_VERSIONS.terms,
      accepted: true,
      rawIp: clientIp,
      userAgent: clientUa,
      context: "terms_update_modal",
    });

    return json({
      success: true,
      message: "Regulamin został zaakceptowany.",
      version: LEGAL_VERSIONS.terms,
    });
  } catch (error) {
    console.error("[AcceptTerms] Błąd:", error);
    return json(
      { error: "Nie udało się zapisać akceptacji regulaminu." },
      { status: 500 }
    );
  }
}

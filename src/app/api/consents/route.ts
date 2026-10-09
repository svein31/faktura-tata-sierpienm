import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { recordLegalConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/consents
 * Zwraca historię zgód prawnych zalogowanego użytkownika.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return json({ error: "Brak autoryzacji." }, { status: 401 });
    }

    const consents = await prisma.legalConsent.findMany({
      where: { userId: user.id },
      orderBy: { acceptedAt: "desc" },
      select: {
        id: true,
        documentType: true,
        documentVersion: true,
        accepted: true,
        acceptedAt: true,
        revokedAt: true,
        context: true,
      },
    });

    return json({ consents });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/consents
 * Aktualizuje (udziela lub wycofuje) opcjonalną zgodę.
 * Body: { documentType: string, accepted: boolean }
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return json({ error: "Brak autoryzacji." }, { status: 401 });
    }

    const body = await readJson(req);
    const documentType = body.documentType as string;
    if (typeof body.accepted !== "boolean") throw new ApiError(400, "Pole zgody musi mieć wartość tak lub nie.", "INVALID_INPUT");
    const accepted = body.accepted === true;

    // Nie pozwalaj na wycofanie regulaminu tą drogą
    if (documentType === "terms_of_service") {
      return json(
        { error: "Wycofanie akceptacji regulaminu wymaga usunięcia konta." },
        { status: 400 }
      );
    }

    const allowedTypes = ["marketing_email", "cookie_functional", "cookie_analytics", "cookie_marketing"];
    if (!allowedTypes.includes(documentType)) {
      return json(
        { error: "Nieprawidłowy typ zgody." },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const clientUa = req.headers.get("user-agent") || null;

    const result = await recordLegalConsent({
      userId: user.id,
      documentType: documentType as "marketing_email" | "cookie_functional" | "cookie_analytics" | "cookie_marketing",
      documentVersion: documentType.startsWith("cookie_") ? LEGAL_VERSIONS.cookies : LEGAL_VERSIONS.terms,
      accepted,
      rawIp: clientIp,
      userAgent: clientUa,
      context: "settings",
    });
    if (!result.success) throw new ApiError(503, "Nie udało się zapisać zgody. Spróbuj ponownie.", "CONSENT_UNAVAILABLE");

    return json({
      success: result.success,
      message: accepted ? "Zgoda udzielona." : "Zgoda wycofana.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

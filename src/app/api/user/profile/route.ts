import { getSessionUser, toPublicUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str, cleanStr } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/user/profile
 *
 * Pobranie profilu użytkownika, aktywnych sesji i ustawień.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return json({
      success: true,
      user: toPublicUser(user),
      sessionsCount: sessions.length,
      sessions,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * PUT /api/user/profile
 *
 * Aktualizacja danych osobowych i preferencji użytkownika (imię/nazwa, domyślna waluta, termin płatności, itp.).
 */
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

    const body = await readJson(req);
    const name = cleanStr(body.name, 100, "name") || user.name;
    const companyName = cleanStr(body.companyName, 200, "companyName") || user.companyName;
    const nip = cleanStr(body.nip, 20, "nip") || user.nip;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        companyName,
        nip,
      },
      include: {
        company: true,
        companyProfiles: true,
        ksef: true,
      },
    });

    return json({
      success: true,
      message: "Zapisano dane profilu.",
      user: toPublicUser(updated),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

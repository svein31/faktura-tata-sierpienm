import { getSession } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/user/logout-all
 *
 * Wylogowanie ze wszystkich pozostałych urządzeń (usuwa wszystkie rekordy Session poza bieżącą).
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

    // Usuwamy wszystkie sesje użytkownika poza bieżącą
    const result = await prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        id: { not: session.sessionId },
      },
    });

    return json({
      success: true,
      message: `Pomyślnie wylogowano z ${result.count} pozostałych sesji/urządzeń.`,
      terminatedCount: result.count,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

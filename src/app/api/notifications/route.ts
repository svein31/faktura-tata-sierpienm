import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { notificationToDto } from "@/lib/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/notifications?limit=50 — powiadomienia bieżącego użytkownika (najnowsze pierwsze). */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const limitParam = Number(new URL(req.url).searchParams.get("limit") ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });

    return json({ notifications: notifications.map(notificationToDto), unread });
  } catch (e) {
    return handleApiError(e);
  }
}

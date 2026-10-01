import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
import { notificationToDto } from "@/lib/dto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/notifications/[id] — oznaczenie jako przeczytane/nieprzeczytane (tylko własne). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const read = body.read === true ? true : body.read === false ? false : (() => { throw new ApiError(400, "Pole „read” musi być wartością logiczną."); })();

    const existing = await prisma.notification.findFirst({ where: { id: (await params).id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono powiadomienia.", code: "NOT_FOUND" }, { status: 404 });

    const notification = await prisma.notification.update({ where: { id: existing.id }, data: { read } });
    return json({ notification: notificationToDto(notification) });
  } catch (e) {
    return handleApiError(e);
  }
}

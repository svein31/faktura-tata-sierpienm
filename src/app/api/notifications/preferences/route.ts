import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { prefsToDto } from "@/lib/dto";

export const runtime = "nodejs";

/** PUT /api/notifications/preferences — zapis preferencji powiadomień bieżącego użytkownika. */
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const data = {
      browserEnabled: body.browserEnabled === true,
      soundEnabled: body.soundEnabled === false ? false : true,
    };

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    return json({ notificationPrefs: prefsToDto(prefs) });
  } catch (e) {
    return handleApiError(e);
  }
}

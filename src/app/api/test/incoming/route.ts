import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { invoiceToDto, notificationToDto } from "@/lib/dto";

export const runtime = "nodejs";

/**
 * POST /api/test/incoming — mechanizm testowy powiadomień z UI.
 * Tworzy powiadomienie testowe dla bieżącego użytkownika (bez faktury),
 * dzięki czemu można zweryfikować dzwonek, toast, dźwięk i powiadomienia
 * przeglądarki bez czekania na „prawdziwe" zdarzenia.
 */
export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "test",
        title: "Test powiadomienia",
        body: `To jest testowe powiadomienie wygenerowane z interfejsu (${new Date().toLocaleTimeString("pl-PL")}).`,
        read: false,
      },
    });

    return json({ notification: notificationToDto(notification), ok: true }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

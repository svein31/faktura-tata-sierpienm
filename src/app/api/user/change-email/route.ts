import { getSessionUser, normalizeEmail, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/user/change-email
 *
 * Zmiana adresu e-mail powiązanego z kontem użytkownika (wymaga potwierdzenia aktualnym hasłem).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

    const body = await readJson(req);
    const newEmail = normalizeEmail(str(body.newEmail));
    const currentPassword = str(body.currentPassword);

    if (!newEmail) {
      throw new ApiError(400, "Podaj nowy adres e-mail.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      throw new ApiError(400, "Podany adres e-mail ma nieprawidłowy format.");
    }
    if (!currentPassword) {
      throw new ApiError(400, "W celu potwierdzenia zmiany e-maila podaj swoje aktualne hasło.");
    }

    // 1. Weryfikacja hasła
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new ApiError(400, "Nieprawidłowe hasło autoryzacyjne.");
    }

    if (newEmail === user.email.toLowerCase()) {
      throw new ApiError(400, "Nowy adres e-mail jest taki sam jak dotychczasowy.");
    }

    // 2. Sprawdzenie czy nowy email nie jest już zajęty
    const existing = await prisma.user.findUnique({
      where: { email: newEmail },
    });
    if (existing) {
      throw new ApiError(409, "Konto z tym adresem e-mail już istnieje w systemie.");
    }

    // 3. Aktualizacja e-maila w bazie
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    return json({
      success: true,
      message: "Adres e-mail został pomyślnie zaktualizowany.",
      email: updated.email,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

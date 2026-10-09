import { getSession, normalizeEmail, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requestEmailVerification } from "@/lib/email/verification";
import { rateLimitShared, rateLimitSubject } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/user/change-email
 *
 * Zmiana adresu e-mail powiązanego z kontem użytkownika (wymaga potwierdzenia aktualnym hasłem).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }
    const { user, sessionId } = session;
    const ipLimit = await rateLimitShared(req, { max: 10, windowMs: 60 * 60_000 }, "change-email");
    const accountLimit = await rateLimitSubject(user.id, { max: 6, windowMs: 24 * 60 * 60_000 }, "change-email-user");
    if (!ipLimit.allowed || !accountLimit.allowed) throw new ApiError(429, "Zbyt wiele prób zmiany adresu. Spróbuj ponownie później.", "RATE_LIMITED");

    const body = await readJson(req);
    const newEmail = normalizeEmail(str(body.newEmail));
    const currentPassword = str(body.currentPassword);

    if (!newEmail) {
      throw new ApiError(400, "Podaj nowy adres e-mail.");
    }
    if (newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      throw new ApiError(400, "Podany adres e-mail ma nieprawidłowy format.");
    }
    if (!currentPassword) {
      throw new ApiError(400, "W celu potwierdzenia zmiany e-maila podaj swoje aktualne hasło.");
    }

    // 1. Weryfikacja hasła
    const isValid = await verifyPassword(currentPassword, user.password);
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

    // The login address changes only after proof of ownership of the target mailbox.
    const result = await requestEmailVerification(user.id, { targetEmail: newEmail, expectedPasswordHash: user.password, expectedSessionId: sessionId });
    if (result.delivery === "failed" || result.delivery === "not-configured")
      throw new ApiError(503, "Nie udało się wysłać linku potwierdzającego. Dotychczasowy adres pozostaje aktywny.", "VERIFICATION_EMAIL_UNAVAILABLE");

    return json({
      success: true,
      pending: true,
      delivery: result.delivery,
      message: result.delivery === "accepted" ? "Serwer pocztowy przyjął link wysłany na nowy adres. Potwierdź go, aby zmienić adres logowania. Dotychczasowy adres pozostaje aktywny do potwierdzenia." : "Nie można potwierdzić wysyłki. Sprawdź nową skrzynkę i folder Spam. Dotychczasowy adres pozostaje aktywny do potwierdzenia.",
      email: user.email,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

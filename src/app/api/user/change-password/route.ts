import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { changePasswordAuthenticated } from "@/lib/password-change";
import { PASSWORD_LENGTH_MESSAGE, validNewPasswordLength } from "@/lib/password-policy";
import { rateLimitSubject } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Walidacja siły hasła:
 * - minimum 8 znaków
 * - co najmniej jedna cyfra
 * - co najmniej jeden znak specjalny
 */
function validatePasswordStrength(password: string): { ok: boolean; message?: string } {
  if (!validNewPasswordLength(password)) {
    return { ok: false, message: PASSWORD_LENGTH_MESSAGE };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Hasło musi zawierać co najmniej jedną cyfrę (0-9)." };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { ok: false, message: "Hasło musi zawierać co najmniej jeden znak specjalny (np. !@#$%)." };
  }
  return { ok: true };
}

/**
 * POST /api/user/change-password
 *
 * Zmiana hasła zalogowanego użytkownika z weryfikacją aktualnego hasła.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }
    const { user, sessionId } = session;
    const quota = await rateLimitSubject(user.id, { max: 10, windowMs: 15 * 60_000 }, "change-password");
    if (!quota.allowed) throw new ApiError(429, "Zbyt wiele prób zmiany hasła. Spróbuj później.", "RATE_LIMITED");

    const body = await readJson(req);
    const currentPassword = str(body.currentPassword);
    const newPassword = str(body.newPassword);
    const confirmPassword = str(body.confirmPassword);

    if (!currentPassword) {
      throw new ApiError(400, "Podaj aktualne hasło do konta.");
    }
    if (!newPassword) {
      throw new ApiError(400, "Podaj nowe hasło.");
    }
    if (newPassword !== confirmPassword) {
      throw new ApiError(400, "Nowe hasło i jego powtórzenie nie są identyczne.");
    }

    // 1. Weryfikacja aktualnego hasła
    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      throw new ApiError(400, "Podane aktualne hasło jest nieprawidłowe.");
    }

    // 2. Walidacja siły nowego hasła
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) {
      throw new ApiError(400, strength.message || "Hasło jest zbyt słabe.");
    }

    if (currentPassword === newPassword) {
      throw new ApiError(400, "Nowe hasło musi być inne niż aktualne.");
    }

    // 3. Zapis nowego hasła w bazie
    const newHash = await hashPassword(newPassword);
    await changePasswordAuthenticated(user.id, sessionId, user.password, newHash);

    return json({
      success: true,
      message: "Hasło zostało zmienione. Pozostałe sesje oraz wcześniejsze linki odzyskiwania dostępu zostały unieważnione.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

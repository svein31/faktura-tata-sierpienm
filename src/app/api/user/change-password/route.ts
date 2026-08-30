import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Walidacja siły hasła:
 * - minimum 8 znaków
 * - co najmniej jedna cyfra
 * - co najmniej jeden znak specjalny
 */
function validatePasswordStrength(password: string): { ok: boolean; message?: string } {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, message: "Hasło musi mieć co najmniej 8 znaków." };
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
    const user = await getSessionUser();
    if (!user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

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
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
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
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return json({
      success: true,
      message: "Hasło zostało pomyślnie zmienione.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { resetPasswordWithToken, UNUSED_PASSWORD_RESET_TOKEN } from "@/lib/password-reset";

export const runtime = "nodejs";

/**
 * POST /api/auth/reset-password
 *
 * Ustawia nowe hasło na podstawie jednorazowego tokena.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const rawToken = str(body.token).trim();
    const newPassword = str(body.newPassword);

    if (!rawToken) {
      return json(
        { error: "Brak tokena resetowania hasła. Użyj linku przesłanego w wiadomości e-mail." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return json(
        { error: `Nowe hasło musi zawierać co najmniej ${MIN_PASSWORD_LENGTH} znaków.` },
        { status: 400 }
      );
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        ...UNUSED_PASSWORD_RESET_TOKEN,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord || !tokenRecord.user) {
      return json(
        {
          error:
            "Link do resetowania hasła jest nieprawidłowy, został już wykorzystany lub wygasł. Poproś o nowy link.",
          code: "INVALID_OR_EXPIRED_TOKEN",
        },
        { status: 400 }
      );
    }

    // Haszowanie nowego hasła (bcrypt, 12 rund)
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await resetPasswordWithToken(tokenHash, hashedPassword);

    return json({
      ok: true,
      message: "Hasło zostało pomyślnie zmienione. Możesz zalogować się nowym hasłem.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

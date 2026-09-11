import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleApiError, json, readJson, str } from "@/lib/api";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";

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
        usedAt: null,
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

    // Aktualizacja hasła użytkownika
    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { password: hashedPassword },
    });

    // Oznaczenie tokena jako zużyty
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Wylogowanie ze wszystkich dotychczasowych sesji (unieważnienie starych sesji w DB)
    await prisma.session.deleteMany({
      where: { userId: tokenRecord.userId },
    });

    return json({
      ok: true,
      message: "Hasło zostało pomyślnie zmienione. Możesz zalogować się nowym hasłem.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

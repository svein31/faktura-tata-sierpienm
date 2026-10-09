import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { UNUSED_PASSWORD_RESET_TOKEN } from "@/lib/password-reset";

/** A password proof is tied to its original hash and live session. Credential changes invalidate older recovery paths. */
export async function changePasswordAuthenticated(userId: string, sessionId: string, previousHash: string, nextHash: string, db: PrismaClient = prisma) {
  for (let attempt = 0; ; attempt++) {
    try {
      await db.$transaction(async tx => {
        const now = new Date();
        const session = await tx.session.updateMany({ where: { id: sessionId, userId, expiresAt: { gt: now } }, data: { authenticatedAt: now } });
        if (session.count !== 1) throw new ApiError(401, "Sesja wygasła. Zaloguj się ponownie.", "UNAUTHENTICATED");
        const changed = await tx.user.updateMany({ where: { id: userId, password: previousHash }, data: { password: nextHash } });
        if (changed.count !== 1) throw new ApiError(409, "Hasło zostało już zmienione. Zaloguj się ponownie.", "PASSWORD_CHANGED");
        await tx.passwordResetToken.updateMany({ where: { userId, ...UNUSED_PASSWORD_RESET_TOKEN }, data: { usedAt: now } });
        await tx.emailVerificationToken.updateMany({ where: { userId, purpose: "change-email", ...UNUSED_PASSWORD_RESET_TOKEN }, data: { usedAt: now } });
        await tx.session.deleteMany({ where: { userId, id: { not: sessionId } } });
      });
      return;
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2034" || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

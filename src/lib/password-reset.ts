import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

// Mongo distinguishes an absent optional field from an explicit null value.
export const UNUSED_PASSWORD_RESET_TOKEN = {
  OR: [{ usedAt: null }, { usedAt: { isSet: false } }],
} satisfies Prisma.PasswordResetTokenWhereInput;

function invalidToken() {
  return new ApiError(
    400,
    "Link do resetowania hasła jest nieprawidłowy, został już wykorzystany lub wygasł. Poproś o nowy link.",
    "INVALID_OR_EXPIRED_TOKEN"
  );
}

/** Claim, password change and session revocation must either all commit or all roll back. */
export async function resetPasswordWithToken(tokenHash: string, passwordHash: string, db: PrismaClient = prisma) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const now = new Date();
        const token = await tx.passwordResetToken.findFirst({
          where: { tokenHash, ...UNUSED_PASSWORD_RESET_TOKEN, expiresAt: { gt: now } },
          select: { id: true, userId: true },
        });
        if (!token) throw invalidToken();

        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: token.id, tokenHash, ...UNUSED_PASSWORD_RESET_TOKEN, expiresAt: { gt: new Date() } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw invalidToken();

        await tx.user.update({ where: { id: token.userId }, data: { password: passwordHash } });
        // A successful reset also closes any other outstanding recovery link for this account.
        await tx.passwordResetToken.updateMany({
          where: { userId: token.userId, ...UNUSED_PASSWORD_RESET_TOKEN },
          data: { usedAt: now },
        });
        await tx.session.deleteMany({ where: { userId: token.userId } });
      });
      return;
    } catch (error) {
      // MongoDB aborts a conflicting transaction. Re-read its token rather than retrying stale writes.
      if ((error as { code?: string })?.code !== "P2034" || attempt === 2) throw error;
      // Give the winning transaction time to commit before starting a fresh snapshot.
      await new Promise<void>(resolve => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

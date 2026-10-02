import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./api";
import { getSession } from "./auth";
export async function assertCompanyMfa(tx: Prisma.TransactionClient, userId: string, companyId: string) {
  const policy = await tx.companySecurityPolicy.findUnique({ where: { id: companyId } });
  if (!policy?.requireMfa) return;
  const mfa = await tx.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!mfa?.enabledAt) throw new ApiError(403, "Firma wymaga 2FA. Włącz je w Ustawieniach konta, aby uzyskać dostęp.", "COMPANY_MFA_REQUIRED");
}
export async function requireRecentAuth(userId: string) {
  const session = await getSession();
  if (!session || session.user.id !== userId) throw new ApiError(401, "Zaloguj się ponownie.");
  const record = await prisma.session.findUnique({ where: { id: session.sessionId }, select: { authenticatedAt: true } });
  const age = record?.authenticatedAt ? Date.now() - record.authenticatedAt.getTime() : Infinity;
  if (age < 0 || age > 10 * 60_000) throw new ApiError(428, "Potwierdź hasło i kod 2FA w Ustawieniach konta → Bezpieczeństwo. Potwierdzenie obowiązuje przez 10 minut.", "STEP_UP_REQUIRED");
}

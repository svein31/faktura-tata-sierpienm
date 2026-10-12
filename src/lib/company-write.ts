import { readCompanyAccess } from "./company-access-read";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/role-permissions";
import type { CompanyPermissions, CompanyRole } from "@/lib/types";

/** Check current membership within the business transaction, without creating membership rows. */
export async function companyAccess(tx: Prisma.TransactionClient, userId: string, companyId: unknown, permission?: keyof CompanyPermissions) {
  if (!objectId(companyId)) throw new ApiError(400, "Wybierz poprawną firmę.");
  const access = await readCompanyAccess(tx, userId, companyId);
  if (!access || access.member?.valid === false) throw new ApiError(403, "Brak dostępu do firmy.");
  const { company: profile, member } = access;
  const company = { id: profile.id, userId: profile.userId };
  const role = member ? member.role : (company.userId === userId ? "owner" : "");
  if (!role || !Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, role)) throw new ApiError(403, "Brak dostępu do firmy.");
  const defaults = DEFAULT_ROLE_PERMISSIONS[role as CompanyRole];
  const allowed = !permission || role === "owner" || (member?.permissions[permission] ?? defaults[permission]);
  if (!allowed) throw new ApiError(403, "Brak uprawnienia do tej operacji.");
  if (access.requireMfa && !access.mfaEnabled) throw new ApiError(403, "Firma wymaga 2FA. Włącz je w Ustawieniach konta, aby uzyskać dostęp.", "COMPANY_MFA_REQUIRED");
  return { company, role };
}

/** Hold the shared company row until the supplied business transaction commits. */
export async function fenceCompanyWrite(tx: Prisma.TransactionClient, companyId: string) {
  // Mongo no-op updates do not retain the document write fence. Advance the
  // stored millisecond even when consecutive commands share the same clock tick.
  const profile = await tx.companyProfile.findUnique({ where: { id: companyId }, select: { updatedAt: true } });
  if (!profile) throw new ApiError(403, "Brak dostępu do firmy.");
  const updatedAt = new Date(Math.max(Date.now(), profile.updatedAt.getTime() + 1));
  await tx.companyProfile.update({ where: { id: companyId }, data: { updatedAt }, select: { id: true } });
}

/** Authorize a mutation and serialize it with company team and MFA-policy changes.
 * The caller must supply the same interactive transaction as the business write. */
export async function companyWriteAccess(tx: Prisma.TransactionClient, userId: string, companyId: unknown, permission?: keyof CompanyPermissions) {
  const access = await companyAccess(tx, userId, companyId, permission);
  await fenceCompanyWrite(tx, access.company.id);
  return access;
}

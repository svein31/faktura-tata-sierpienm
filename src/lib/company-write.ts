import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyPermissions, CompanyRole } from "@/lib/types";

/** Check current membership within the business transaction, without creating membership rows. */
export async function companyAccess(tx: Prisma.TransactionClient, userId: string, companyId: unknown, permission?: keyof CompanyPermissions) {
  if (!objectId(companyId)) throw new ApiError(400, "Wybierz poprawną firmę.");
  const company = await tx.companyProfile.findUnique({ where: { id: companyId }, select: { id: true, userId: true } });
  if (!company) throw new ApiError(403, "Brak dostępu do firmy.");
  const member = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId, userId } } });
  const role = member?.role || (company.userId === userId ? "owner" : "");
  if (!role || !Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, role)) throw new ApiError(403, "Brak dostępu do firmy.");
  const defaults = DEFAULT_ROLE_PERMISSIONS[role as CompanyRole];
  const allowed = !permission || role === "owner" || (member?.[permission] ?? defaults[permission]);
  if (!allowed) throw new ApiError(403, "Brak uprawnienia do tej operacji.");
  return { company, role };
}

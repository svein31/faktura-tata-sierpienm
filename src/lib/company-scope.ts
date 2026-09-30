import { DEFAULT_ROLE_PERMISSIONS } from "./role-permissions";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";

export const objectId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

export async function accessibleCompanyIds(userId: string): Promise<string[]> {
  const [owned, memberships] = await Promise.all([
    prisma.companyProfile.findMany({ where: { userId }, select: { id: true } }),
    prisma.companyMember.findMany({ where: { userId }, select: { companyId: true, role: true } }),
  ]);
  return [...new Set([...owned.map(c => c.id), ...memberships.filter(m => Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, m.role)).map(m => m.companyId)])];
}

export function catalogWhere(userId: string, companyIds: string[]) {
  return { OR: [
    { companyId: { in: companyIds } },
    { userId, OR: [{ companyId: null }, { companyId: { isSet: false } }] },
  ] };
}

export async function catalogCompanyForCreate(userId: string, role: string, companyId: unknown) {
  if (companyId == null || companyId === "") {
    if (role === "viewer") throw new ApiError(403, "Brak uprawnienia do edycji katalogu.");
    return null;
  }
  if (!objectId(companyId)) throw new ApiError(400, "Nieprawidłowy identyfikator firmy.");
  const access = await requireCompanyAccess(userId, companyId, "canIssueInvoices");
  if (!access.ok) throw new ApiError(access.status, access.error);
  return companyId;
}

export async function requireCatalogEdit(userId: string, role: string, record: { userId: string; companyId: string | null }) {
  if (record.companyId) {
    await catalogCompanyForCreate(userId, role, record.companyId);
  } else if (record.userId !== userId || role === "viewer") {
    throw new ApiError(403, "Brak uprawnienia do edycji katalogu.");
  }
}

/** Legacy contacts shared through an existing document remain available for that company. */
export async function contractorForCompany(userId: string, contractorId: string, companyId: unknown) {
  if (!objectId(contractorId)) return false;
  const contact = await prisma.contractor.findUnique({ where: { id: contractorId } });
  if (!contact) return false;
  if (contact.companyId) return contact.companyId === companyId;
  if (contact.userId === userId) return true;
  if (!objectId(companyId)) return false;
  return await prisma.invoice.count({ where: { contractorId, sellerCompanyId: companyId } }) > 0;
}

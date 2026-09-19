import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { accessibleCompanyIds, objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import type { CompanyPermissions } from "@/lib/types";

export async function documentWhere(userId: string, companyId?: string | null) {
  if (companyId && companyId !== "legacy") {
    if (!objectId(companyId)) throw new ApiError(400, "Nieprawidłowa firma.");
    const access = await requireCompanyAccess(userId, companyId);
    if (!access.ok) throw new ApiError(access.status, access.error);
    return { companyId };
  }
  const legacy = { userId, OR: [{ companyId: null }, { companyId: { isSet: false } }] };
  if (companyId === "legacy") return legacy;
  return { OR: [{ companyId: { in: await accessibleCompanyIds(userId) } }, legacy] };
}

export async function requireDocumentWrite(user: { id: string; role: string }, record: { userId: string; companyId: string | null }, permission: keyof CompanyPermissions = "canIssueInvoices") {
  if (record.companyId) {
    const access = await requireCompanyAccess(user.id, record.companyId, permission);
    if (!access.ok) throw new ApiError(access.status, access.error);
  } else if (record.userId !== user.id || user.role === "viewer") {
    throw new ApiError(403, "Brak uprawnień do zmiany dokumentu.");
  }
}

export async function newDocumentCompany(user: { id: string; role: string }, value: unknown) {
  if (value == null || value === "" || value === "legacy") {
    await requireDocumentWrite(user, { userId: user.id, companyId: null });
    return null;
  }
  if (!objectId(value)) throw new ApiError(400, "Nieprawidłowa firma.");
  await requireDocumentWrite(user, { userId: user.id, companyId: value });
  return value;
}

export async function scopedContractor(userId: string, id: string, companyId: string | null) {
  if (!objectId(id)) throw new ApiError(400, "Wybierz kontrahenta.");
  const contact = await prisma.contractor.findUnique({ where: { id } });
  // Legacy contacts remain usable by their owner; company contacts never cross scopes.
  if (!contact || (contact.companyId ? contact.companyId !== companyId : contact.userId !== userId)) {
    throw new ApiError(400, "Kontrahent nie należy do wybranej firmy.");
  }
  return contact;
}

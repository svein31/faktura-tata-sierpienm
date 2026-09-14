import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
export async function resolveKsefCompany(userId: string, companyId?: string, nip?: string) {
  const company = companyId
    ? await prisma.companyProfile.findUnique({ where: { id: companyId } })
    : await prisma.companyProfile.findFirst({ where: { userId, ...(nip ? { nip } : {}) }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  if (!company) throw new ApiError(400, "Wybierz profil firmy w ustawieniach.");
  const access = await requireCompanyAccess(userId, company.id, "canSendKsef");
  if (!access.ok) throw new ApiError(access.status, access.error);
  if (nip && company.nip.replace(/\D/g, "") !== nip) throw new ApiError(400, "NIP nie odpowiada wybranej firmie.");
  return company;
}

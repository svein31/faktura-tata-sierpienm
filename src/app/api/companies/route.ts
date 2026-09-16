import { recordAuditLog } from "@/lib/audit";
import { accessibleCompanyIds } from "@/lib/company-scope";
import { getCompanyMembership } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyProfileToDto } from "@/lib/dto";
import { parseCompanyProfileBody } from "@/lib/parsers";

export const runtime = "nodejs";

/**
 * GET /api/companies
 * Pobiera listę wszystkich firm/spółek powiązanych z zalogowanym użytkownikiem.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const companies = await prisma.companyProfile.findMany({
      where: { id: { in: await accessibleCompanyIds(user.id) } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return json({ companies: await Promise.all(companies.map(async company => {
      const membership = await getCompanyMembership(user.id, company.id);
      return { ...companyProfileToDto(company), currentUserRole: membership?.role, currentUserPermissions: membership?.permissions };
    })) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/companies
 * Tworzy nowy profil firmy/spółki (z walidacją NIP i opcją domyślnej firmy).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJson(req);
    const data = parseCompanyProfileBody(body);

    // Sprawdzenie czy użytkownik nie ma już spółki o takim samym NIP
    const existingNip = await prisma.companyProfile.findFirst({
      where: { userId: user.id, nip: data.nip },
    });
    if (existingNip) {
      throw new ApiError(400, "Posiadasz już zapisany profil firmy z tym numerem NIP.");
    }

    // Liczba obecnych profili firmowych użytkownika
    const existingCount = await prisma.companyProfile.count({ where: { userId: user.id } });
    const shouldBeDefault = data.isDefault || existingCount === 0;

    const company = await prisma.$transaction(async tx => {
      if (shouldBeDefault && existingCount > 0) await tx.companyProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const created = await tx.companyProfile.create({ data: { userId: user.id, ...data, isDefault: shouldBeDefault } });
      await recordAuditLog({ client: tx, companyId: created.id, userId: user.id, userName: user.name, userEmail: user.email,
        action: "company_created", entityType: "company", entityId: created.id, details: { companyName: created.companyName, nip: created.nip } });
      return created;
    });

    return json({ company: companyProfileToDto(company) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}


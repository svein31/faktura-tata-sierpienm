import { catalogCompanyForCreate } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { contractorToDto } from "@/lib/dto";
import { parseContractorBody } from "@/lib/parsers";

export const runtime = "nodejs";

/** POST /api/contractors — nowy kontrahent bieżącego użytkownika. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const data = parseContractorBody(body);
    const companyId = await catalogCompanyForCreate(user.id, user.role, body.companyId);

    const contractor = await prisma.$transaction(async tx => {
      const record = await tx.contractor.create({ data: { userId: user.id, companyId, ...data } });
      await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "contractor_created", entityType: "contractor", entityId: record.id, details: { name: record.name } });
      return record;
    });

    return json({ contractor: contractorToDto(contractor) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}


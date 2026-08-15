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

    const contractor = await prisma.contractor.create({
      data: { userId: user.id, ...data },
    });

    return json({ contractor: contractorToDto(contractor) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

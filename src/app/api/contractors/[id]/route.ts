import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { contractorToDto } from "@/lib/dto";
import { parseContractorBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/contractors/[id] — edycja (tylko własny rekord). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.contractor.findFirst({ where: { id: (await params).id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono kontrahenta.", code: "NOT_FOUND" }, { status: 404 });

    const body = await readJson(req);
    const data = parseContractorBody(body);

    const contractor = await prisma.contractor.update({
      where: { id: existing.id },
      data,
    });

    return json({ contractor: contractorToDto(contractor) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** DELETE /api/contractors/[id] — usunięcie (tylko własny rekord). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.contractor.findFirst({ where: { id: (await params).id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono kontrahenta.", code: "NOT_FOUND" }, { status: 404 });

    await prisma.contractor.delete({ where: { id: existing.id } });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

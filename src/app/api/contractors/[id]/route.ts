import { requireCatalogEdit, objectId } from "@/lib/company-scope";
import { recordAuditLog, buildFieldDiff } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, handleApiError, json, readJson } from "@/lib/api";
import { contractorToDto } from "@/lib/dto";
import { parseContractorBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/contractors/[id] — edycja (tylko własny rekord). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const id = (await params).id;
    if (!objectId(id)) return json({ error: "Nie znaleziono rekordu." }, { status: 404 });
    const existing = await prisma.contractor.findUnique({ where: { id } });
    if (!existing) return json({ error: "Nie znaleziono kontrahenta.", code: "NOT_FOUND" }, { status: 404 });

    await requireCatalogEdit(user.id, user.role, existing);

    const body = await readJson(req);
    const data = parseContractorBody(body);

    const contractor = await prisma.$transaction(async tx => {
      const record = await tx.contractor.update({ where: { id: existing.id }, data });
      const labels = Object.fromEntries(["name", "nip", "address", "email", "phone", "notes", "tags", "defaultCurrency"].map(key => [key, key]));
      await recordAuditLog({ client: tx, companyId: existing.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "contractor_updated", entityType: "contractor", entityId: record.id, diff: buildFieldDiff(existing, record, labels).diff });
      return record;
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
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const id = (await params).id;
    if (!objectId(id)) return json({ error: "Nie znaleziono rekordu." }, { status: 404 });
    const existing = await prisma.contractor.findUnique({ where: { id } });
    if (!existing) return json({ error: "Nie znaleziono kontrahenta.", code: "NOT_FOUND" }, { status: 404 });

    await requireCatalogEdit(user.id, user.role, existing);
    if (await prisma.invoice.count({ where: { contractorId: existing.id } })) return json({ error: "Kontrahent posiada historię faktur i nie może zostać usunięty." }, { status: 409 });
    await prisma.$transaction(async tx => {
      await tx.contractor.delete({ where: { id: existing.id } });
      await recordAuditLog({ client: tx, companyId: existing.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "contractor_deleted", entityType: "contractor", entityId: existing.id, details: { name: existing.name } });
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}


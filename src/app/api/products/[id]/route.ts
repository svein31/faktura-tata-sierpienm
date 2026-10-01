import { requireCatalogEdit, objectId } from "@/lib/company-scope";
import { recordAuditLog, buildFieldDiff } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, handleApiError, json, readJson } from "@/lib/api";
import { productToDto } from "@/lib/dto";
import { parseProductBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/products/[id] — edycja (tylko własny rekord). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const id = (await params).id;
    if (!objectId(id)) return json({ error: "Nie znaleziono rekordu." }, { status: 404 });
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return json({ error: "Nie znaleziono pozycji.", code: "NOT_FOUND" }, { status: 404 });

    await requireCatalogEdit(user.id, user.role, existing);

    const body = await readJson(req);
    const data = parseProductBody(body);

    const product = await prisma.$transaction(async tx => {
      const record = await tx.product.update({ where: { id: existing.id }, data });
      const labels = Object.fromEntries(Object.keys(data).map(key => [key, key]));
      await recordAuditLog({ client: tx, companyId: existing.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "product_updated", entityType: "product", entityId: record.id, diff: buildFieldDiff(existing, record, labels).diff });
      return record;
    });

    return json({ product: productToDto(product) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** DELETE /api/products/[id] — usunięcie (tylko własny rekord). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const id = (await params).id;
    if (!objectId(id)) return json({ error: "Nie znaleziono rekordu." }, { status: 404 });
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return json({ error: "Nie znaleziono pozycji.", code: "NOT_FOUND" }, { status: 404 });

    await requireCatalogEdit(user.id, user.role, existing);
    await prisma.$transaction(async tx => {
      await tx.product.delete({ where: { id: existing.id } });
      await recordAuditLog({ client: tx, companyId: existing.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "product_deleted", entityType: "product", entityId: existing.id, details: { name: existing.name } });
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}


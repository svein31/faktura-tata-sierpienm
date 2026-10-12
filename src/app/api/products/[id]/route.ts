import { requireCatalogEdit, objectId } from "@/lib/company-scope";
import { companyWriteAccess } from "@/lib/company-write";
import { recordAuditLog, buildFieldDiff } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json, readJson } from "@/lib/api";
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
      const current = await tx.product.findUnique({ where: { id: existing.id } });
      if (!current) throw new ApiError(404, "Nie znaleziono pozycji.", "NOT_FOUND");
      if (current.companyId) await companyWriteAccess(tx, user.id, current.companyId, "canIssueInvoices");
      else {
        const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
        if (current.userId !== user.id || !actor || actor.role === "viewer") throw new ApiError(403, "Brak uprawnienia do edycji katalogu.");
      }
      const record = await tx.product.update({ where: { id: current.id }, data });
      const labels = Object.fromEntries(Object.keys(data).map(key => [key, key]));
      await recordAuditLog({ client: tx, companyId: current.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "product_updated", entityType: "product", entityId: record.id, diff: buildFieldDiff(current, record, labels).diff });
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
      const current = await tx.product.findUnique({ where: { id: existing.id } });
      if (!current) throw new ApiError(404, "Nie znaleziono pozycji.", "NOT_FOUND");
      if (current.companyId) await companyWriteAccess(tx, user.id, current.companyId, "canIssueInvoices");
      else {
        const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
        if (current.userId !== user.id || !actor || actor.role === "viewer") throw new ApiError(403, "Brak uprawnienia do edycji katalogu.");
      }
      await tx.product.delete({ where: { id: current.id } });
      await recordAuditLog({ client: tx, companyId: current.companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "product_deleted", entityType: "product", entityId: current.id, details: { name: current.name } });
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}


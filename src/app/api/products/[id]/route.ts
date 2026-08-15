import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { productToDto } from "@/lib/dto";
import { parseProductBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/** PUT /api/products/[id] — edycja (tylko własny rekord). */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.product.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono pozycji.", code: "NOT_FOUND" }, { status: 404 });

    const body = await readJson(req);
    const data = parseProductBody(body);

    const product = await prisma.product.update({ where: { id: existing.id }, data });
    return json({ product: productToDto(product) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** DELETE /api/products/[id] — usunięcie (tylko własny rekord). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const existing = await prisma.product.findFirst({ where: { id: params.id, userId: user.id } });
    if (!existing) return json({ error: "Nie znaleziono pozycji.", code: "NOT_FOUND" }, { status: 404 });

    await prisma.product.delete({ where: { id: existing.id } });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

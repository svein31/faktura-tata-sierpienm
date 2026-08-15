import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { productToDto } from "@/lib/dto";
import { parseProductBody } from "@/lib/parsers";

export const runtime = "nodejs";

/** POST /api/products — nowy produkt/usługa bieżącego użytkownika. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const data = parseProductBody(body);

    const product = await prisma.product.create({ data: { userId: user.id, ...data } });
    return json({ product: productToDto(product) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

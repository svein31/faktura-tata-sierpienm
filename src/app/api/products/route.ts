import { catalogCompanyForCreate } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
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
    const companyId = await catalogCompanyForCreate(user.id, user.role, body.companyId);

    const product = await prisma.$transaction(async tx => {
      const record = await tx.product.create({ data: { userId: user.id, companyId, ...data } });
      await recordAuditLog({ client: tx, companyId, userId: user.id, userName: user.name, userEmail: user.email,
        action: "product_created", entityType: "product", entityId: record.id, details: { name: record.name } });
      return record;
    });

    return json({ product: productToDto(product) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}


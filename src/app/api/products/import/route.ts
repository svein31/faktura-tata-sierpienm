import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess, companyWriteAccess } from "@/lib/company-write";
import { excludeExistingProducts, validateProductImportRows } from "@/lib/product-import";
import { recordAuditLog } from "@/lib/audit";
import { readImportJson } from "@/lib/import-request";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readImportJson(req);
    if (body.action !== "preview" && body.action !== "import") throw new ApiError(400, "Nieprawidłowe działanie.");
    const { company } = await companyAccess(prisma, user.id, body.companyId, "canIssueInvoices");
    const { values, results } = validateProductImportRows(body.rows);
    const where = { OR: [{ companyId: company.id }, { userId: user.id, companyId: null }] };
    let created = 0;
    if (body.action === "preview") {
      excludeExistingProducts(values, results, await prisma.product.findMany({ where, select: { name: true, sku: true } }));
    } else {
      await prisma.$transaction(async tx => {
        await companyWriteAccess(tx, user.id, company.id, "canIssueInvoices");
        const pending = excludeExistingProducts(values, results, await tx.product.findMany({ where, select: { name: true, sku: true } }));
        if (pending.length) {
          created = (await tx.product.createMany({ data: pending.map(value => ({ ...value, companyId: company.id, userId: user.id })) })).count;
          await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email, action: "products_imported", entityType: "companyProfile", entityId: company.id, details: { created, duplicate: results.filter(row => row.status === "duplicate").length, invalid: results.filter(row => row.status === "invalid").length } });
        }
      });
    }
    return json({ created, ready: results.filter(row => row.status === "ready").length, duplicate: results.filter(row => row.status === "duplicate").length, invalid: results.filter(row => row.status === "invalid").length, results });
  } catch (error) { return handleApiError(error); }
}

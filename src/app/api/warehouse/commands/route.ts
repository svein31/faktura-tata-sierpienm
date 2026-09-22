import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, json, handleApiError, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { warehouseCommand } from "@/lib/warehouse/commands";
import { stocktakingToDto } from "@/lib/warehouse/dto";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    return json(await warehouseCommand(user, await readJson(req)));
  } catch (error) { return handleApiError(error); }
}
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const companyId = new URL(req.url).searchParams.get("companyId");
    const { role, company } = await companyAccess(prisma, user.id, companyId);
    let canWrite = false;
    try { await companyAccess(prisma, user.id, companyId, "canIssueInvoices"); canWrite = true; } catch (error) { if (!(error instanceof ApiError) || error.status !== 403) throw error; }
    const warehouses = await prisma.warehouse.findMany({ where: { companyId: company.id }, select: { id: true, name: true, code: true, currency: true, isActive: true }, orderBy: { code: "asc" } });
    const stocktakings = await prisma.stocktaking.findMany({ where: { warehouseId: { in: warehouses.map(w => w.id) }, status: { in: ["open", "counting"] } }, include: { warehouse: { select: { name: true, code: true } } }, take: 30, orderBy: { createdAt: "desc" } });
    return json({ warehouses, stocktakings: stocktakings.map(stocktakingToDto), canWrite, canCreate: role === "owner" });
  } catch (error) { return handleApiError(error); }
}

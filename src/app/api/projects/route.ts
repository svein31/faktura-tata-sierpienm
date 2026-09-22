import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { projectCommand, projectDetails } from "@/lib/projects";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    return json(await projectCommand(user.id, await readJson(req)));
  } catch (e) { return handleApiError(e); }
}
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams;
    const { company } = await companyAccess(prisma, user.id, params.get("companyId"), "canExport");
    const projectId = params.get("projectId"), cursor = params.get("cursor");
    if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona.");
    if (projectId) {
      if (!objectId(projectId)) throw new ApiError(400, "Nieprawidłowy projekt.");
      const detail = await prisma.$transaction(async tx => {
        await companyAccess(tx, user.id, company.id, "canExport");
        return projectDetails(tx, company.id, projectId);
      }, { timeout: 30000 });
      const entries = detail.entries.filter(entry => !cursor || entry.id < cursor);
      return json({ ...detail, entries: entries.slice(0, 30), nextCursor: entries.length > 30 ? entries[29].id : null });
    }
    const search = cleanStr(params.get("search") || "", 100, "wyszukiwanie"), kind = params.get("kind");
    if (kind) {
      const number = { contains: search, mode: "insensitive" as const }, paging = { take: 31, orderBy: { id: "desc" as const } };
      const after = cursor ? { id: { lt: cursor } } : {};
      let candidates;
      if (kind === "invoice") candidates = await prisma.invoice.findMany({ where: { sellerCompanyId: company.id, number, ...after }, select: { id: true, number: true, currency: true }, ...paging });
      else if (kind === "expense") candidates = await prisma.expense.findMany({ where: { companyId: company.id, number, ...after }, select: { id: true, number: true, currency: true }, ...paging });
      else if (kind === "material") candidates = await prisma.stockDocument.findMany({ where: { warehouse: { companyId: company.id }, type: { in: ["RW", "WZ"] }, number, ...after }, select: { id: true, number: true }, ...paging });
      else throw new ApiError(400, "Nieprawidłowy rodzaj dokumentu.");
      return json({ candidates: candidates.slice(0, 30), nextCursor: candidates.length > 30 ? candidates[29].id : null });
    }
    const projects = await prisma.project.findMany({ where: { companyId: company.id, ...(search ? { name: { contains: search, mode: "insensitive" } } : {}), ...(cursor ? { id: { lt: cursor } } : {}) }, take: 31, orderBy: { id: "desc" } });
    return json({ projects: projects.slice(0, 30), nextCursor: projects.length > 30 ? projects[29].id : null });
  } catch (e) { return handleApiError(e); }
}

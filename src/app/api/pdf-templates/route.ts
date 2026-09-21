import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { printConfig, DEFAULT_PRINT_CONFIG } from "@/lib/pdf/print-config";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const query = new URL(req.url).searchParams;
    const { company, role } = await companyAccess(prisma, user.id, query.get("companyId"));
    const cursor = query.get("cursor");
    if (cursor && (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))) throw new ApiError(400, "Nieprawidłowa strona.");
    const [setting, versions] = await Promise.all([
      prisma.pdfTemplateSetting.findUnique({ where: { id: company.id } }),
      prisma.pdfTemplateVersion.findMany({ where: { companyId: company.id, ...(cursor ? { version: { lt: Number(cursor) } } : {}) }, orderBy: { version: "desc" }, take: 21 }),
    ]);
    const active = setting?.templateId ? await prisma.pdfTemplateVersion.findFirst({ where: { id: setting.templateId, companyId: company.id } }) : null;
    return json({ setting: setting || { version: 0 }, active: active || { name: "Domyślny", config: DEFAULT_PRINT_CONFIG }, versions: versions.slice(0, 20), nextCursor: versions.length > 20 ? String(versions[19].version) : null, canManage: role === "owner" });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req), config = printConfig(body), name = cleanStr(body.name, 100, "nazwa");
    if (!name || !Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new ApiError(400, "Podaj nazwę i wersję ustawień.");
    return json(await prisma.$transaction(async tx => {
      const { company, role } = await companyAccess(tx, user.id, body.companyId);
      if (role !== "owner") throw new ApiError(403, "Szablony zmienia właściciel firmy.");
      const current = await tx.pdfTemplateSetting.findUnique({ where: { id: company.id } });
      if ((current?.version || 0) !== body.version) throw new ApiError(409, "Szablon zmienił się. Odśwież ustawienia.");
      const version = Number(body.version) + 1;
      const template = await tx.pdfTemplateVersion.create({ data: { companyId: company.id, version, name, config, createdBy: user.id } });
      if (current) await tx.pdfTemplateSetting.update({ where: { id: company.id, version: current.version }, data: { version, templateId: template.id } });
      else await tx.pdfTemplateSetting.create({ data: { id: company.id, version, templateId: template.id } });
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, action: "pdf_template.published", entityType: "pdf_template", entityId: template.id, details: { version, name, config } });
      return { id: template.id, version };
    }));
  } catch (e) { return handleApiError(e); }
}

import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { accountingWorkspaceId, changeAccountingTask, type AccountingTask } from "@/lib/accounting-workspace";
import { recordAuditLog } from "@/lib/audit";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const params = new URL(req.url).searchParams, month = params.get("month");
    const { company } = await companyAccess(prisma, user.id, params.get("companyId"), "canExport");
    const id = accountingWorkspaceId(company.id, month);
    const [workspace, members, owner] = await Promise.all([
      prisma.accountingWorkspace.findUnique({ where: { id } }),
      prisma.companyMember.findMany({ where: { companyId: company.id }, include: { user: { select: { name: true } } } }),
      prisma.user.findUnique({ where: { id: company.userId }, select: { id: true, name: true } }),
    ]);
    const assignees = members.filter(m => m.role === "owner" || (m.canExport ?? DEFAULT_ROLE_PERMISSIONS[m.role as CompanyRole]?.canExport)).map(m => ({ id: m.userId, name: m.user.name || "Użytkownik" }));
    if (owner && !members.some(m => m.userId === owner.id)) assignees.push({ id: owner.id, name: owner.name || "Właściciel" });
    return json({ workspace: workspace || { items: [], version: 0, month, companyId: company.id }, assignees });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const body = await readJson(req);
    const result = await prisma.$transaction(async tx => {
      const { company } = await companyAccess(tx, user.id, body.companyId, "canExport");
      const id = accountingWorkspaceId(company.id, body.month);
      await assertAccountingPeriodsOpen(tx, [{ companyId: company.id, issueDate: `${body.month}-01` }]);
      const current = await tx.accountingWorkspace.findUnique({ where: { id } });
      if ((current?.version ?? 0) !== body.version) throw new ApiError(409, "Lista została zmieniona przez inną osobę. Odśwież dane przed zapisem.");
      if (body.action === "assign" && body.assigneeId !== null) await companyAccess(tx, String(body.assigneeId), company.id, "canExport");
      const before = (current?.items || []) as unknown as AccountingTask[];
      const items = changeAccountingTask(before, body, user.id);
      const workspace = current ? await tx.accountingWorkspace.update({ where: { id, version: current.version }, data: { items, version: { increment: 1 }, updatedBy: user.id } }) : await tx.accountingWorkspace.create({ data: { id, companyId: company.id, month: String(body.month), items, updatedBy: user.id } });
      const affected = body.action === "add" ? items.at(-1) : items.find(i => i.id === body.itemId) || before.find(i => i.id === body.itemId);
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email, action: `accountant.task.${body.action}`, entityType: "accountingWorkspace", entityId: id, details: { month: body.month, version: workspace.version, task: affected } });
      if (body.action === "assign" && body.assigneeId && body.assigneeId !== user.id) await tx.notification.create({ data: { userId: String(body.assigneeId), kind: "system", title: "Przypisano zadanie księgowe", body: `${body.month}: ${affected?.title || "Zadanie"}`, link: "/accountant" } });
      return workspace;
    });
    return json({ workspace: result });
  } catch (e) { return handleApiError(e); }
}

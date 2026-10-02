import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json, readJson } from "@/lib/api";
import { requireRecentAuth } from "@/lib/security-policy";
import { recordAuditLog } from "@/lib/audit";
type Context = { params: Promise<{ id: string }> };
async function owner(context: Context) {
  const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
  const { id } = await context.params; assertObjectId(id);
  const company = await prisma.companyProfile.findUnique({ where: { id }, select: { userId: true } });
  const member = await prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: id, userId: user.id } } });
  if (!company || (company.userId !== user.id && member?.role !== "owner")) throw new ApiError(403, "Politykę zmienia właściciel firmy.");
  return { user, id };
}
export async function GET(_req: Request, context: Context) {
  try {
    const { id } = await owner(context);
    const [policy, members] = await Promise.all([
      prisma.companySecurityPolicy.findUnique({ where: { id } }),
      prisma.companyMember.findMany({ where: { companyId: id }, select: { user: { select: { id: true, name: true, email: true, mfa: { select: { enabledAt: true } } } } } }),
    ]);
    return json({ requireMfa: policy?.requireMfa || false, members: members.map(({ user }) => ({ id: user.id, name: user.name || user.email, enabled: Boolean(user.mfa?.enabledAt) })) });
  } catch (e) { return handleApiError(e); }
}
export async function PUT(req: Request, context: Context) {
  try {
    const { user, id } = await owner(context); await requireRecentAuth(user.id);
    const body = await readJson(req);
    if (typeof body.requireMfa !== "boolean") throw new ApiError(400, "Wybierz wymóg 2FA.");
    const policy = await prisma.$transaction(async tx => {
      // Serialize policy changes with team mutations.
      await tx.companyProfile.update({ where: { id }, data: { updatedAt: new Date() } });
      const company = await tx.companyProfile.findUniqueOrThrow({ where: { id } });
      const member = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: id, userId: user.id } } });
      if (company.userId !== user.id && member?.role !== "owner") throw new ApiError(403, "Uprawnienia zostały zmienione.");
      const mfa = await tx.userMfa.findUnique({ where: { userId: user.id } });
      if (body.requireMfa && !mfa?.enabledAt) throw new ApiError(409, "Najpierw włącz 2FA na swoim koncie.");
      const changed = await tx.companySecurityPolicy.upsert({ where: { id }, create: { id, requireMfa: body.requireMfa as boolean }, update: { requireMfa: body.requireMfa as boolean } });
      await recordAuditLog({ client: tx, companyId: id, userId: user.id, action: "company.security.changed", entityType: "company", entityId: id, details: { requireMfa: body.requireMfa } });
      return changed;
    });
    return json({ requireMfa: policy.requireMfa });
  } catch (e) { return handleApiError(e); }
}

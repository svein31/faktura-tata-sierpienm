import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireCompanyAccess, ensureNotLastOwner, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { companyMemberToDto } from "@/lib/dto";
import { recordAuditLog, buildFieldDiff } from "@/lib/audit";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * PUT /api/team/members/[id] — Aktualizacja roli i uprawnień członka zespołu
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const member = await prisma.companyMember.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, companyName: true } },
      },
    });

    if (!member) {
      return json({ error: "Nie znaleziono członka zespołu.", code: "NOT_FOUND" }, { status: 404 });
    }

    // Wymagane uprawnienie canManageTeam w tej firmie
    const access = await requireCompanyAccess(user.id, member.companyId, "canManageTeam");
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    const body = await readJson(req);
    const newRole = (typeof body.role === "string" ? body.role : member.role) as CompanyRole;
    const permissions = (typeof body.permissions === "object" && body.permissions ? body.permissions : {}) as Partial<Record<string, boolean>>;

    // Ochrona przed degradacją ostatniego właściciela
    if (member.role === "owner" && newRole !== "owner") {
      const check = await ensureNotLastOwner(member.companyId, member.userId);
      if (!check.canProceed) {
        return json({ error: check.reason, code: "CANNOT_DEMOTE_LAST_OWNER" }, { status: 400 });
      }
    }

    const defaults = DEFAULT_ROLE_PERMISSIONS[newRole] || DEFAULT_ROLE_PERMISSIONS.employee;

    const updatedData = {
      role: newRole,
      canIssueInvoices: permissions.canIssueInvoices ?? defaults.canIssueInvoices,
      canCreateCorrections: permissions.canCreateCorrections ?? defaults.canCreateCorrections,
      canRecordPayments: permissions.canRecordPayments ?? defaults.canRecordPayments,
      canExport: permissions.canExport ?? defaults.canExport,
      canSendKsef: permissions.canSendKsef ?? defaults.canSendKsef,
      canManageBankAccounts: permissions.canManageBankAccounts ?? defaults.canManageBankAccounts,
      canManageTeam: newRole === "owner" ? true : (permissions.canManageTeam ?? defaults.canManageTeam),
    };

    const { diff } = buildFieldDiff(member, updatedData, {
      role: "Rola",
      canIssueInvoices: "Wystawianie faktur",
      canCreateCorrections: "Korekty",
      canRecordPayments: "Rejestrowanie wpłat",
      canExport: "Eksporty",
      canSendKsef: "Wysyłka KSeF",
      canManageBankAccounts: "Zarządzanie rachunkami bankowymi",
      canManageTeam: "Zarządzanie zespołem",
    });

    const updated = await prisma.companyMember.update({
      where: { id: member.id },
      data: updatedData,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Zapis w historii audytowej
    const targetName = member.user?.name || member.user?.email || "Użytkownik";
    await recordAuditLog({
      companyId: member.companyId,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "team_permission_change",
      entityType: "team",
      entityId: member.id,
      description: `${user.name || user.email} zmienił(a) uprawnienia użytkownika ${targetName} (nowa rola: ${newRole})`,
      diff,
      details: { targetUserId: member.userId, targetEmail: member.user?.email, newRole },
    });

    return json({ member: companyMemberToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/team/members/[id] — Odebranie dostępu do firmy (usunięcie członka zespołu)
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const member = await prisma.companyMember.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, companyName: true } },
      },
    });

    if (!member) {
      return json({ error: "Nie znaleziono członka zespołu.", code: "NOT_FOUND" }, { status: 404 });
    }

    // Wymagane uprawnienie canManageTeam w tej firmie
    const access = await requireCompanyAccess(user.id, member.companyId, "canManageTeam");
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    // Blokada usunięcia ostatniego właściciela
    const check = await ensureNotLastOwner(member.companyId, member.userId);
    if (!check.canProceed) {
      return json({ error: check.reason, code: "CANNOT_REMOVE_LAST_OWNER" }, { status: 400 });
    }

    await prisma.companyMember.delete({
      where: { id: member.id },
    });

    // Zapis w historii audytowej
    const targetName = member.user?.name || member.user?.email || "Użytkownik";
    await recordAuditLog({
      companyId: member.companyId,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "team_revoke",
      entityType: "team",
      entityId: member.id,
      description: `${user.name || user.email} odebrał(a) dostęp do firmy użytkownikowi ${targetName}`,
      details: { removedUserId: member.userId, removedEmail: member.user?.email, previousRole: member.role },
    });

    return json({ ok: true, message: `Odebrano dostęp użytkownikowi ${targetName}.` });
  } catch (e) {
    return handleApiError(e);
  }
}

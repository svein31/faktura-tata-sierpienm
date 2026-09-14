import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/team/invitations/[id] — Odwołanie zaproszenia do zespołu
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: (await params).id },
      include: {
        company: { select: { id: true, companyName: true } },
      },
    });

    if (!invitation) {
      return json({ error: "Nie znaleziono zaproszenia.", code: "NOT_FOUND" }, { status: 404 });
    }

    if (invitation.companyId) {
      const access = await requireCompanyAccess(user.id, invitation.companyId, "canManageTeam");
      if (!access.ok) {
        return json({ error: access.error, code: access.code }, { status: access.status });
      }
    } else if (invitation.userId !== user.id) {
      return json({ error: "Brak uprawnień do odwołania tego zaproszenia.", code: "FORBIDDEN" }, { status: 403 });
    }

    await prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });

    if (invitation.companyId) {
      await recordAuditLog({
        companyId: invitation.companyId,
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        action: "team_invite_revoke",
        entityType: "team",
        entityId: invitation.id,
        description: `${user.name || user.email} odwołał(a) zaproszenie dla ${invitation.email}`,
        details: { email: invitation.email, role: invitation.role },
      });
    }

    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

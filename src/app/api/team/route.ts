import * as crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyMemberToDto, teamInvitationToDto } from "@/lib/dto";
import { recordAuditLog } from "@/lib/audit";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/team?companyId=... — Lista członków zespołu i oczekujących zaproszeń dla firmy
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const url = new URL(req.url);
    let companyId = url.searchParams.get("companyId");

    // Jeśli brak companyId, wybierz domyślną firmę użytkownika
    if (!companyId) {
      const defaultComp = await prisma.companyProfile.findFirst({
        where: { userId: user.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
      companyId = defaultComp?.id || null;
    }

    if (!companyId) {
      return json({ members: [], invitations: [] });
    }

    const access = await requireCompanyAccess(user.id, companyId);
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    const [members, invitations] = await Promise.all([
      prisma.companyMember.findMany({
        where: { companyId },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.teamInvitation.findMany({
        where: {
          companyId,
          status: "pending",
        },
        include: {
          company: { select: { companyName: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return json({
      members: members.map(companyMemberToDto),
      invitations: invitations.map(teamInvitationToDto),
      currentRole: access.membership.role,
      permissions: access.membership.permissions,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/team — Zaproszenie nowego użytkownika do firmy
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = (typeof body.role === "string" ? body.role : "accountant") as CompanyRole;
    const permissions = body.permissions && typeof body.permissions === "object" ? body.permissions : null;

    if (!companyId) {
      return json({ error: "Brak identyfikatora firmy." }, { status: 400 });
    }

    // Wymagane uprawnienie canManageTeam
    const access = await requireCompanyAccess(user.id, companyId, "canManageTeam");
    if (!access.ok) {
      return json({ error: access.error, code: access.code }, { status: access.status });
    }

    if (!email || !email.includes("@") || email.length > 254) {
      return json({ error: "Podaj prawidłowy adres e-mail." }, { status: 400 });
    }

    // Sprawdź czy użytkownik nie jest już członkiem tej firmy
    const existingMember = await prisma.companyMember.findFirst({
      where: {
        companyId,
        user: { email },
      },
    });
    if (existingMember) {
      return json({ error: `Użytkownik o adresie ${email} jest już członkiem tej firmy.` }, { status: 400 });
    }

    // Unieważnij poprzednie oczekujące zaproszenia dla tego samego e-maila w tej firmie
    await prisma.teamInvitation.updateMany({
      where: {
        companyId,
        email,
        status: "pending",
      },
      data: { status: "revoked" },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 14 * 86400000); // 14 dni ważności

    const invitation = await prisma.teamInvitation.create({
      data: {
        companyId,
        userId: user.id,
        email,
        role,
        permissions,
        token,
        expiresAt,
        status: "pending",
      },
      include: {
        company: { select: { companyName: true } },
      },
    });

    // Zapis w historii audytowej
    await recordAuditLog({
      companyId,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "team_invite",
      entityType: "team",
      entityId: invitation.id,
      description: `${user.name || user.email} zaprosił(a) ${email} do zespołu (rola: ${role})`,
      details: { email, role, expiresAt: expiresAt.toISOString() },
    });

    return json({
      invitation: teamInvitationToDto(invitation),
      inviteUrl: `/invite/${token}`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

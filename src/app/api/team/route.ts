import {ApiError} from "@/lib/api";
import {teamActor,validateTeamGrant} from "@/lib/team-grants";
import {sendEmail,isValidEmail} from "@/lib/email/sender";
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
      access.membership.permissions.canManageTeam ? prisma.teamInvitation.findMany({
        where: {
          companyId,
          status: "pending",
        },
        include: {
          company: { select: { companyName: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }) : Promise.resolve([]),
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
    if (!isValidEmail(email)) throw new ApiError(400,"Podaj prawidłowy adres e-mail.");
    const invitation=await prisma.$transaction(async tx=>{
      const actor=await teamActor(tx,user.id,companyId);
      const grant=validateTeamGrant(body.role||"accountant",body.permissions,actor);
      if(await tx.companyMember.findFirst({where:{companyId,user:{email}}}))throw new ApiError(400,"Ten użytkownik jest już członkiem zespołu.");
      await tx.teamInvitation.updateMany({where:{companyId,email,status:"pending"},data:{status:"revoked"}});
      const result=await tx.teamInvitation.create({data:{companyId,userId:user.id,email,role:grant.role,permissions:grant.permissions as any,token:crypto.randomBytes(32).toString("hex"),expiresAt:new Date(Date.now()+14*86400000),status:"pending"},include:{company:{select:{companyName:true}}}});
      await recordAuditLog({client:tx,companyId,userId:user.id,userName:user.name,userEmail:user.email,action:"team_invite",entityType:"team",entityId:result.id,details:{email,role:grant.role}});
      return result;
    });
    let emailDelivery="error";
    try{const delivery=await sendEmail({to:email,subject:"Zaproszenie do zespołu FakturaProsto",text:`${user.name||user.email} zaprasza Cię do firmy ${invitation.company?.companyName||"Firma"}.\nPrzyjmij zaproszenie: https://fakturaprosto.pl/invite/${invitation.token}\nLink ważny przez 14 dni.`,singleAttempt:true});if(delivery.success)emailDelivery="sent";}catch{}
    return json({invitation:teamInvitationToDto(invitation),inviteUrl:`/invite/${invitation.token}`,emailDelivery});
  } catch (e) {
    return handleApiError(e);
  }
}

import {ApiError} from "@/lib/api";
import {teamInvitationGrantor,validateTeamGrant} from "@/lib/team-grants";
import {rateLimitShared} from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  getSession,
  hashPassword,
  verifyPassword,
  validateCredentials,
  createSession,
  sessionCookieOptions,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth";
import { handleApiError, json, readJson, cleanStr } from "@/lib/api";
import { recordAuditLog } from "@/lib/audit";
import { PASSWORD_LENGTH_MESSAGE } from "@/lib/password-policy";
import { anonymizeIp } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS } from "@/lib/legal/config";

export const runtime = "nodejs";

/**
 * GET /api/invite/[token] — Weryfikacja ważności zaproszenia
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = (await params).token;
    if (!token) return json({ error: "Brak tokena zaproszenia." }, { status: 400 });

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: {
        company: { select: { id: true, companyName: true, nip: true } },
        user: { select: { name: true, email: true } },
      },
    });

    if (!invitation) {
      return json({ valid: false, error: "Nieprawidłowy link zaproszenia." }, { status: 404 });
    }

    if (invitation.status === "revoked") {
      return json({ valid: false, error: "To zaproszenie zostało odwołane przez administratora firmy." }, { status: 410 });
    }

    if (invitation.status === "accepted") {
      return json({ valid: false, error: "To zaproszenie zostało już wcześniej wykorzystane." }, { status: 410 });
    }

    const isExpired = invitation.expiresAt.getTime() < Date.now();
    if (isExpired) {
      return json({ valid: false, error: "Termin ważności zaproszenia minął." }, { status: 410 });
    }

    // Sprawdź czy konto użytkownika dla tego e-maila już istnieje
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, email: true, name: true },
    });

    return json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      companyName: invitation.company?.companyName || "Firma",
      companyNip: invitation.company?.nip,
      expiresAt: invitation.expiresAt.toISOString(),
      hasExistingAccount: Boolean(existingUser),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/invite/[token] — Akceptacja zaproszenia (zalogowany użytkownik, logowanie lub rejestracja nowego konta)
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limit=await rateLimitShared(req,{max:30,windowMs:15*60*1000},"team-invite");
    if(!limit.allowed)throw new ApiError(429,"Zbyt wiele prób przyjęcia zaproszenia.");
    const token = (await params).token;
    if (!token) return json({ error: "Brak tokena zaproszenia." }, { status: 400 });

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: {
        company: { select: { id: true, companyName: true, nip: true, userId: true } },
      },
    });

    if (!invitation) {
      return json({ error: "Nieprawidłowy link zaproszenia." }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return json({ error: `Zaproszenie nie jest aktywne (status: ${invitation.status}).` }, { status: 400 });
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.teamInvitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
      return json({ error: "Termin ważności zaproszenia wygasł." }, { status: 400 });
    }

    if (!invitation.companyId!) {
      return json({ error: "Brak przypisanej firmy do zaproszenia." }, { status: 400 });
    }

    const body = await readJson(req);
    const currentSession = await getSession();
    let targetUser = currentSession?.user ?? null;
    let newSessionCookie: string | null = null;
    let newUserData: { email: string; password: string; name: string; role: string } | null = null;
    const needsSession=!targetUser;

    // SCENARIUSZ 1: Użytkownik jest już zalogowany w obecnej sesji
    if (targetUser) {
      if (targetUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return json(
          {
            error: `Jesteś zalogowany jako ${targetUser.email}, a zaproszenie wystawiono dla ${invitation.email}. Wyloguj się, aby je przyjąć.`,
            code: "EMAIL_MISMATCH",
          },
          { status: 403 }
        );
      }
    } else {
      // SCENARIUSZ 2: Użytkownik nie jest zalogowany — logowanie lub rejestracja
      const existingUser = await prisma.user.findUnique({
        where: { email: invitation.email },
      });

      if (existingUser) {
        const mfa=await prisma.userMfa.findUnique({where:{userId:existingUser.id},select:{enabledAt:true}});
        if(mfa?.enabledAt)return json({error:"Zaloguj się z kodem MFA, a następnie przyjmij zaproszenie.",code:"MFA_REQUIRED"},{status:403});
        // Logowanie istniejącego użytkownika
        const password = typeof body.password === "string" ? body.password : "";
        if (!password) {
          return json({ error: "Wpisz hasło do swojego konta, aby potwierdzić tożsamość." }, { status: 400 });
        }
        const isValid = await verifyPassword(password, existingUser.password);
        if (!isValid) {
          return json({ error: "Nieprawidłowe hasło." }, { status: 401 });
        }
        targetUser = existingUser as any;
      } else {
        // Rejestracja nowego użytkownika dla tego e-maila
        if (body.acceptTerms !== true) {
          return json({ error: "Akceptacja Regulaminu jest wymagana do utworzenia konta.", code: "TERMS_NOT_ACCEPTED" }, { status: 400 });
        }
        const password = typeof body.password === "string" ? body.password : "";
        const name = cleanStr(body.name, 100, "name");
        if (!name) return json({ error: "Wpisz swoje imię i nazwisko.", code: "INVALID_INPUT" }, { status: 400 });
        const credCheck = validateCredentials(invitation.email, password);
        if (!credCheck.ok) {
          return json({ error: PASSWORD_LENGTH_MESSAGE }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        newUserData = {
            email: invitation.email,
            password: passwordHash,
            name,
            role: "owner", // rola bazowa
        };
      }

    }
    await prisma.$transaction(async tx=>{
      const now = new Date();
      if (newUserData) {
        // Account, legal proof, invitation claim and company grant share one
        // transaction: revoked grants and conflicts cannot leave orphan users.
        targetUser = await tx.user.create({ data: {
          ...newUserData,
          emailVerificationRequiredAt: now,
          termsAcceptedAt: now,
          termsAcceptedVersion: LEGAL_VERSIONS.terms,
          legalConsents: { create: {
            documentType: "terms_of_service",
            documentVersion: LEGAL_VERSIONS.terms,
            accepted: true,
            acceptedAt: now,
            ipAddress: anonymizeIp(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip")),
            userAgent: req.headers.get("user-agent")?.slice(0, 255) || null,
            context: "invite_accept",
            companyId: invitation.companyId,
          } },
        } }) as any;
      }
      const proof = await tx.user.updateMany({where:{id:targetUser!.id,password:targetUser!.password,email:targetUser!.email},data:{updatedAt:now}});
      if(proof.count!==1)throw new ApiError(401,"Dane logowania zostały zmienione. Zaloguj się ponownie.","INVALID_CREDENTIALS");
      const mfa=await tx.userMfa.findUnique({where:{userId:targetUser!.id},select:{enabledAt:true}});
      if(currentSession){
        const live=await tx.session.updateMany({where:{id:currentSession.sessionId,userId:targetUser!.id,expiresAt:{gt:now},...(mfa?.enabledAt?{mfaVerifiedAt:mfa.enabledAt}:{})},data:{authenticatedAt:now}});
        if(live.count!==1)throw new ApiError(401,"Sesja wygasła. Zaloguj się ponownie.","UNAUTHENTICATED");
      }else if(mfa?.enabledAt)throw new ApiError(403,"Zaloguj się z kodem MFA, a następnie przyjmij zaproszenie.","MFA_REQUIRED");
      const actor=await teamInvitationGrantor(tx,invitation.userId,invitation.companyId!);
      const grant=validateTeamGrant(invitation.role,invitation.permissions,actor);
      if(await tx.companyMember.findUnique({where:{companyId_userId:{companyId:invitation.companyId!,userId:targetUser!.id}}}))throw new ApiError(409,"Jesteś już członkiem firmy.");
      const claimed=await tx.teamInvitation.updateMany({where:{id:invitation.id,status:"pending",expiresAt:{gt:new Date()}},data:{status:"accepted",acceptedAt:new Date()}});
      if(claimed.count!==1)throw new ApiError(409,"Zaproszenie zostało wykorzystane lub wygasło.");
      await tx.companyMember.create({data:{companyId:invitation.companyId!,userId:targetUser!.id,role:grant.role,...grant.permissions}});
      await recordAuditLog({client:tx,companyId:invitation.companyId!,userId:targetUser!.id,userName:targetUser!.name,userEmail:targetUser!.email,action:"team_join",entityType:"team",entityId:invitation.id,details:{role:grant.role}});
    });
    if(needsSession){const sessionResult=await createSession(targetUser!.id,{expectedPasswordHash:targetUser!.password,expectedLoginEmail:targetUser!.email}),cookieOpts=sessionCookieOptions(undefined,req);newSessionCookie=`${AUTH_SESSION_COOKIE}=${sessionResult.token}; Path=${cookieOpts.path}; HttpOnly; SameSite=${cookieOpts.sameSite}${cookieOpts.secure?"; Secure":""}; Max-Age=${cookieOpts.maxAge}`;}

    const responseHeaders: HeadersInit = {};
    if (newSessionCookie) {
      responseHeaders["Set-Cookie"] = newSessionCookie;
    }

    return json(
      {
        success: true,
        message: `Dołączono do firmy ${invitation.company?.companyName || ""}.`,
        companyId: invitation.companyId!,
      },
      { headers: responseHeaders }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

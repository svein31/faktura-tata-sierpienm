import { prisma } from "@/lib/db";
import {
  getSessionUser,
  hashPassword,
  verifyPassword,
  validateCredentials,
  createSession,
  sessionCookieOptions,
  AUTH_SESSION_COOKIE,
} from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import type { CompanyRole } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id?: string; token?: string }> };

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

    if (!invitation.companyId) {
      return json({ error: "Brak przypisanej firmy do zaproszenia." }, { status: 400 });
    }

    const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
    let targetUser = await getSessionUser();
    let newSessionCookie: string | null = null;

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
        const password = typeof body.password === "string" ? body.password : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const credCheck = validateCredentials(invitation.email, password);
        if (!credCheck.ok) {
          return json({ error: "Hasło musi mieć co najmniej 8 znaków." }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        const createdUser = await prisma.user.create({
          data: {
            email: invitation.email,
            password: passwordHash,
            name: name || invitation.email.split("@")[0],
            role: "owner", // rola bazowa
          },
        });
        targetUser = createdUser as any;
      }

      // Utwórz sesję dla zalogowanego/zarejestrowanego użytkownika
      const sessionResult = await createSession(targetUser!.id);
      const cookieOpts = sessionCookieOptions();
      newSessionCookie = `${AUTH_SESSION_COOKIE}=${sessionResult.token}; Path=${cookieOpts.path}; HttpOnly; SameSite=${cookieOpts.sameSite}${cookieOpts.secure ? "; Secure" : ""}; Max-Age=${cookieOpts.maxAge}`;
    }

    const role = (invitation.role as CompanyRole) || "employee";
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.employee;
    const permissions = (invitation.permissions as any) || {};

    // 1. Zapisz powiązanie w CompanyMember (lub zaktualizuj jeśli istniało)
    await prisma.companyMember.upsert({
      where: {
        companyId_userId: {
          companyId: invitation.companyId,
          userId: targetUser!.id,
        },
      },
      update: {
        role,
        canIssueInvoices: permissions.canIssueInvoices ?? defaults.canIssueInvoices,
        canCreateCorrections: permissions.canCreateCorrections ?? defaults.canCreateCorrections,
        canRecordPayments: permissions.canRecordPayments ?? defaults.canRecordPayments,
        canExport: permissions.canExport ?? defaults.canExport,
        canSendKsef: permissions.canSendKsef ?? defaults.canSendKsef,
        canManageBankAccounts: permissions.canManageBankAccounts ?? defaults.canManageBankAccounts,
        canManageTeam: role === "owner" ? true : (permissions.canManageTeam ?? defaults.canManageTeam),
      },
      create: {
        companyId: invitation.companyId,
        userId: targetUser!.id,
        role,
        canIssueInvoices: permissions.canIssueInvoices ?? defaults.canIssueInvoices,
        canCreateCorrections: permissions.canCreateCorrections ?? defaults.canCreateCorrections,
        canRecordPayments: permissions.canRecordPayments ?? defaults.canRecordPayments,
        canExport: permissions.canExport ?? defaults.canExport,
        canSendKsef: permissions.canSendKsef ?? defaults.canSendKsef,
        canManageBankAccounts: permissions.canManageBankAccounts ?? defaults.canManageBankAccounts,
        canManageTeam: role === "owner" ? true : (permissions.canManageTeam ?? defaults.canManageTeam),
      },
    });

    // 2. Oznacz zaproszenie jako zużyte (jednorazowe)
    await prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
      },
    });

    // 3. Zapis w historii audytowej
    await recordAuditLog({
      companyId: invitation.companyId,
      userId: targetUser!.id,
      userName: targetUser!.name || targetUser!.email,
      userEmail: targetUser!.email,
      action: "team_join",
      entityType: "team",
      entityId: invitation.companyId,
      description: `${targetUser!.name || targetUser!.email} dołączył(a) do zespołu firmy (rola: ${role})`,
      details: { email: invitation.email, role },
    });

    const responseHeaders: HeadersInit = {};
    if (newSessionCookie) {
      responseHeaders["Set-Cookie"] = newSessionCookie;
    }

    return json(
      {
        success: true,
        message: `Dołączono do firmy ${invitation.company?.companyName || ""}.`,
        companyId: invitation.companyId,
      },
      { headers: responseHeaders }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

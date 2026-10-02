import { assertCompanyMfa } from "./security-policy";
import { prisma } from "@/lib/db";
import type { CompanyPermissions, CompanyRole } from "@/lib/types";

import { DEFAULT_ROLE_PERMISSIONS } from "./role-permissions";
export { DEFAULT_ROLE_PERMISSIONS, ROLE_LABELS } from "./role-permissions";

export interface MembershipResult {
  role: CompanyRole;
  permissions: CompanyPermissions;
  company: {
    id: string;
    companyName: string;
    nip: string;
    userId: string;
  };
  memberId?: string;
}

/**
 * Sprawdza członkostwo i uprawnienia użytkownika w firmie w czasie rzeczywistym.
 * Zapewnia natychmiastowe odcięcie dostępu w trwającej sesji po odebraniu roli.
 */
export async function getCompanyMembership(
  userId: string,
  companyId: string
): Promise<MembershipResult | null> {
  if (!userId || !/^[a-f0-9]{24}$/i.test(companyId)) return null;

  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: { id: true, companyName: true, nip: true, userId: true },
  });

  if (!company) return null;


  // 1. Sprawdź rekord w CompanyMember
  const member = await prisma.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId,
        userId,
      },
    },
  });

  if (member) {
    await assertCompanyMfa(prisma, userId, companyId);
    const role = member.role as CompanyRole;
    if (!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, role)) return null;
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];

    // Właściciel zawsze ma pełne uprawnienia
    if (role === "owner") {
      return {
        role: "owner",
        permissions: { ...DEFAULT_ROLE_PERMISSIONS.owner },
        company,
        memberId: member.id,
      };
    }

    return {
      role,
      permissions: {
        canIssueInvoices: member.canIssueInvoices ?? defaults.canIssueInvoices,
        canCreateCorrections: member.canCreateCorrections ?? defaults.canCreateCorrections,
        canRecordPayments: member.canRecordPayments ?? defaults.canRecordPayments,
        canExport: member.canExport ?? defaults.canExport,
        canSendKsef: member.canSendKsef ?? defaults.canSendKsef,
        canManageBankAccounts: member.canManageBankAccounts ?? defaults.canManageBankAccounts,
        canManageTeam: member.canManageTeam ?? defaults.canManageTeam,
        canManageIntegrations: member.canManageIntegrations ?? defaults.canManageIntegrations,
      },
      company,
      memberId: member.id,
    };
  }

  // 2. Fallback dla bezpośredniego założyciela profilu
  if (company.userId === userId) {
    await assertCompanyMfa(prisma, userId, companyId);
    // Utwórz brakujący wpis dla spójności
    try {
      const created = await prisma.companyMember.create({
        data: {
          companyId,
          userId,
          role: "owner",
          canIssueInvoices: true,
          canCreateCorrections: true,
          canRecordPayments: true,
          canExport: true,
          canSendKsef: true,
          canManageBankAccounts: true,
          canManageTeam: true,
        },
      });
      return {
        role: "owner",
        permissions: { ...DEFAULT_ROLE_PERMISSIONS.owner },
        company,
        memberId: created.id,
      };
    } catch {
      return {
        role: "owner",
        permissions: { ...DEFAULT_ROLE_PERMISSIONS.owner },
        company,
      };
    }
  }

  return null;
}

/**
 * Wymaga dostępu do firmy na poziomie API i weryfikuje opcjonalne uprawnienie granularne.
 */
export async function requireCompanyAccess(
  userId: string,
  companyId: string,
  requiredPermission?: keyof CompanyPermissions
): Promise<{ ok: true; membership: MembershipResult } | { ok: false; status: number; error: string; code: string }> {
  if (!/^[a-f0-9]{24}$/i.test(companyId)) return { ok: false, status: 400, error: "Nieprawidłowy identyfikator firmy.", code: "INVALID_ID" };
  const membership = await getCompanyMembership(userId, companyId);
  if (!membership) {
    return {
      ok: false,
      status: 403,
      error: "Brak dostępu do wskazanej firmy.",
      code: "FORBIDDEN_NOT_MEMBER",
    };
  }

  if (requiredPermission) {
    if (membership.role === "owner") {
      return { ok: true, membership };
    }

    if (!membership.permissions[requiredPermission]) {
      return {
        ok: false,
        status: 403,
        error: `Brak uprawnienia do wykonania tej operacji (${requiredPermission}).`,
        code: "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
      };
    }
  }

  return { ok: true, membership };
}

/**
 * Blokuje usunięcie lub degradację ostatniego właściciela danej firmy.
 */
export async function ensureNotLastOwner(companyId: string, targetUserId: string): Promise<{ canProceed: boolean; reason?: string }> {
  const targetMember = await prisma.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId,
        userId: targetUserId,
      },
    },
  });

  const company = await prisma.companyProfile.findUnique({
    where: { id: companyId },
    select: { userId: true },
  });

  const isTargetOwner = targetMember?.role === "owner" || company?.userId === targetUserId;
  if (!isTargetOwner) {
    return { canProceed: true };
  }

  // Policz ilu jest aktywnych właścicieli
  const ownersCount = await prisma.companyMember.count({
    where: {
      companyId,
      role: "owner",
    },
  });

  if (ownersCount <= 1) {
    return {
      canProceed: false,
      reason: "Nie można usunąć ani odebrać uprawnień jedynemu właścicielowi firmy.",
    };
  }

  return { canProceed: true };
}

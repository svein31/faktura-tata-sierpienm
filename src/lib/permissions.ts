import { prisma } from "@/lib/db";
import type { CompanyPermissions, CompanyRole } from "@/lib/types";

export const DEFAULT_ROLE_PERMISSIONS: Record<CompanyRole, CompanyPermissions> = {
  owner: {
    canIssueInvoices: true,
    canCreateCorrections: true,
    canRecordPayments: true,
    canExport: true,
    canSendKsef: true,
    canManageBankAccounts: true,
    canManageTeam: true,
  },
  accountant: {
    canIssueInvoices: false,
    canCreateCorrections: false,
    canRecordPayments: true,
    canExport: true,
    canSendKsef: false,
    canManageBankAccounts: false,
    canManageTeam: false,
  },
  employee: {
    canIssueInvoices: true,
    canCreateCorrections: false,
    canRecordPayments: false,
    canExport: false,
    canSendKsef: true,
    canManageBankAccounts: false,
    canManageTeam: false,
  },
  viewer: {
    canIssueInvoices: false,
    canCreateCorrections: false,
    canRecordPayments: false,
    canExport: false,
    canSendKsef: false,
    canManageBankAccounts: false,
    canManageTeam: false,
  },
};

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Właściciel",
  accountant: "Księgowa / Biuro",
  employee: "Pracownik",
  viewer: "Podgląd (Odczyt)",
};

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
  if (!userId || !companyId) return null;

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
    const role = (member.role as CompanyRole) || "employee";
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.employee;

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
      },
      company,
      memberId: member.id,
    };
  }

  // 2. Fallback dla bezpośredniego założyciela profilu
  if (company.userId === userId) {
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

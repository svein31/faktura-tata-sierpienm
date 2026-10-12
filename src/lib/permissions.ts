import { ApiError } from "./api";
import { readCompanyAccess, type CompanyAccessRead } from "./company-access-read";
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

function assertReadMfa(access: CompanyAccessRead) {
  if (access.requireMfa && !access.mfaEnabled) throw new ApiError(403, "Firma wymaga 2FA. Włącz je w Ustawieniach konta, aby uzyskać dostęp.", "COMPANY_MFA_REQUIRED");
}

function membershipFromMember(access: CompanyAccessRead): MembershipResult | null {
  const { company, member } = access;
  if (!member?.valid) return null;
  assertReadMfa(access);
  const role = member.role as CompanyRole;
  if (!Object.hasOwn(DEFAULT_ROLE_PERMISSIONS, role)) return null;
  return {
    role,
    permissions: role === "owner" ? { ...DEFAULT_ROLE_PERMISSIONS.owner } : member.permissions,
    company,
    memberId: member.id,
  };
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

  const access = await readCompanyAccess(prisma, userId, companyId);
  if (!access) return null;
  const { company, member } = access;

  if (member) return membershipFromMember(access);

  // 2. Fallback dla bezpośredniego założyciela profilu
  if (company.userId === userId) {
    assertReadMfa(access);
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
      // A concurrent insert may have assigned a lower role or changed the MFA policy.
      // Re-read once before owner fallback; never retry the create or cache that fallback.
      const current = await readCompanyAccess(prisma, userId, companyId);
      if (!current) return null;
      if (current.member) return membershipFromMember(current);
      if (current.company.userId !== userId) return null;
      assertReadMfa(current);
      return {
        role: "owner",
        permissions: { ...DEFAULT_ROLE_PERMISSIONS.owner },
        company: current.company,
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

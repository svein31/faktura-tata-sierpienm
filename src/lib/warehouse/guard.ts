/**
 * Uprawnienia do operacji magazynowych.
 *
 * Role tylko-do-odczytu wyznaczamy z `DEFAULT_ROLE_PERMISSIONS` (src/lib/permissions.ts):
 * rola, która nie może ani wystawiać dokumentów, ani rejestrować płatności, nie może również
 * tworzyć ani anulować dokumentów magazynowych. W praktyce dotyczy to roli `viewer`.
 */

import { ApiError } from "@/lib/api";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import type { CompanyRole } from "@/lib/types";

const ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS) as CompanyRole[];

const READ_ONLY_ROLES = new Set<CompanyRole>(
  ROLES.filter((role) => {
    const p = DEFAULT_ROLE_PERMISSIONS[role];
    return !p.canIssueInvoices && !p.canRecordPayments;
  })
);

export function normalizeRole(role: unknown): CompanyRole {
  return ROLES.includes(role as CompanyRole) ? (role as CompanyRole) : "viewer";
}

/** true, gdy użytkownik może tworzyć / anulować dokumenty magazynowe i prowadzić remanent. */
export function canManageStock(user: { role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return !READ_ONLY_ROLES.has(normalizeRole(user.role));
}

/** Rzuca `ApiError(403)`, gdy rola użytkownika ma wyłącznie prawo podglądu. */
export function assertCanManageStock(user: { role?: string | null } | null | undefined): void {
  if (!canManageStock(user)) {
    throw new ApiError(
      403,
      "Twoja rola pozwala wyłącznie na podglądanie magazynu.",
      "FORBIDDEN_READ_ONLY"
    );
  }
}

import type { CompanyProfile, KsefSettings } from "@/lib/types";
import { isValidNipFormat, normalizeNip } from "@/lib/validation";

export type OnboardingDocument = { id: string; number: string; companyId: string };

/** Readiness comes from saved, company-scoped data, never from opening a guide. */
export function onboardingReadiness(
  company: CompanyProfile | null,
  ksef: KsefSettings | null,
  document: OnboardingDocument | null = null,
) {
  const nip = normalizeNip(company?.nip || "");
  const companyReady = Boolean(
    company?.id && company.companyName.trim() &&
    isValidNipFormat(nip) && !/^(\d)\1{9}$/.test(nip) &&
    company.street?.trim() && company.city?.trim() && (company.postalCode || company.postal)?.trim(),
  );
  const savedDocument = company?.id && document?.companyId === company.id && document.id
    ? document : null;
  return {
    companyReady,
    savedDocument,
    canCreate: Boolean(company?.currentUserRole === "owner" || company?.currentUserPermissions?.canIssueInvoices),
    canManageKsef: Boolean(company?.currentUserRole === "owner" || company?.currentUserPermissions?.canManageIntegrations),
    // certName is only a user-supplied label, not an authentication credential.
    tokenSaved: Boolean(company?.ksefTokenSet),
    environment: company?.ksefEnvironment || ksef?.environment || "demo",
  };
}

/** Each browser preference belongs to one signed-in person and one company. */
export function onboardingPreferenceKey(kind: "guide-seen" | "banner-dismissed", userId?: string | null, companyId?: string | null) {
  if (!userId) return null;
  return `fakturo_onboarding_v3:${kind}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId || "no-company")}`;
}

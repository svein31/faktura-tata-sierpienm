import { onboardingPreferenceKey } from "./progress";

export const OPEN_ONBOARDING_EVENT = "fakturo:open-onboarding";

export function openOnboardingTour() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT));
}

/** This records viewing/dismissing the guide, not completing company setup. */
export function hasCompletedOnboarding(userId?: string | null, companyId?: string | null): boolean {
  const key = onboardingPreferenceKey("guide-seen", userId, companyId);
  if (!key) return false;
  try { return localStorage.getItem(key) === "true"; }
  catch { return false; }
}

export function markOnboardingSeen(userId?: string | null, companyId?: string | null) {
  const key = onboardingPreferenceKey("guide-seen", userId, companyId);
  if (!key) return;
  try { localStorage.setItem(key, "true"); } catch { /* A guide remains usable without storage. */ }
}

export const ONBOARDING_STORAGE_KEY = "fakturo_onboarding_completed_v2";
export const OPEN_ONBOARDING_EVENT = "fakturo:open-onboarding";

export function openOnboardingTour() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT));
}

export function hasCompletedOnboarding(): boolean {
  try { return !!localStorage.getItem(ONBOARDING_STORAGE_KEY); }
  catch { return false; }
}

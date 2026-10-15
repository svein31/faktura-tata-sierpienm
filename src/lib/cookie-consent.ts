// One version for the banner, optional clients and server-side pilot metrics.
// A version change requires a fresh choice before optional processing resumes.
export const COOKIE_CONSENT_NAME = "fakturo_consent";
export const COOKIE_CONSENT_VERSION = "1.2.0-2026-10-15";

export function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const cookie = document.cookie.split(";").map(value => value.trim())
      .find(value => value.startsWith(`${COOKIE_CONSENT_NAME}=`));
    const consent = JSON.parse(decodeURIComponent(cookie?.slice(COOKIE_CONSENT_NAME.length + 1) || "null"));
    return consent?.version === COOKIE_CONSENT_VERSION && consent.analytics === true;
  } catch {
    return false;
  }
}

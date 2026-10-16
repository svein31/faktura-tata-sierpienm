// One version for the banner, optional clients and server-side pilot metrics.
// A version change requires a fresh choice before optional processing resumes.
export const COOKIE_CONSENT_NAME = "fakturo_consent";
export const COOKIE_CONSENT_VERSION = "1.2.0-2026-10-15";

// Hide the server-rendered banner before paint only for a saved current choice.
// This does not grant consent, write cookies or load any measurement script.
export const COOKIE_CONSENT_VISIBILITY_SCRIPT = `(()=>{try{const v=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('${COOKIE_CONSENT_NAME}='));const c=JSON.parse(decodeURIComponent(v?.slice(${COOKIE_CONSENT_NAME.length + 1})||'null'));if(c?.version===${JSON.stringify(COOKIE_CONSENT_VERSION)})document.documentElement.setAttribute('data-saved-cookie-consent','true')}catch{}})();`;

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

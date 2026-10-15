import onpage from "./seo/onpage.json";
import { hasAnalyticsConsent } from "./cookie-consent";

// A measurement ID is public configuration, not an API credential.
export const GOOGLE_ANALYTICS_ID = "G-4P218PFSBX";
const SCRIPT_ID = "fakturaprosto-google-analytics";
const PUBLIC_PATHS = new Set(onpage.filter(page => page.index === true).map(page => page.url));
const DENIED = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
const PAGE_TITLE = "FakturaProsto";
type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean;
};
type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean };

let installed = 0;
let teardown: (() => void) | null = null;
let enabled = false;
let configured = false;
let script: HTMLScriptElement | null = null;
let loading = false;
let lastPage: string | null = null;

/** Exact public paths only: invoice IDs, account screens and portal tokens never qualify. */
export function analyticsPublicPath(pathname: string): string | null {
  return PUBLIC_PATHS.has(pathname) ? pathname : null;
}

function browser(): AnalyticsWindow { return window as unknown as AnalyticsWindow; }
function consented(): boolean {
  const privacy = navigator as PrivacyNavigator;
  return hasAnalyticsConsent() && privacy.globalPrivacyControl !== true &&
    privacy.doNotTrack !== "1" && privacy.doNotTrack !== "yes" &&
    (window as Window & { doNotTrack?: string }).doNotTrack !== "1";
}
function publicLocation(): string | null {
  const path = analyticsPublicPath(window.location.pathname);
  return path ? `${window.location.origin}${path}` : null;
}
function safeReferrer(): string {
  try { return document.referrer ? new URL(document.referrer).origin : ""; }
  catch { return ""; }
}

function expireAnalyticsCookies() {
  const names = document.cookie.split(";").map(value => value.trim().split("=")[0]).filter(name => /^_ga(?:_|$)/.test(name));
  const hostname = window.location.hostname;
  // Also remove older domain-scoped cookies, if a prior tag created any.
  const domains = ["", ...hostname.split(".").map((_, index, parts) => parts.slice(index).join(".")).filter(value => value.includes("."))];
  for (const name of names) for (const domain of domains) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
  }
}

function send(...args: unknown[]) { browser().gtag?.(...args); }

function suspend(withdrawn: boolean) {
  browser()[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
  if (enabled) send("consent", "update", DENIED);
  enabled = false;
  lastPage = null;
  // Discard queued page views if consent is withdrawn before gtag.js finishes loading.
  if (withdrawn) {
    browser().dataLayer?.splice(0);
    if (loading) {
      script?.remove();
      script = null;
      loading = false;
      configured = false;
    }
    expireAnalyticsCookies();
  }
}

function configure(location: string) {
  const analytics = browser();
  analytics.dataLayer ||= [];
  analytics.gtag ||= function (...args: unknown[]) {
    // Recheck the cookie for every command, including a pending async callback.
    if (args[0] !== "consent" && (!consented() || !publicLocation())) return;
    analytics.dataLayer!.push(arguments);
  };
  send("consent", "default", DENIED);
  send("set", "ads_data_redaction", true);
  send("set", "url_passthrough", false);
  send("js", new Date());
  send("config", GOOGLE_ANALYTICS_ID, {
    send_page_view: false,
    page_location: location,
    page_referrer: safeReferrer(),
    page_title: PAGE_TITLE,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: "none",
    cookie_expires: 30 * 24 * 60 * 60,
    cookie_update: false,
  });
  configured = true;
  const tag = document.createElement("script");
  script = tag;
  tag.id = SCRIPT_ID;
  tag.async = true;
  // Query strings and tokens must not travel in the script request's Referer header.
  tag.referrerPolicy = "origin";
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
  loading = true;
  tag.onload = () => {
    if (script !== tag) return;
    loading = false;
    syncGoogleAnalyticsRoute();
  };
  tag.onerror = () => {
    if (script !== tag) return;
    try { suspend(true); script?.remove(); script = null; configured = false; }
    catch { /* Optional analytics must never affect the application. */ }
  };
  document.head.appendChild(tag);
}

/** Called after Next navigation and synchronously around browser-history changes. */
export function syncGoogleAnalyticsRoute(): void {
  if (typeof window === "undefined") return;
  try {
    const location = publicLocation();
    const accepted = consented();
    if (!accepted || !location) { suspend(!accepted); return; }
    if (!configured) configure(location);
    browser()[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false;
    if (!enabled) {
      send("consent", "update", { ...DENIED, analytics_storage: "granted" });
      enabled = true;
    }
    if (location === lastPage) return;
    // Defaults also keep Google's delayed engagement events free of URL parameters,
    // personal document titles and private referrer paths.
    const page = { page_location: location, page_referrer: safeReferrer(), page_title: PAGE_TITLE };
    send("set", page);
    send("event", "page_view", page);
    lastPage = location;
  } catch { /* A blocked script, cookie or browser API must not break navigation. */ }
}

/** Install once per root mount; repeated effects keep the same tag and page-view state. */
export function installGoogleAnalytics(): () => void {
  if (typeof window === "undefined") return () => {};
  installed += 1;
  if (!teardown) {
    const history = window.history;
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    const wrap = (original: History["pushState"]): History["pushState"] => function (data, unused, url) {
      // Google can observe history changes before React effects. Disable collection
      // before delegating any move into the application, not after rendering it.
      try {
        if (url != null && !analyticsPublicPath(new URL(String(url), window.location.href).pathname)) suspend(false);
      } catch { /* Let the native history API validate invalid URLs. */ }
      try { return original.call(history, data, unused, url); }
      finally { syncGoogleAnalyticsRoute(); }
    };
    const wrappedPush = wrap(pushState), wrappedReplace = wrap(replaceState);
    history.pushState = wrappedPush;
    history.replaceState = wrappedReplace;
    const sync = () => syncGoogleAnalyticsRoute();
    window.addEventListener("fakturo-consent-updated", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("popstate", sync, true);
    teardown = () => {
      window.removeEventListener("fakturo-consent-updated", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("popstate", sync, true);
      if (history.pushState === wrappedPush) history.pushState = pushState;
      if (history.replaceState === wrappedReplace) history.replaceState = replaceState;
      teardown = null;
    };
  }
  syncGoogleAnalyticsRoute();
  return () => {
    installed -= 1;
    if (!installed) teardown?.();
  };
}

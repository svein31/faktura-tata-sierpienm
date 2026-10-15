import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { CookieConsentBanner } from "../../src/components/legal/cookie-consent-banner";
import { GoogleAnalytics } from "../../src/components/google-analytics";

declare global {
  interface Window { consentTest: { hydrate: () => void; mounted: boolean; errors: string[] }; }
}

function Fixture() {
  React.useEffect(() => { window.consentTest.mounted = true; }, []);
  return <><CookieConsentBanner /><GoogleAnalytics /></>;
}

window.consentTest = {
  mounted: false,
  errors: [],
  hydrate() {
    hydrateRoot(document.getElementById("consent-root")!, <Fixture />, {
      onRecoverableError: error => window.consentTest.errors.push(String(error)),
    });
  },
};

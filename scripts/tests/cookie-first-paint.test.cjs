require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { COOKIE_CONSENT_NAME, COOKIE_CONSENT_VERSION, COOKIE_CONSENT_VISIBILITY_SCRIPT } = require('../../src/lib/cookie-consent.ts');
const { CookieConsentBanner } = require('../../src/components/legal/cookie-consent-banner.tsx');

test('first paint keeps choices visible for absent, stale and malformed consent', () => {
  for (const cookie of ['', `${COOKIE_CONSENT_NAME}=%ZZ`, `${COOKIE_CONSENT_NAME}=%7Bbroken`, `${COOKIE_CONSENT_NAME}=${encodeURIComponent(JSON.stringify({version:'old',analytics:true}))}`]) {
    const attributes = {};
    vm.runInNewContext(COOKIE_CONSENT_VISIBILITY_SCRIPT, { document: { cookie, documentElement: { setAttribute(key,value) { attributes[key] = value; } } } });
    assert.deepEqual(attributes, {});
  }
  const html = renderToStaticMarkup(React.createElement(CookieConsentBanner));
  assert.match(html, /data-cookie-consent-banner=""/);
  for (const label of ['Akceptuj wszystkie', 'Odrzuć opcjonalne', 'Ustawienia']) assert.ok(html.includes(label), label);
});

test('a saved current choice suppresses the SSR banner without granting consent or sending requests', () => {
  for (const analytics of [false,true]) {
    const attributes = {};
    const cookie = `another=value; ${COOKIE_CONSENT_NAME}=${encodeURIComponent(JSON.stringify({version:COOKIE_CONSENT_VERSION,analytics}))}`;
    vm.runInNewContext(COOKIE_CONSENT_VISIBILITY_SCRIPT, { document: { cookie, documentElement: { setAttribute(key,value) { attributes[key] = value; } } } });
    assert.deepEqual(attributes, {'data-saved-cookie-consent':'true'});
  }
});

require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { COOKIE_CONSENT_VERSION, hasAnalyticsConsent } = require('../../src/lib/cookie-consent.ts');

const consentCookie = (analytics, version = COOKIE_CONSENT_VERSION) =>
  `fakturo_consent=${encodeURIComponent(JSON.stringify({ version, analytics }))}`;

function browserFixture({ url = 'https://fakturaprosto.pl/', cookie = '', referrer = '', privacy = {} } = {}) {
  const originals = Object.fromEntries(['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const cookies = new Map(cookie.split(';').filter(Boolean).map(pair => {
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator).trim(), pair.slice(separator + 1)];
  }));
  const scripts = [], events = new Map(), documentEvents = new Map(), historyCalls = [];
  const document = {
    referrer,
    addEventListener(name, callback, capture = false) {
      const registered = documentEvents.get(name) || [];
      registered.push({ callback, capture }); documentEvents.set(name, registered);
    },
    removeEventListener(name, callback) { documentEvents.set(name, (documentEvents.get(name) || []).filter(item => item.callback !== callback)); },
    head: { appendChild(element) { scripts.push(element); } },
    createElement() { return { remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); } }; },
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
    set cookie(value) {
      const [pair] = value.split(';'), separator = pair.indexOf('='), name = pair.slice(0, separator);
      if (value.includes('Max-Age=0')) cookies.delete(name);
      else cookies.set(name, pair.slice(separator + 1));
    },
  };
  const window = {
    location: new URL(url),
    addEventListener(name, callback, capture = false) {
      const registered = events.get(name) || [];
      registered.push({ callback, capture }); events.set(name, registered);
    },
    removeEventListener(name, callback) { events.set(name, (events.get(name) || []).filter(item => item.callback !== callback)); },
  };
  window.history = Object.fromEntries(['pushState', 'replaceState'].map(method => [method, function (_, __, target) {
    historyCalls.push({ disabledBeforeNativeHistory: window['ga-disable-G-4P218PFSBX'], target });
    if (target != null) window.location = new URL(target, window.location.href);
  }]));
  for (const [key, value] of Object.entries({ window, document, navigator: privacy })) {
    Object.defineProperty(global, key, { configurable: true, writable: true, value });
  }
  const file = require.resolve('../../src/lib/google-analytics.ts');
  delete require.cache[file];
  const analytics = require(file);
  return {
    window, document, scripts, analytics, historyCalls,
    commands: () => (window.dataLayer || []).map(value => [...value]),
    views: () => (window.dataLayer || []).map(value => [...value]).filter(args => args[0] === 'event' && args[1] === 'page_view'),
    ctas: () => (window.dataLayer || []).map(value => [...value]).filter(args => args[0] === 'event' && ['registration_click', 'demo_click'].includes(args[1])),
    dispatch(name) { [...(events.get(name) || [])].sort((a, b) => Number(b.capture) - Number(a.capture)).forEach(({ callback }) => callback()); },
    click(href, { button = 0, defaultPrevented = false, nested = false, textNode = false, download = false, detail = 1 } = {}) {
      const link = {
        getAttribute: name => name === 'href' ? href : null,
        hasAttribute: name => name === 'download' && download,
        closest: selector => selector === 'a[href]' ? link : null,
      };
      const nestedElement = { closest: selector => selector === 'a[href]' ? link : null };
      const target = textNode ? { nodeType: 3, parentElement: nestedElement } : nested ? nestedElement : link;
      const event = { target, button, defaultPrevented, detail };
      [...(documentEvents.get('click') || [])].sort((a, b) => Number(b.capture) - Number(a.capture)).forEach(({ callback }) => callback(event));
      return event;
    },
    restore() {
      delete require.cache[file];
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key];
      }
    },
  };
}

test('GA requires a current explicit opt-in, and malformed/stale consent cannot load Google', () => {
  for (const cookie of ['', 'fakturo_consent=%ZZ', 'fakturo_consent=' + encodeURIComponent('{broken'),
    consentCookie(true, '1.1.0-2026-10-08'), consentCookie('true'), consentCookie(false)]) {
    const fixture = browserFixture({ cookie });
    try {
      assert.equal(hasAnalyticsConsent(), false);
      const stop = fixture.analytics.installGoogleAnalytics();
      assert.equal(fixture.scripts.length, 0);
      assert.equal(fixture.window.dataLayer, undefined);
      assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
      stop();
    } finally { fixture.restore(); }
  }
});

test('DNT and Global Privacy Control override an analytics opt-in', () => {
  for (const privacy of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
    const fixture = browserFixture({ cookie: consentCookie(true), privacy });
    try {
      fixture.analytics.installGoogleAnalytics();
      assert.equal(fixture.scripts.length, 0);
      assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
    } finally { fixture.restore(); }
  }
});

test('the first public page sends one sanitised view and no advertising consent', () => {
  const fixture = browserFixture({ cookie: consentCookie(true), url: 'https://fakturaprosto.pl/cennik?email=SECRET#token', referrer: 'https://example.org/private/customer?token=HIDDEN' });
  try {
    fixture.analytics.installGoogleAnalytics();
    assert.equal(fixture.scripts.length, 1);
    assert.equal(fixture.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-4P218PFSBX');
    assert.equal(fixture.scripts[0].referrerPolicy, 'origin');
    assert.deepEqual(fixture.views(), [['event', 'page_view', {
      page_location: 'https://fakturaprosto.pl/cennik', page_referrer: 'https://example.org', page_title: 'FakturaProsto',
    }]]);
    const configuration = fixture.commands().find(args => args[0] === 'config')[2];
    assert.equal(configuration.send_page_view, false);
    assert.equal(configuration.allow_google_signals, false);
    assert.equal(configuration.allow_ad_personalization_signals, false);
    assert.equal(configuration.cookie_domain, 'none');
    assert.equal(configuration.cookie_expires, 2592000);
    assert.equal(configuration.cookie_update, false);
    for (const command of fixture.commands().filter(args => args[0] === 'consent')) {
      assert.equal(command[2].ad_storage, 'denied');
      assert.equal(command[2].ad_user_data, 'denied');
      assert.equal(command[2].ad_personalization, 'denied');
    }
    assert.doesNotMatch(JSON.stringify(fixture.commands()), /SECRET|HIDDEN|email=|token/);
  } finally { fixture.restore(); }
});

test('React remounts and repeated route effects reuse the tag and deduplicate the initial view', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    const stop = fixture.analytics.installGoogleAnalytics(); stop();
    fixture.analytics.installGoogleAnalytics();
    fixture.analytics.syncGoogleAnalyticsRoute();
    fixture.scripts[0].onload();
    assert.equal(fixture.scripts.length, 1);
    assert.equal(fixture.views().length, 1);
    fixture.window.history.pushState({}, '', '/cennik?email=SECRET#fragment');
    fixture.analytics.syncGoogleAnalyticsRoute();
    assert.equal(fixture.views().length, 2);
    assert.equal(fixture.views()[1][2].page_location, 'https://fakturaprosto.pl/cennik');
    assert.doesNotMatch(JSON.stringify(fixture.commands()), /SECRET|fragment/);
  } finally { fixture.restore(); }
});

test('private destinations are disabled before history observers run and never enter the queue', () => {
  for (const method of ['pushState', 'replaceState']) {
    const fixture = browserFixture({ cookie: consentCookie(true) });
    try {
      fixture.analytics.installGoogleAnalytics();
      fixture.scripts[0].onload();
      fixture.window.history[method]({}, '', '/invoices/PRIVATE_ID?token=SECRET');
      assert.equal(fixture.historyCalls[0].disabledBeforeNativeHistory, true);
      assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
      assert.equal(fixture.views().length, 1);
      assert.doesNotMatch(JSON.stringify(fixture.commands()), /PRIVATE_ID|SECRET|invoices/);
      const latestConsent = fixture.commands().filter(args => args[0] === 'consent').at(-1);
      assert.equal(latestConsent[2].analytics_storage, 'denied');
      fixture.window.history[method]({}, '', '/');
      assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], false);
      assert.equal(fixture.views().length, 2);
    } finally { fixture.restore(); }
  }
});

test('popstate disables measurement before non-capturing Google observers', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.scripts[0].onload();
    let disabledAtObserver;
    fixture.window.addEventListener('popstate', () => { disabledAtObserver = fixture.window['ga-disable-G-4P218PFSBX']; });
    fixture.window.location = new URL('https://fakturaprosto.pl/portal/SECRET');
    fixture.dispatch('popstate');
    assert.equal(disabledAtObserver, true);
    assert.equal(fixture.views().length, 1);
    assert.doesNotMatch(JSON.stringify(fixture.commands()), /portal|SECRET/);
  } finally { fixture.restore(); }
});

test('private initial visits and unlisted paths never load the tag even with consent', () => {
  for (const path of ['/invoices/SECRET', '/login', '/auth/reset?token=SECRET', '/settings', '/portal/SECRET', '/unknown', '/cennik/PRIVATE_ID']) {
    const fixture = browserFixture({ url: 'https://fakturaprosto.pl' + path, cookie: consentCookie(true) });
    try {
      fixture.analytics.installGoogleAnalytics();
      assert.equal(fixture.scripts.length, 0, path);
      assert.equal(fixture.window.dataLayer, undefined);
    } finally { fixture.restore(); }
  }
});

test('withdrawal immediately disables Google, clears queued events and deletes only analytics cookies', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) + '; _ga=visitor; _ga_4P218PFSBX=session; essential=keep' });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.scripts[0].onload();
    fixture.document.cookie = consentCookie(false);
    fixture.dispatch('fakturo-consent-updated');
    assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
    assert.equal(fixture.commands().length, 0);
    assert.doesNotMatch(fixture.document.cookie, /_ga/);
    assert.match(fixture.document.cookie, /essential=keep/);
    fixture.window.gtag('event', 'page_view', { page_location: 'SECRET' });
    assert.equal(fixture.commands().length, 0);
    fixture.document.cookie = consentCookie(true);
    fixture.dispatch('focus');
    assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], false);
    assert.equal(fixture.scripts.length, 1);
    assert.equal(fixture.views().length, 1);
  } finally { fixture.restore(); }
});

test('withdrawal before a script finishes removes its queued views and later consent can retry', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.document.cookie = consentCookie(false);
    fixture.dispatch('focus');
    assert.equal(fixture.scripts.length, 0);
    assert.equal(fixture.commands().length, 0);
    fixture.document.cookie = consentCookie(true);
    fixture.dispatch('fakturo-consent-updated');
    assert.equal(fixture.scripts.length, 1);
    assert.equal(fixture.views().length, 1);
    assert.equal(fixture.commands().filter(args => args[0] === 'config').length, 1);
  } finally { fixture.restore(); }
});

test('a blocked script cannot break navigation and a later focus retries loading it', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    fixture.analytics.installGoogleAnalytics();
    assert.doesNotThrow(() => fixture.scripts[0].onerror());
    assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
    assert.equal(fixture.commands().length, 0);
    fixture.dispatch('focus');
    assert.equal(fixture.scripts.length, 1);
    assert.equal(fixture.views().length, 1);
  } finally { fixture.restore(); }
});

test('public CTA clicks use fixed event names and sanitized page and destination context', () => {
  const fixture = browserFixture({
    cookie: consentCookie(true),
    url: 'https://fakturaprosto.pl/cennik?email=SECRET#account',
    referrer: 'https://example.org/customer/PRIVATE_ID?token=HIDDEN',
  });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.scripts[0].onload();
    fixture.click('/register?email=SECRET&utm_source=HIDDEN#PRIVATE_ID');
    fixture.click('https://fakturaprosto.pl/demo?customer=SECRET#HIDDEN', { nested: true });
    assert.deepEqual(fixture.ctas(), [
      ['event', 'registration_click', {
        page_location: 'https://fakturaprosto.pl/cennik', page_referrer: 'https://example.org',
        page_title: 'FakturaProsto', link_url: 'https://fakturaprosto.pl/register',
      }],
      ['event', 'demo_click', {
        page_location: 'https://fakturaprosto.pl/cennik', page_referrer: 'https://example.org',
        page_title: 'FakturaProsto', link_url: 'https://fakturaprosto.pl/demo',
      }],
    ]);
    assert.equal(fixture.views().length, 1);
    assert.doesNotMatch(JSON.stringify(fixture.commands()), /SECRET|HIDDEN|PRIVATE_ID|email=|utm_source|customer=/);
  } finally { fixture.restore(); }
});

test('native keyboard and nested text activation send once, while other mouse buttons and downloads do not', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.click('/register', { detail: 0 });
    fixture.click('/demo', { textNode: true });
    for (const options of [{ button: 1 }, { button: 2 }, { defaultPrevented: true }, { download: true }]) {
      fixture.click('/register', options);
    }
    assert.deepEqual(fixture.ctas().map(args => args[1]), ['registration_click', 'demo_click']);
  } finally { fixture.restore(); }
});

test('CTA listeners survive StrictMode and overlapping mounts without duplicate events and remove on final cleanup', () => {
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    const first = fixture.analytics.installGoogleAnalytics(); first();
    const second = fixture.analytics.installGoogleAnalytics();
    const third = fixture.analytics.installGoogleAnalytics();
    fixture.click('/register');
    assert.equal(fixture.ctas().length, 1);
    second();
    fixture.click('/demo');
    assert.equal(fixture.ctas().length, 2);
    third();
    fixture.click('/register');
    assert.equal(fixture.ctas().length, 2);
    assert.equal(fixture.scripts.length, 1);
  } finally { fixture.restore(); }
});

test('CTA registration is recorded before a Next transition suspends measurement on the private registration screen', () => {
  const fixture = browserFixture({ cookie: consentCookie(true), url: 'https://fakturaprosto.pl/cennik' });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.scripts[0].onload();
    fixture.click('/register?plan=SECRET');
    assert.equal(fixture.ctas().length, 1);
    fixture.window.history.pushState({}, '', '/register?plan=SECRET');
    assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
    assert.equal(fixture.ctas().length, 1);
    assert.equal(fixture.ctas()[0][2].page_location, 'https://fakturaprosto.pl/cennik');
    assert.doesNotMatch(JSON.stringify(fixture.commands()), /SECRET/);
  } finally { fixture.restore(); }
});

test('external, unsafe, similar and fragment-only links never qualify as public CTAs', () => {
  const fixture = browserFixture({ cookie: consentCookie(true), url: 'https://fakturaprosto.pl/demo' });
  try {
    fixture.analytics.installGoogleAnalytics();
    for (const href of [
      'https://evil.example/register', '//evil.example/demo', 'https://fakturaprosto.pl.evil.example/register',
      'https://user:SECRET@fakturaprosto.pl/register', 'javascript:alert("/register")', 'data:text/html,/demo',
      'mailto:person@example.org', '/register/PRIVATE_ID', '/register/', '/registration', '/demo/private',
      '/demos', '#register', '', null,
    ]) fixture.click(href);
    assert.deepEqual(fixture.ctas(), []);
  } finally { fixture.restore(); }
});

test('CTA clicks cannot initialize Google with missing, declined, stale or revoked consent', () => {
  for (const cookie of ['', consentCookie(false), consentCookie(true, '1.1.0-2026-10-08')]) {
    const fixture = browserFixture({ cookie });
    try {
      fixture.analytics.installGoogleAnalytics();
      fixture.click('/register'); fixture.click('/demo');
      assert.deepEqual(fixture.ctas(), []);
      assert.equal(fixture.scripts.length, 0);
    } finally { fixture.restore(); }
  }
  const fixture = browserFixture({ cookie: consentCookie(true) });
  try {
    fixture.analytics.installGoogleAnalytics();
    fixture.scripts[0].onload();
    // Recheck the actual cookie even if the preferences event has not fired yet.
    fixture.document.cookie = consentCookie(false);
    fixture.click('/register'); fixture.click('/demo');
    assert.deepEqual(fixture.ctas(), []);
    assert.equal(fixture.window['ga-disable-G-4P218PFSBX'], true);
  } finally { fixture.restore(); }
});

test('private sources and browser privacy choices cannot send CTA events', () => {
  for (const url of ['https://fakturaprosto.pl/register', 'https://fakturaprosto.pl/invoices/SECRET', 'https://fakturaprosto.pl/portal/TOKEN']) {
    const fixture = browserFixture({ cookie: consentCookie(true), url });
    try {
      fixture.analytics.installGoogleAnalytics();
      fixture.click('/register'); fixture.click('/demo');
      assert.deepEqual(fixture.ctas(), []);
      assert.equal(fixture.scripts.length, 0);
    } finally { fixture.restore(); }
  }
  for (const privacy of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
    const fixture = browserFixture({ cookie: consentCookie(true), privacy });
    try {
      fixture.analytics.installGoogleAnalytics();
      fixture.click('/register'); fixture.click('/demo');
      assert.deepEqual(fixture.ctas(), []);
      assert.equal(fixture.scripts.length, 0);
    } finally { fixture.restore(); }
  }
});

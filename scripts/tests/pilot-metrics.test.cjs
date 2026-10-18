require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { issuePilotCookie, pilotIdentity, hasPilotConsent, normalisePilotVital, PILOT_RETENTION_MS, PILOT_CONSENT_VERSION } = require('../../src/lib/pilot-metrics.ts');
const { POST, DELETE } = require('../../src/app/api/pilot/events/route.ts');

test('pilot cookies are signed, short-lived and never expose the browser token as a stored identifier', () => {
  const secret = 'p'.repeat(32), now = Date.now(), cookie = issuePilotCookie(secret, now);
  const identity = pilotIdentity(cookie, secret, now);
  assert.ok(identity); assert.equal(identity.expiresAt.getTime(), now + PILOT_RETENTION_MS);
  assert.match(identity.visitor, /^[a-f0-9]{64}$/);
  assert.ok(!identity.visitor.includes(cookie.split('.')[0]));
  assert.equal(pilotIdentity(cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'), secret, now), null);
  assert.equal(pilotIdentity(cookie, secret, now + PILOT_RETENTION_MS), null);
  assert.equal(pilotIdentity(cookie, 'short', now), null);
  assert.equal(pilotIdentity(issuePilotCookie(secret, now + 120000), secret, now), null);
});
test('pilot metrics require a current explicit analytics opt-in', () => {
  const request = prefs => new Request('https://example.test/api/pilot/events', { headers: { cookie: `fakturo_consent=${encodeURIComponent(JSON.stringify(prefs))}` } });
  assert.equal(hasPilotConsent(request({ version: PILOT_CONSENT_VERSION, analytics: true })), true);
  assert.equal(hasPilotConsent(request({ version: '1.0.0-2026-09-13', analytics: true })), false);
  assert.equal(hasPilotConsent(request({ version: PILOT_CONSENT_VERSION, analytics: false })), false);
  assert.equal(hasPilotConsent(request({ version: PILOT_CONSENT_VERSION, analytics: 'true' })), false);
  assert.equal(hasPilotConsent(new Request('https://example.test')), false);
  for (const headers of [{ dnt: '1' }, { dnt: 'yes' }, { 'sec-gpc': '1' }]) {
    const req = request({ version: PILOT_CONSENT_VERSION, analytics: true });
    for (const [name, value] of Object.entries(headers)) req.headers.set(name, value);
    assert.equal(hasPilotConsent(req), false, 'Browser privacy signals override optional measurement consent');
  }
});

test('a browser cannot submit a business outcome to the public collection endpoint', async () => {
  const prior = { secret: process.env.PILOT_METRICS_SECRET, database: process.env.DATABASE_URL };
  process.env.PILOT_METRICS_SECRET = 'isolated-unit-metrics-secret-32-chars';
  process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/fakturo_metrics_test';
  const cookie = `fakturo_consent=${encodeURIComponent(JSON.stringify({ version: PILOT_CONSENT_VERSION, analytics: true }))}`;
  try {
    for (const event of ['register', 'first_invoice', 'ksef', 'pro']) {
      const res = await POST(new Request('https://example.test/api/pilot/events', {
        method: 'POST', headers: { cookie, origin: 'https://example.test' }, body: JSON.stringify({ event }),
      }));
      assert.equal(res.status, 400); assert.equal(res.headers.get('set-cookie'), null);
    }
  } finally {
    if (prior.secret === undefined) delete process.env.PILOT_METRICS_SECRET; else process.env.PILOT_METRICS_SECRET = prior.secret;
    if (prior.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prior.database;
  }
});

test('withdrawal retries after reconnect and cannot leave failed deletion treated as complete', async () => {
  const previous = Object.fromEntries(['window', 'document', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const file = require.resolve('../../src/lib/pilot-client.ts');
  const events = new EventTarget(); let calls = 0;
  try {
    Object.defineProperty(global, 'window', { configurable: true, value: events });
    Object.defineProperty(global, 'document', { configurable: true, value: {
      cookie: `fakturo_consent=${encodeURIComponent(JSON.stringify({ version: PILOT_CONSENT_VERSION, analytics: false }))}`,
    } });
    global.fetch = async (_url, init) => {
      assert.equal(init.method, 'DELETE'); assert.ok(init.signal);
      return new Response(null, { status: ++calls === 1 ? 503 : 204 });
    };
    delete require.cache[file];
    const stop = require(file).installPilotMetrics();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
    events.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    stop(); events.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2, 'The listener is removed on unmount');
  } finally {
    delete require.cache[file];
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key];
    }
  }
});

test('empty performance groups stay explicitly insufficient and quantiles do not mutate source samples', async () => {
  const { pilotFieldVitals, pilotFunnelSummary } = await import('../ops/pilot-report-core.mjs');
  const values = Array.from({ length: 200 }, (_, index) => 199 - index);
  const rows = pilotFieldVitals(new Map([['app:desktop:LCP', values]]));
  assert.equal(rows.length, 16);
  const lcp = rows.find(row => row.pageClass === 'app' && row.device === 'desktop' && row.metric === 'LCP');
  assert.equal(lcp.p75, 149); assert.equal(lcp.gate, 'passed'); assert.equal(values[0], 199);
  assert.equal(rows.filter(row => row.samples === 0 && row.p75 === null && row.gate === 'insufficient_samples').length, 15);
  const empty = pilotFunnelSummary();
  assert.equal(empty.activationRate, null); assert.equal(empty.activationTime.mean, null);
  assert.ok(empty.steps.every(step => step.conversionRate === null));
});

test('document vitals retain the original coarse class after SPA navigation and never include URL fields', () => {
  const previous = Object.fromEntries(['window', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  try {
    const browser = { location: new URL('https://example.test/invoices/private-id?token=private-token'), matchMedia: () => ({ matches: true }) };
    Object.defineProperty(global, 'window', { configurable: true, value: browser });
    Object.defineProperty(global, 'performance', { configurable: true, value: {
      getEntriesByType: () => [{ name: 'https://example.test/?campaign=private-parameter' }],
    } });
    const { pilotDocumentContext } = require('../../src/lib/pilot-client.ts');
    assert.deepEqual(pilotDocumentContext(), { pageClass: 'public', device: 'mobile' });
    global.performance.getEntriesByType = () => [{ name: 'https://example.test/invoices/private-id?token=private-token' }];
    browser.location = new URL('https://example.test/');
    assert.deepEqual(pilotDocumentContext(), { pageClass: 'app', device: 'mobile' });
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key];
    }
  }
});
test('vitals schema rejects financial fields, paths, invalid IDs and unbounded numbers', () => {
  const body = { metric: 'LCP', metricId: 'v5-177777-12345', value: 999.4, pageClass: 'public', device: 'mobile' };
  assert.equal(normalisePilotVital(body).value, 999);
  for (const change of [{ url: '/invoices/private' }, { email: 'person@example.test' }, { metricId: '../secret' }, { metricId: 'x'.repeat(81) },
    { metric: 'FID' }, { value: -1 }, { value: Infinity }, { value: 120001 }, { pageClass: '/invoices' }, { device: 'iPhone' }]) assert.equal(normalisePilotVital({ ...body, ...change }), null);
  assert.equal(normalisePilotVital({ ...body, metric: 'CLS', value: 0.00019 }).value, 0.00019);
  assert.ok(normalisePilotVital({ ...body, metric: 'CLS', value: 0.00000001 }).value > 0, 'A positive shift must never be rounded to a false zero');
  assert.equal(normalisePilotVital({ ...body, metric: 'CLS', value: 101 }), null);
});
test('disabled metrics do not create cookies and cross-origin mutations are rejected', async () => {
  const prior = process.env.PILOT_METRICS_SECRET; delete process.env.PILOT_METRICS_SECRET;
  try {
    const req = new Request('https://example.test/api/pilot/events', { method: 'POST', body: '{"event":"visit"}' });
    const res = await POST(req); assert.equal(res.status, 204); assert.equal(res.headers.get('set-cookie'), null);
    const cross = new Request('https://example.test/api/pilot/events', { method: 'DELETE', headers: { origin: 'https://attacker.test' } });
    assert.equal((await DELETE(cross)).status, 403);
  } finally { if (prior === undefined) delete process.env.PILOT_METRICS_SECRET; else process.env.PILOT_METRICS_SECRET = prior; }
});

test('field vitals wait for the visit response and withdrawal suppresses an in-flight sample', async () => {
  const previous = { fetch: global.fetch, document: global.document };
  const file = require.resolve('../../src/lib/pilot-client.ts');
  try {
    delete require.cache[file];
    const cookie = analytics => `fakturo_consent=${encodeURIComponent(JSON.stringify({ version: PILOT_CONSENT_VERSION, analytics }))}`;
    global.document = { cookie: cookie(true) };
    const calls = []; let completeVisit;
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/events') && init.method === 'POST') return new Promise(resolve => { completeVisit = resolve; });
      return new Response(null, { status: 204 });
    };
    const { sendPilotVital } = require(file);
    const pending = sendPilotVital({ metric: 'LCP', metricId: 'v5-page', value: 900, pageClass: 'public', device: 'mobile' });
    await Promise.resolve(); assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/events'));
    global.document.cookie = cookie(false);
    completeVisit(new Response(null, { status: 204 })); await pending;
    assert.ok(calls.some(call => call.init.method === 'DELETE'));
    assert.ok(!calls.some(call => call.url.endsWith('/vitals')));
  } finally { global.fetch = previous.fetch; global.document = previous.document; delete require.cache[file]; }
});

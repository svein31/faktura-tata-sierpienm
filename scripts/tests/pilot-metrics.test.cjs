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

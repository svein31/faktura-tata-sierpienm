const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('../register-ts.cjs');
const { checkVies } = require('../../src/lib/vies.ts');

const routePath = require.resolve('../../src/app/api/vies/check/route.ts');
const limiterPath = require.resolve('../../src/lib/rate-limit.ts');
const soap = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><checkVatResponse><requestDate>2026-10-09</requestDate><valid>true</valid></checkVatResponse></soap:Body></soap:Envelope>';

function fixture(t) {
  const originalEnvironment = { DATABASE_URL: process.env.DATABASE_URL, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const originalClient = globalThis.authRateLimitClient;
  const originalRoute = require.cache[routePath], originalLimiter = require.cache[limiterPath];
  const counters = new Map(), quotaCalls = [], providerCalls = [], timeouts = [];
  const state = { user: { id: 'authenticated-user' }, connections: 0, counterError: null, missingCounter: false };
  process.env.DATABASE_URL = 'mongodb://vies-quota.invalid/unit-test';
  process.env.NEXTAUTH_SECRET = 'vies-quota-unit-test-secret';
  delete globalThis.authRateLimitClient;
  t.mock.method(Date, 'now', () => 1_791_547_220_000);
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  });
  t.after(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (originalClient === undefined) delete globalThis.authRateLimitClient;
    else globalThis.authRateLimitClient = originalClient;
    for (const [path, cached] of [[routePath, originalRoute], [limiterPath, originalLimiter]]) {
      if (cached === undefined) delete require.cache[path];
      else require.cache[path] = cached;
    }
  });

  class StubMongoClient {
    async connect() { state.connections++; return this; }
    db() {
      return { collection: name => {
        assert.equal(name, 'AuthRateLimit');
        return { findOneAndUpdate: async (filter, update, options) => {
          if (state.counterError) throw state.counterError;
          if (state.missingCounter) return null;
          assert.equal(options.upsert, true);
          assert.equal(options.returnDocument, 'after');
          const bucket = counters.get(filter._id) || { _id: filter._id, hits: 0, ...update.$setOnInsert };
          // Update before yielding, as an atomic counter would, and return this attempt's snapshot.
          bucket.hits += update.$inc.hits;
          counters.set(filter._id, bucket);
          return { ...bucket };
        } };
      } };
    }
  }

  const provider = async (url, options) => {
    providerCalls.push({ url, options });
    return new Response(soap, { status: 200 });
  };
  function loadHandler() {
    const originalLoad = Module._load;
    delete require.cache[routePath];
    delete require.cache[limiterPath];
    Module._load = function(request, parent, isMain) {
      if (request === 'mongodb') return { MongoClient: StubMongoClient };
      if (request === '@/lib/auth') return { getSessionUser: async () => state.user };
      if (request === '@/lib/vies') return { checkVies: (vat, country) => checkVies(vat, country, provider) };
      if (request === '@/lib/rate-limit') {
        const limiter = require(limiterPath);
        return { ...limiter, rateLimitSubject: async (...args) => {
          quotaCalls.push(args);
          return limiter.rateLimitSubject(...args);
        } };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try { return require(routePath).GET; }
    finally { Module._load = originalLoad; }
  }
  const request = (ip = '192.0.2.1', query = 'vat=DE123456789&country=DE') => new Request(`https://example.test/api/vies/check?${query}`, {
    headers: { 'x-forwarded-for': ip, 'x-real-ip': ip, 'x-nf-client-connection-ip': ip },
  });
  return { state, counters, quotaCalls, providerCalls, timeouts, loadHandler, request };
}

test('VIES shares one user quota across changing IPs and independently loaded handlers and clients', async t => {
  const value = fixture(t);
  const first = value.loadHandler();
  for (let attempt = 0; attempt < 8; attempt++) {
    assert.equal((await first(value.request(`192.0.2.${attempt + 1}`))).status, 200);
  }
  // A fresh handler and client retain only the shared counter, as another worker would.
  delete globalThis.authRateLimitClient;
  const second = value.loadHandler();
  for (let attempt = 8; attempt < 15; attempt++) {
    assert.equal((await second(value.request(`198.51.100.${attempt + 1}`))).status, 200);
  }
  const blocked = await second(value.request('203.0.113.99'));
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).source, undefined);
  assert.equal(value.providerCalls.length, 15);
  assert.equal(value.state.connections, 2);
  assert.equal(value.counters.size, 1);
  assert.equal([...value.counters.values()][0].hits, 16);
  assert.equal(value.quotaCalls.length, 16);
  for (const call of value.quotaCalls) assert.deepEqual(call, ['authenticated-user', { windowMs: 60_000, max: 15 }, 'vies-user']);
  assert.deepEqual(value.timeouts, Array(15).fill(9000));
  for (const call of value.providerCalls) {
    assert.equal(call.url, 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.signal.aborted, false);
  }
});

test('VIES admits at most fifteen concurrent independent requests for one authenticated user', async t => {
  const value = fixture(t), GET = value.loadHandler();
  const responses = await Promise.all(Array.from({ length: 16 }, (_, index) => GET(value.request(`192.0.2.${index + 1}`))));
  assert.equal(responses.filter(response => response.status === 200).length, 15);
  assert.equal(responses.filter(response => response.status === 429).length, 1);
  assert.equal(value.providerCalls.length, 15);
  assert.equal(value.counters.size, 1);
});

test('VIES users sharing an IP receive independent quotas', async t => {
  const value = fixture(t), GET = value.loadHandler();
  for (let attempt = 0; attempt < 15; attempt++) assert.equal((await GET(value.request())).status, 200);
  assert.equal((await GET(value.request())).status, 429);
  value.state.user = { id: 'another-authenticated-user' };
  const response = await GET(value.request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).valid, true);
  assert.equal(value.counters.size, 2);
  assert.equal(value.providerCalls.length, 16);
});

test('VIES fails closed without calling the provider if its shared counter errors or is not recorded', async t => {
  const value = fixture(t), GET = value.loadHandler();
  t.mock.method(console, 'error', () => {});
  value.state.counterError = new Error('Stub counter unavailable');
  const failed = await GET(value.request());
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).code, 'INTERNAL');
  value.state.counterError = null;
  value.state.missingCounter = true;
  const missing = await GET(value.request());
  assert.equal(missing.status, 500);
  assert.equal((await missing.json()).code, 'INTERNAL');
  assert.equal(value.providerCalls.length, 0);
  assert.equal(value.quotaCalls.length, 2);
  assert.equal(value.counters.size, 0);
});

test('VIES rejects unauthenticated requests before validation, quota or provider access', async t => {
  const value = fixture(t), GET = value.loadHandler();
  value.state.user = null;
  const response = await GET(value.request('192.0.2.1', 'vat=invalid&country=invalid'));
  assert.equal(response.status, 401);
  assert.equal(value.state.connections, 0);
  assert.equal(value.quotaCalls.length, 0);
  assert.equal(value.providerCalls.length, 0);
});

test('VIES preserves request validation before spending quota or calling the provider', async t => {
  const value = fixture(t), GET = value.loadHandler();
  for (const query of ['vat=DE123456789&country=invalid', `vat=${'1'.repeat(25)}&country=DE`]) {
    assert.equal((await GET(value.request('192.0.2.1', query))).status, 400);
  }
  assert.equal(value.state.connections, 0);
  assert.equal(value.quotaCalls.length, 0);
  assert.equal(value.providerCalls.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const ts = require('typescript');
require('../register-ts.cjs');
const { ApiError } = require('../../src/lib/api.ts');

const routePath = require.resolve('../../src/app/api/documents/[id]/safety/route.ts');
const limiterPath = require.resolve('../../src/lib/rate-limit.ts');

// Exact route captured before changing its authenticated quota subject.
const originalRouteSource = `import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, assertObjectId, handleApiError, json } from "@/lib/api";
import { inboxAccess } from "@/lib/document-inbox";
import { ensureDocumentSafety } from "@/lib/document-safety";
import { rateLimitShared } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; assertObjectId(id);
    const doc = await prisma.expenseScan.findUnique({ where: { id } }); if (!doc) throw new ApiError(404, "Nie znaleziono dokumentu.");
    await inboxAccess(user.id, doc.companyId, true);
    if (!(await rateLimitShared(req, { max: 20, windowMs: 60000 }, "document-scan:" + user.id)).allowed) throw new ApiError(429, "Zbyt wiele skanowań. Spróbuj później.");
    await ensureDocumentSafety(doc, true);
    return json({ safety: await prisma.expenseScan.findUnique({ where: { id }, select: { safetyStatus: true, safetyReason: true, safetyCheckedAt: true } }) });
  } catch (e) { return handleApiError(e); }
}
`;
assert.equal(createHash('sha256').update(originalRouteSource).digest('hex'), '9e39946ec19fb02b3483f6b634b5300bd6b2452c5916205f529faeecff3e1b3a');

function fixture(t) {
  const originalEnvironment = { DATABASE_URL: process.env.DATABASE_URL, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const originalClient = globalThis.authRateLimitClient;
  const originalLimiter = require.cache[limiterPath];
  const counters = new Map(), quotaCalls = [], accessCalls = [], safetyCalls = [], documentReads = [];
  const record = { id: 'a'.repeat(24), companyId: 'b'.repeat(24), imageData: 'data:application/pdf;base64,c3ludGhldGlj', safetyStatus: 'unverified', safetyReason: 'before scan', safetyCheckedAt: null };
  const state = { user: { id: 'c'.repeat(24) }, connections: 0, counterError: null, missingCounter: false, missingDocument: false, accessError: null, safetyError: null };
  process.env.DATABASE_URL = 'mongodb://document-scan-quota.invalid/unit-test';
  process.env.NEXTAUTH_SECRET = 'document-scan-quota-unit-test-secret';
  delete globalThis.authRateLimitClient;
  t.mock.method(Date, 'now', () => 1_791_547_220_000);
  t.after(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (originalClient === undefined) delete globalThis.authRateLimitClient;
    else globalThis.authRateLimitClient = originalClient;
    if (originalLimiter === undefined) delete require.cache[limiterPath];
    else require.cache[limiterPath] = originalLimiter;
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
          assert.equal(update.$inc.hits, 1);
          assert.match(filter._id, /^[a-f0-9]{64}$/);
          const bucket = counters.get(filter._id) || { _id: filter._id, hits: 0, ...update.$setOnInsert };
          // Atomic update before yielding, with this attempt's returned snapshot.
          bucket.hits += update.$inc.hits;
          counters.set(filter._id, bucket);
          return { ...bucket };
        } };
      } };
    }
  }
  const prisma = { expenseScan: { findUnique: async query => {
    documentReads.push(query);
    assert.equal(query.where.id, record.id);
    if (state.missingDocument) return null;
    if (query.select) {
      assert.deepEqual(query.select, { safetyStatus: true, safetyReason: true, safetyCheckedAt: true });
      return { safetyStatus: record.safetyStatus, safetyReason: record.safetyReason, safetyCheckedAt: record.safetyCheckedAt };
    }
    return { ...record };
  } } };

  function loadHandler(source = fs.readFileSync(routePath, 'utf8')) {
    const originalLoad = Module._load;
    delete require.cache[limiterPath];
    Module._load = function(request, parent, isMain) {
      if (request === 'mongodb') return { MongoClient: StubMongoClient };
      if (request === '@/lib/auth') return { getSessionUser: async () => state.user };
      if (request === '@/lib/db') return { prisma };
      if (request === '@/lib/document-inbox') return { inboxAccess: async (...args) => {
        accessCalls.push(args);
        if (state.accessError) throw state.accessError;
      } };
      if (request === '@/lib/document-safety') return { ensureDocumentSafety: async (...args) => {
        safetyCalls.push(args);
        assert.equal(args[0].id, record.id);
        assert.equal(args[1], true);
        if (state.safetyError) throw state.safetyError;
        // The route must return the post-scan server state, not its original row.
        record.safetyStatus = 'clean';
        record.safetyReason = null;
        record.safetyCheckedAt = new Date('2026-10-10T00:00:00Z');
      } };
      if (request === '@/lib/rate-limit') {
        const limiter = require(limiterPath);
        return Object.fromEntries(Object.entries(limiter).map(([name, value]) => [name,
          name === 'rateLimitShared' || name === 'rateLimitSubject' ? async (...args) => {
            quotaCalls.push({ name, args });
            return value(...args);
          } : value]));
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const loaded = new Module(routePath, module);
      loaded.filename = routePath;
      loaded.paths = Module._nodeModulePaths(path.dirname(routePath));
      loaded._compile(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText, routePath);
      return loaded.exports.POST;
    } finally { Module._load = originalLoad; }
  }
  const request = (ip = '192.0.2.1') => new Request(`https://example.test/api/documents/${record.id}/safety`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'x-real-ip': ip, 'x-nf-client-connection-ip': ip },
  });
  const context = id => ({ params: Promise.resolve({ id: id ?? record.id }) });
  return { state, record, counters, quotaCalls, accessCalls, safetyCalls, documentReads, loadHandler, request, context };
}

test('the exact old document-scan route permits forty scans for one actor by changing trusted client IP', async t => {
  const f = fixture(t), POST = f.loadHandler(originalRouteSource);
  for (let index = 0; index < 40; index++) assert.equal((await POST(f.request(`192.0.2.${index + 1}`), f.context())).status, 200);
  assert.equal(f.safetyCalls.length, 40);
  assert.equal(f.counters.size, 40);
  for (const bucket of f.counters.values()) assert.equal(bucket.hits, 1);
  assert.equal(f.quotaCalls.length, 40);
  assert.ok(f.quotaCalls.every(call => call.name === 'rateLimitShared'));
});

test('the exact old document-scan route still blocks the twenty-first request from a single trusted IP', async t => {
  const f = fixture(t), POST = f.loadHandler(originalRouteSource);
  for (let index = 0; index < 20; index++) assert.equal((await POST(f.request(), f.context())).status, 200);
  assert.equal((await POST(f.request(), f.context())).status, 429);
  assert.equal(f.safetyCalls.length, 20);
  assert.equal(f.counters.size, 1);
  assert.equal([...f.counters.values()][0].hits, 21);
});

test('document scans share twenty requests per actor across rotating IPs, fresh handlers and shared clients', async t => {
  const f = fixture(t), first = f.loadHandler();
  for (let index = 0; index < 10; index++) assert.equal((await first(f.request(`192.0.2.${index + 1}`), f.context())).status, 200);
  delete globalThis.authRateLimitClient;
  const second = f.loadHandler();
  for (let index = 10; index < 20; index++) assert.equal((await second(f.request(`198.51.100.${index + 1}`), f.context())).status, 200);
  const blocked = await second(f.request('203.0.113.21'), f.context());
  assert.equal(blocked.status, 429);
  assert.equal(f.safetyCalls.length, 20);
  assert.equal(f.state.connections, 2);
  assert.equal(f.counters.size, 1);
  assert.equal([...f.counters.values()][0].hits, 21);
  assert.equal(f.quotaCalls.length, 21);
  for (const call of f.quotaCalls) assert.deepEqual(call, { name: 'rateLimitSubject', args: [f.state.user.id, { max: 20, windowMs: 60000 }, 'document-scan-user'] });
  for (const call of f.accessCalls) assert.deepEqual(call, [f.state.user.id, f.record.companyId, true]);
});

test('document scans admit at most twenty concurrent calls for one actor using the shared atomic counter', async t => {
  const f = fixture(t), POST = f.loadHandler();
  const responses = await Promise.all(Array.from({ length: 21 }, (_, index) => POST(f.request(`192.0.2.${index + 1}`), f.context())));
  assert.equal(responses.filter(response => response.status === 200).length, 20);
  assert.equal(responses.filter(response => response.status === 429).length, 1);
  assert.equal(f.safetyCalls.length, 20);
  assert.equal(f.counters.size, 1);
});

test('different document-scan actors sharing an IP retain independent twenty-request quotas', async t => {
  const f = fixture(t), POST = f.loadHandler();
  for (let index = 0; index < 20; index++) assert.equal((await POST(f.request(), f.context())).status, 200);
  assert.equal((await POST(f.request(), f.context())).status, 429);
  f.state.user = { id: 'd'.repeat(24) };
  assert.equal((await POST(f.request(), f.context())).status, 200);
  assert.equal(f.counters.size, 2);
  assert.equal(f.safetyCalls.length, 21);
});

test('document scans fail closed without safety work when the shared counter errors or records no bucket', async t => {
  const f = fixture(t), POST = f.loadHandler();
  t.mock.method(console, 'error', () => {});
  f.state.counterError = new Error('Synthetic counter unavailable');
  const failed = await POST(f.request(), f.context());
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).code, 'INTERNAL');
  f.state.counterError = null;
  f.state.missingCounter = true;
  const missing = await POST(f.request('198.51.100.2'), f.context());
  assert.equal(missing.status, 500);
  assert.equal((await missing.json()).code, 'INTERNAL');
  assert.equal(f.safetyCalls.length, 0);
  assert.equal(f.counters.size, 0);
  assert.equal(f.quotaCalls.length, 2);
});

test('document scans preserve authentication, identifier validation, document lookup and inbox authorization before quota', async t => {
  const f = fixture(t), POST = f.loadHandler();
  f.state.user = null;
  assert.equal((await POST(f.request(), f.context('invalid'))).status, 401);
  f.state.user = { id: 'c'.repeat(24) };
  assert.equal((await POST(f.request(), f.context('invalid'))).status, 400);
  assert.equal(f.documentReads.length, 0);
  f.state.missingDocument = true;
  assert.equal((await POST(f.request(), f.context())).status, 404);
  assert.equal(f.accessCalls.length, 0);
  f.state.missingDocument = false;
  f.state.accessError = new ApiError(403, 'Synthetic inbox access denied');
  assert.equal((await POST(f.request(), f.context())).status, 403);
  assert.equal(f.accessCalls.length, 1);
  assert.equal(f.state.connections, 0);
  assert.equal(f.quotaCalls.length, 0);
  assert.equal(f.safetyCalls.length, 0);
});

test('document scans preserve forced server safety checks and return the persisted verdict', async t => {
  const f = fixture(t), POST = f.loadHandler();
  const response = await POST(f.request(), f.context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { safety: { safetyStatus: 'clean', safetyReason: null, safetyCheckedAt: '2026-10-10T00:00:00.000Z' } });
  assert.equal(f.safetyCalls.length, 1);
  assert.equal(f.safetyCalls[0][0].safetyStatus, 'unverified');
  assert.equal(f.safetyCalls[0][1], true);
  assert.equal(f.documentReads.length, 2);
});

test('document scans preserve quarantine responses after consuming the scan attempt', async t => {
  const f = fixture(t), POST = f.loadHandler();
  f.state.safetyError = new ApiError(423, 'Synthetic quarantine', 'DOCUMENT_QUARANTINED');
  const response = await POST(f.request(), f.context());
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'DOCUMENT_QUARANTINED');
  assert.equal(f.quotaCalls.length, 1);
  assert.equal(f.safetyCalls.length, 1);
  assert.equal(f.safetyCalls[0][1], true);
  assert.equal(f.documentReads.length, 1);
});

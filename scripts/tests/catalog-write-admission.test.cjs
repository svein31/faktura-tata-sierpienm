require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), recordId = 'c'.repeat(24);
const ownerId = 'd'.repeat(24), memberId = 'e'.repeat(24), otherCompanyId = 'f'.repeat(24);
function accessRow(permission = true) {
  return { company: { id: companyId, userId: ownerId, companyName: 'Synthetic catalog', nip: '5261040828' },
    members: [{ id: memberId, role: 'employee', canIssueInvoices: permission }], policies: [], mfaEnabled: false };
}

// Real route, parsers, catalog preflight, company access reader and write fence;
// only session identity, database delegates, DTO conversion and audit storage
// are synthetic. Each fixture has its own application module graph.
function application(routeFile, replacements) {
  const cache = new Map();
  const load = filename => {
    if (replacements.has(filename)) return replacements.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    mod.require = request => {
      if (request === 'server-only') return {};
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        const resolved = require.resolve(base);
        return resolved.startsWith(path.join(root, 'src') + path.sep) && /\.tsx?$/.test(resolved) ? load(resolved) : require(resolved);
      }
      return require(request);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
    return mod.exports;
  };
  return load(path.join(root, routeFile));
}
function fixture(kind, method, { revoked = false, personal = false, currentRole = 'owner', changedOwner = false, changedCompany = false } = {}) {
  const model = kind === 'contractors' ? 'contractor' : 'product';
  const events = [], catalogWrites = [], auditWrites = [], fenceWrites = [];
  const existing = { id: recordId, userId: personal ? userId : ownerId, companyId: personal ? null : companyId,
    name: 'Synthetic old record', nip: '5261040828', netPrice: 100, vatRate: '23' };
  const current = { ...existing, ...(changedOwner ? { userId: ownerId } : {}), ...(changedCompany ? { companyId: otherCompanyId } : {}) };
  const mutate = (operation, args) => { events.push(`catalog:${operation}`); catalogWrites.push({ operation, args }); return { ...current, ...args.data }; };
  const tx = {
    user: { findUnique: async args => { assert.deepEqual(args, { where: { id: userId }, select: { role: true } }); events.push('actor:role'); return { role: currentRole }; } },
    companyProfile: {
      aggregateRaw: async ({ pipeline }) => {
        events.push('access:transaction');
        assert.equal(pipeline[0].$match._id.$oid, changedCompany ? otherCompanyId : companyId, 'Authorization uses the current record company');
        return changedCompany ? [] : [accessRow(!revoked)];
      },
      findUnique: async () => { events.push('fence:timestamp'); return { updatedAt: new Date('2026-01-01T00:00:00.000Z') }; },
      update: async args => { events.push('fence:write'); fenceWrites.push(args); return { id: companyId }; },
    },
    [model]: {
      findUnique: async args => { assert.deepEqual(args, { where: { id: recordId } }); events.push('catalog:read'); return current; },
      create: async args => mutate('create', args), update: async args => mutate('update', args), delete: async args => mutate('delete', args),
    },
  };
  const db = {
    companyProfile: { aggregateRaw: async () => { events.push('access:preflight'); return [accessRow()]; } },
    [model]: { findUnique: async () => existing }, invoice: { count: async () => 0 },
    $transaction: async callback => { events.push('transaction:start'); return callback(tx); },
  };
  const replacement = (name, value) => [path.join(root, 'src/lib', name), value];
  const replacements = new Map([
    replacement('db.ts', { prisma: db }),
    replacement('auth.ts', { getSessionUser: async () => ({ id: userId, role: 'owner', name: 'Synthetic actor', email: 'synthetic@example.invalid' }) }),
    replacement('dto.ts', { contractorToDto: value => value, productToDto: value => value }),
    replacement('audit.ts', { recordAuditLog: async args => { assert.equal(args.client, tx); events.push('audit:write'); auditWrites.push(args); }, buildFieldDiff: () => ({ diff: {} }) }),
  ]);
  const route = application(`src/app/api/${kind}/${method === 'POST' ? '' : '[id]/'}route.ts`, replacements);
  const body = kind === 'contractors' ? { name: 'Synthetic catalog record', nip: '5261040828' } : { name: 'Synthetic catalog record', netPrice: 100, vatRate: '23' };
  const call = async () => route[method](new Request('http://127.0.0.1/api/synthetic', { method,
    ...(method === 'DELETE' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, companyId: personal ? null : companyId }) }),
  }), { params: Promise.resolve({ id: recordId }) });
  return { call, events, catalogWrites, auditWrites, fenceWrites };
}
function assertNoWrites(f) {
  assert.deepEqual(f.catalogWrites, []); assert.deepEqual(f.auditWrites, []); assert.deepEqual(f.fenceWrites, []);
}
for (const kind of ['contractors', 'products']) {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    test(`${kind} ${method}: company issuance permission revoked after allowed preflight prevents catalog and audit writes`, async () => {
      const f = fixture(kind, method, { revoked: true }); const response = await f.call();
      assert.equal(response.status, 403, JSON.stringify(await response.json())); assertNoWrites(f);
      assert.deepEqual(f.events, ['access:preflight', 'transaction:start', ...(method === 'POST' ? [] : ['catalog:read']), 'access:transaction']);
    });
    test(`${kind} ${method}: allowed company write fences the transaction and preserves actor ownership fields`, async () => {
      const f = fixture(kind, method); const response = await f.call(); const body = await response.json();
      assert.equal(response.status, method === 'POST' ? 201 : 200, JSON.stringify(body));
      assert.equal(f.catalogWrites.length, 1); assert.equal(f.auditWrites.length, 1); assert.equal(f.fenceWrites.length, 1);
      assert.ok(f.events.indexOf('fence:write') < f.events.indexOf(`catalog:${method === 'POST' ? 'create' : method === 'PUT' ? 'update' : 'delete'}`));
      assert.equal(f.auditWrites[0].userId, userId); assert.equal(f.auditWrites[0].companyId, companyId);
      if (method === 'POST') assert.equal(body[kind === 'contractors' ? 'contractor' : 'product'].userId, userId);
      else assert.equal(Object.hasOwn(f.catalogWrites[0].args.data || {}, 'userId'), false);
    });
    test(`${kind} ${method}: personal actor downgraded to viewer after preflight cannot write`, async () => {
      const f = fixture(kind, method, { personal: true, currentRole: 'viewer' }); const response = await f.call();
      assert.equal(response.status, 403, JSON.stringify(await response.json())); assertNoWrites(f);
      assert.deepEqual(f.events, ['transaction:start', ...(method === 'POST' ? [] : ['catalog:read']), 'actor:role']);
    });
    test(`${kind} ${method}: personal owner path remains authorized with no company fence`, async () => {
      const f = fixture(kind, method, { personal: true }); const response = await f.call();
      assert.equal(response.status, method === 'POST' ? 201 : 200, JSON.stringify(await response.json()));
      assert.equal(f.catalogWrites.length, 1); assert.equal(f.auditWrites.length, 1); assert.deepEqual(f.fenceWrites, []);
      assert.equal(f.auditWrites[0].companyId, null);
    });
    if (method !== 'POST') {
      test(`${kind} ${method}: personal record transferred after preflight cannot be changed by its previous owner`, async () => {
        const f = fixture(kind, method, { personal: true, changedOwner: true }); const response = await f.call();
        assert.equal(response.status, 403, JSON.stringify(await response.json())); assertNoWrites(f);
      });
      test(`${kind} ${method}: reassigned record requires access to its current company`, async () => {
        const f = fixture(kind, method, { changedCompany: true }); const response = await f.call();
        assert.equal(response.status, 403, JSON.stringify(await response.json())); assertNoWrites(f);
      });
    }
  }
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(root, 'src/app/api/invoices/[id]/route.ts');
const ts = require('typescript');
const beforeRouteSha256 = 'daaaff9b3a6fd364a01562faa2623e472a22334e5997b565fabe36f472d220ca';
require('./register-ts.cjs');

// Only session identity and the supplied database are replaced. Authorization,
// parsing, financial guards, print snapshots and audit persistence are real.
function application(db, user, { before = false, fenceClock } = {}) {
  const cache = new Map();
  function load(filename) {
    if (['db.ts', 'prisma.ts'].some(name => filename === path.join(root, 'src/lib', name))) return { prisma: db, default: db };
    if (filename === path.join(root, 'src/lib/auth.ts')) return { getApiSessionUser: async () => user, getSessionUser: async () => user };
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    mod.require = request => {
      if (request === 'server-only') return {};
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        const resolved = require.resolve(base);
        if (resolved.startsWith(path.join(root, 'src') + path.sep) && /\.tsx?$/.test(resolved)) return load(resolved);
        return require(resolved);
      }
      return require(request);
    };
    let source = readFileSync(filename, 'utf8');
    if (before && filename === routePath) {
      source = readFileSync(path.join(root, 'scripts/fixtures/invoice-id-before-company-fence.txt'), 'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'), beforeRouteSha256, 'Reproduction uses the exact captured pre-fix route');
    }
    const clock = fenceClock !== undefined && filename === path.join(root, 'src/lib/company-write.ts')
      ? `const Date = class extends globalThis.Date { static now() { return ${fenceClock}; } };\n` : '';
    mod._compile(clock + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  return { route: load(routePath), access: load(path.join(root, 'src/lib/company-write.ts')) };
}

function observedDb(db, { beforeTransaction, afterAccess } = {}) {
  const state = { attempts: 0, conflicts: [], transactionWrites: 0, companyWrites: 0, companyAccessReads: 0 };
  function wrap(target, transactional = false) {
    return new Proxy(target, { get(client, key) {
      if (key === '$transaction') return async (callback, options) => {
        state.attempts++;
        await beforeTransaction?.();
        try { return await client.$transaction(tx => callback(wrap(tx, true)), options); }
        catch (error) { if (error.code === 'P2034') state.conflicts.push(error.code); throw error; }
      };
      const value = client[key];
      if (!value || typeof value !== 'object' || !('findUnique' in value)) return typeof value === 'function' ? value.bind(client) : value;
      return new Proxy(value, { get(delegate, operation) {
        const fn = delegate[operation];
        if (typeof fn !== 'function') return fn;
        return async (...args) => {
          const result = await fn.apply(delegate, args);
          if (transactional && /^(create|update|upsert|delete)/.test(String(operation))) {
            state.transactionWrites++;
            if (key === 'companyProfile') state.companyWrites++;
          }
          if (transactional && key === 'companyProfile' && operation === 'aggregateRaw') {
            state.companyAccessReads++;
            await afterAccess?.();
          }
          return result;
        };
      } });
    } });
  }
  return { db: wrap(db), state };
}

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Barrier timed out: ${label}`)), 10000); })]); }
  finally { clearTimeout(timer); }
}

await test('invoice PUT and DELETE authorize and fence their own native business transaction', { timeout: 180000 }, async t => {
  // Explicitly override any inherited URL: this replica set is disposable and
  // every fixture/provider URL is synthetic. No production data is used.
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
  const databaseName = 'invoice_edit_write_fence_native', databaseUrl = mongo.getUri(databaseName);
  const client = new MongoClient(databaseUrl), db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await client.connect();
    const mongoDb = client.db(databaseName);
    await mongoDb.collection('CompanyMember').createIndex({ companyId: 1, userId: 1 }, { unique: true });
    async function fixture(mode, { personal = false, correction = false, newCorrection = false, actorRole = "owner" } = {}) {
      const ownerId = new ObjectId(), actorId = new ObjectId(), companyId = new ObjectId(), memberId = new ObjectId(), contractorId = new ObjectId(), invoiceId = new ObjectId();
      const ids = { actor: actorId.toHexString(), company: companyId.toHexString(), member: memberId.toHexString(), contractor: contractorId.toHexString(), invoice: invoiceId.toHexString() };
      const oldDate = new Date('2026-01-01T00:00:00.000Z');
      const user = { id: ids.actor, name: 'Synthetic editor', email: `${ids.actor}@example.invalid` };
      const lines = [{ name: 'Synthetic race item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23', netAmount: 100, vatAmount: 23, grossAmount: 123 }];
      const number = `EDIT/${ids.invoice}`;
      await mongoDb.collection('User').insertMany([{ _id: ownerId, email: `${ownerId}@example.invalid`, password: 'synthetic', name: 'Owner', createdAt: oldDate, updatedAt: oldDate }, { _id: actorId, email: user.email, password: 'synthetic', name: user.name, role: actorRole, createdAt: oldDate, updatedAt: oldDate }]);
      await mongoDb.collection('CompanyProfile').insertOne({ _id: companyId, userId: ownerId, companyName: 'Isolated edit fixture', nip: '5261040828', createdAt: oldDate, updatedAt: oldDate });
      await mongoDb.collection('CompanyMember').insertOne({ _id: memberId, userId: actorId, companyId, role: 'employee', canIssueInvoices: true, canCreateCorrections: true, createdAt: oldDate, updatedAt: oldDate });
      await mongoDb.collection('Contractor').insertOne({ _id: contractorId, userId: personal ? actorId : ownerId, companyId: personal ? null : companyId, name: 'Synthetic buyer', nip: '5261040828', address: { street: 'Fixture', city: 'Warszawa', postal: '00-001', country: 'PL' }, createdAt: oldDate, updatedAt: oldDate });
      const invoice = { _id: invoiceId, userId: actorId, sellerCompanyId: personal ? null : companyId, contractorId: ids.contractor, number, type: 'sale', status: mode === 'accepted-PUT' ? 'ksef_sent' : 'draft', documentStatus: mode === 'accepted-PUT' ? 'issued' : 'draft', issueDate: '2026-10-10', saleDate: '2026-10-10', dueDate: '2030-10-22', currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14, version: 1, notes: 'before', lines, totalNet: 100, totalVat: 23, totalGross: 123, paidAmount: 0, paymentStatus: 'unpaid', isCorrection: correction, gtuCodes: [], jpkProcedures: [], createdAt: oldDate, updatedAt: oldDate };
      if (mode === 'accepted-PUT') Object.assign(invoice, { ksefNumber: `SYNTHETIC-${ids.invoice}`, ksefStatus: 'accepted', issuedAt: oldDate });
      if (correction) Object.assign(invoice, { correctionReason: 'Synthetic correction', originalInvoiceNumber: 'EXTERNAL/1', originalIssueDate: '2026-10-09' });
      await mongoDb.collection('Invoice').insertOne(invoice);
      const claim = `${personal ? ids.actor : ids.company}:${number}`;
      await mongoDb.collection('InvoiceNumberClaim').insertOne({ _id: claim, invoiceId, createdAt: oldDate });
      const body = mode === 'accepted-PUT' ? { version: 1, notes: 'after' } : { sellerCompanyId: personal ? null : ids.company, contractorId: ids.contractor, number, type: 'sale', status: 'draft', issueDate: invoice.issueDate, saleDate: invoice.saleDate, dueDate: invoice.dueDate, currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14, lines, notes: 'after', version: 1, isCorrection: correction || newCorrection, ...((correction || newCorrection) ? { correctionReason: 'Synthetic correction', originalInvoiceNumber: 'EXTERNAL/1', originalIssueDate: '2026-10-09' } : {}) };
      const permission = correction || newCorrection ? 'canCreateCorrections' : 'canIssueInvoices';
      const revoke = kind => db.$transaction(async tx => {
        await application(db, user, { fenceClock: oldDate.getTime() }).access.fenceCompanyWrite(tx, ids.company);
        if (kind === 'permission') await tx.companyMember.update({ where: { id: ids.member }, data: { [permission]: false } });
        else if (kind === 'membership') await tx.companyMember.delete({ where: { id: ids.member } });
        else await tx.companySecurityPolicy.create({ data: { id: ids.company, requireMfa: true } });
      });
      const invoke = app => app.route[mode === 'DELETE' ? 'DELETE' : 'PUT'](new Request(`http://127.0.0.1/api/invoices/${ids.invoice}`, { method: mode === 'DELETE' ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' }, ...(mode === 'DELETE' ? {} : { body: JSON.stringify(body) }) }), { params: Promise.resolve({ id: ids.invoice }) });
      const artifacts = async () => ({
        invoice: await mongoDb.collection('Invoice').findOne({ _id: invoiceId }),
        claim: await mongoDb.collection('InvoiceNumberClaim').countDocuments({ _id: claim }),
        prints: await mongoDb.collection('InvoicePrintVersion').countDocuments({ invoiceId }),
        context: await mongoDb.collection('InvoicePrintContext').countDocuments({ _id: invoiceId }),
        audit: await mongoDb.collection('AuditLog').countDocuments({ entityId: ids.invoice }),
        payments: await mongoDb.collection('PaymentRecord').countDocuments({ invoiceId }),
      });
      const unchanged = async () => { const value = await artifacts(); assert.deepEqual(value.invoice, invoice); assert.deepEqual({ ...value, invoice: undefined }, { invoice: undefined, claim: 1, prints: 0, context: 0, audit: 0, payments: 0 }); };
      return { ids, user, invoke, revoke, artifacts, unchanged, oldDate };
    }

    for (const mode of ['normal-PUT', 'accepted-PUT', 'DELETE']) {
      await t.test(`${mode}: exact pre-fix handler reproduces committed pretransaction permission revocation`, async () => {
        const f = await fixture(mode), observed = observedDb(db, { beforeTransaction: () => f.revoke('permission') });
        const response = await f.invoke(application(observed.db, f.user, { before: true }));
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
        const value = await f.artifacts(); assert.equal(value.audit, 1);
        if (mode === 'DELETE') { assert.equal(value.invoice, null); assert.equal(value.claim, 0); }
        else { assert.equal(value.invoice.version, 2); assert.equal(value.invoice.notes, 'after'); }
        assert.equal(observed.state.companyWrites, 0);
      });
      for (const kind of ['permission', 'membership', 'mfa']) {
        await t.test(`${mode}: ${kind} revoked after preflight leaves every business artifact unchanged`, async () => {
          const f = await fixture(mode), observed = observedDb(db, { beforeTransaction: () => f.revoke(kind) });
          const response = await f.invoke(application(observed.db, f.user));
          assert.equal(response.status, 403, JSON.stringify(await response.json()));
          assert.equal(observed.state.attempts, 1); assert.equal(observed.state.transactionWrites, 0); await f.unchanged();
        });
      }
      for (const kind of ['permission', 'mfa']) {
        await t.test(`${mode}: ${kind} revocation after transaction access read causes native P2034 rollback`, async () => {
          const f = await fixture(mode), reached = deferred(), release = deferred();
          const observed = observedDb(db, { afterAccess: async () => { reached.resolve(); await bounded(release.promise, 'release stale authorization snapshot'); } });
          const pending = f.invoke(application(observed.db, f.user, { fenceClock: f.oldDate.getTime() }));
          try { await bounded(reached.promise, 'transaction authorization snapshot'); await f.revoke(kind); }
          finally { release.resolve(); }
          const response = await bounded(pending, 'invoice operation after revocation');
          assert.equal(response.status, 409, JSON.stringify(await response.json()));
          assert.deepEqual(observed.state.conflicts, ['P2034']); assert.equal(observed.state.attempts, 1, 'Existing 409 conflict semantics are preserved without retries'); await f.unchanged();
        });
      }
      await t.test(`${mode}: allowed member commits business write with one same-transaction company fence`, async () => {
        const f = await fixture(mode), observed = observedDb(db);
        const response = await f.invoke(application(observed.db, f.user));
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
        assert.equal(observed.state.companyAccessReads, 1); assert.equal(observed.state.companyWrites, 1);
        const value = await f.artifacts(); assert.equal(value.audit, 1); assert.equal(value.payments, 0);
        if (mode === 'DELETE') { assert.equal(value.invoice, null); assert.equal(value.claim, 0); }
        else { assert.equal(value.invoice.version, 2); assert.equal(value.invoice.notes, 'after'); assert.equal(value.invoice.paidAmount, 0); }
        if (mode === 'accepted-PUT') { assert.equal(value.context, 1); assert.equal(value.prints, 2); }
      });
      await t.test(`${mode}: exact old handler allows a personal viewer to mutate`, async () => {
        const f = await fixture(mode, { personal: true, actorRole: 'viewer' });
        const response = await f.invoke(application(db, f.user, { before: true }));
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
        assert.equal((await f.artifacts()).audit, 1);
      });
      for (const actorRole of ['viewer', 'unknown-legacy-role']) {
        await t.test(`${mode}: personal ${actorRole} cannot write any artifact`, async () => {
          const f = await fixture(mode, { personal: true, actorRole }), observed = observedDb(db);
          const response = await f.invoke(application(observed.db, f.user));
          assert.equal(response.status, 403, JSON.stringify(await response.json()));
          assert.equal(observed.state.transactionWrites, 0); await f.unchanged();
        });
      }
      await t.test(`${mode}: personal viewer role set after preflight is read in the write transaction`, async () => {
        const f = await fixture(mode, { personal: true });
        const observed = observedDb(db, { beforeTransaction: () => db.user.update({ where: { id: f.ids.actor }, data: { role: 'viewer' } }) });
        const response = await f.invoke(application(observed.db, f.user));
        assert.equal(response.status, 403, JSON.stringify(await response.json()));
        assert.equal(observed.state.transactionWrites, 0); await f.unchanged();
      });
      await t.test(`${mode}: personal accountant preserves the direct owner workflow`, async () => {
        const f = await fixture(mode, { personal: true, actorRole: 'accountant' });
        const response = await f.invoke(application(db, f.user));
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
      });
      await t.test(`${mode}: direct owner of a legacy invoice without a company still succeeds`, async () => {
        const f = await fixture(mode, { personal: true }), observed = observedDb(db);
        const response = await f.invoke(application(observed.db, f.user));
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
        assert.equal(observed.state.companyAccessReads, 0); assert.equal(observed.state.companyWrites, 0);
      });
    }
    for (const mode of ['normal-PUT', 'accepted-PUT']) {
      await t.test(`${mode}: correction permission revoked after preflight rejects even while issuance remains allowed`, async () => {
        const f = await fixture(mode, { correction: true }), observed = observedDb(db, { beforeTransaction: () => f.revoke('permission') });
        const response = await f.invoke(application(observed.db, f.user));
        assert.equal(response.status, 403, JSON.stringify(await response.json())); await f.unchanged();
        assert.equal((await db.companyMember.findUnique({ where: { id: f.ids.member } })).canIssueInvoices, true);
      });
    }
    await t.test('normal-PUT: changing a draft into a correction checks live correction permission', async () => {
      const f = await fixture('normal-PUT', { newCorrection: true }), observed = observedDb(db, { beforeTransaction: () => f.revoke('permission') });
      const response = await f.invoke(application(observed.db, f.user));
      assert.equal(response.status, 403, JSON.stringify(await response.json())); await f.unchanged();
    });
  } finally { await db.$disconnect(); await client.close(); await mongo.stop(); }
});

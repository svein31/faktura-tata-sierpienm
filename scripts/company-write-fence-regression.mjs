import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = require('typescript');
const sha = source => createHash('sha256').update(source).digest('hex');
const beforeInvoiceRouteSha256 = 'ce687002519ac557da82083130d7a024dab62f819afc7fceed8a0cddc012af4a';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Barrier timed out: ${label}`)), 10000); })]); }
  finally { clearTimeout(timer); }
}

// Actual application modules use an explicitly supplied isolated Prisma client.
// Only browser session identity is synthetic; all access reads and business writes are real.
export function application(db, user, { before = false, fenceClock } = {}) {
  const cache = new Map();
  const load = filename => {
    if (['db.ts', 'prisma.ts'].some(name => filename === path.join(root, 'src/lib', name))) return { prisma: db, default: db };
    if (filename === path.join(root, 'src/lib/auth.ts')) return { getApiSessionUser: async () => user, getSessionUser: async () => user };
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
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
    if (before && filename === path.join(root, 'src/app/api/invoices/route.ts')) {
      source = readFileSync(path.join(root, 'scripts/fixtures/invoice-post-before-company-fence.txt'), 'utf8');
      assert.equal(sha(source), beforeInvoiceRouteSha256, 'The baseline is the exact captured pre-fix POST source');
    }
    const fixedClock = fenceClock !== undefined && filename === path.join(root, 'src/lib/company-write.ts')
      ? `const Date = class extends globalThis.Date { constructor(...args) { super(...(args.length ? args : [${fenceClock}])); } static now() { return ${fenceClock}; } };\n` : '';
    mod._compile(fixedClock + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  };
  require('./register-ts.cjs');
  return { invoice: load(path.join(root, 'src/app/api/invoices/route.ts')), projects: load(path.join(root, 'src/app/api/projects/route.ts')), access: load(path.join(root, 'src/lib/company-write.ts')) };
}

function observedDb(db, { afterAccess, afterFence } = {}) {
  const state = { attempts: 0, conflicts: [], profileWrites: 0, transactionWrites: 0 };
  const wrap = (target, transactional = false) => new Proxy(target, { get(client, key) {
    if (key === '$transaction') return async (callback, options) => {
      state.attempts++;
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
        if (/^(create|update|upsert|delete)/.test(String(operation))) {
          if (key === 'companyProfile') state.profileWrites++;
          if (transactional) state.transactionWrites++;
        }
        if (transactional && key === 'companyProfile' && operation === 'aggregateRaw' && afterAccess) await afterAccess();
        if (transactional && key === 'companyProfile' && operation === 'update' && afterFence) await afterFence();
        return result;
      };
    } });
  } });
  return { db: wrap(db), state };
}

export async function checkCompanyWriteFence({ db, mongoDb }) {
  const marker = randomBytes(6).toString('hex'), ownerId = new ObjectId(), actorId = new ObjectId(), companyId = new ObjectId(), memberId = new ObjectId(), contractorId = new ObjectId(), projectId = new ObjectId();
  const ids = { owner: ownerId.toHexString(), actor: actorId.toHexString(), company: companyId.toHexString(), contractor: contractorId.toHexString(), project: projectId.toHexString() };
  const user = { id: ids.actor, name: 'Synthetic issuer', email: `fence-actor-${marker}@example.invalid`, role: 'employee' };
  const oldDate = new Date('2026-01-01T00:00:00.000Z'), events = [], outcomes = [];
  let activeRelease;
  const resetAccess = async () => {
    await mongoDb.collection('CompanyMember').updateOne({ _id: memberId }, { $set: { role: 'employee', canIssueInvoices: true, canExport: true } });
    await mongoDb.collection('CompanySecurityPolicy').deleteOne({ _id: companyId });
  };
  const revoke = async (kind, fenceClock) => db.$transaction(async tx => {
    await application(db, user, { fenceClock }).access.fenceCompanyWrite(tx, ids.company);
    if (kind === 'permission') await tx.companyMember.update({ where: { id: memberId.toHexString() }, data: { canIssueInvoices: false } });
    else await tx.companySecurityPolicy.upsert({ where: { id: ids.company }, create: { id: ids.company, requireMfa: true }, update: { requireMfa: true } });
    events.push(`${kind}:revocation-committed-body`);
  });
  const artifactCounts = async number => {
    const invoices = await mongoDb.collection('Invoice').find({ sellerCompanyId: companyId, number }).project({ _id: 1 }).toArray(), invoiceIds = invoices.map(row => row._id);
    return {
      invoices: invoices.length,
      numberClaims: await mongoDb.collection('InvoiceNumberClaim').countDocuments({ _id: `${ids.company}:${number}` }),
      printContexts: await mongoDb.collection('InvoicePrintContext').countDocuments({ _id: { $in: invoiceIds } }),
      printVersions: await mongoDb.collection('InvoicePrintVersion').countDocuments({ invoiceId: { $in: invoiceIds } }),
      audit: await mongoDb.collection('AuditLog').countDocuments({ companyId, action: 'invoice_created', 'details.number': number }),
      payments: await mongoDb.collection('PaymentRecord').countDocuments({ userId: actorId }),
    };
  };
  const post = async (app, number) => app.invoice.POST(new Request('http://127.0.0.1/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerCompanyId: ids.company, contractorId: ids.contractor, number, type: 'purchase', status: 'issued', issueDate: '2026-10-10', saleDate: '2026-10-10', dueDate: '2030-10-22', currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14, lines: [{ name: 'Synthetic race item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }] }) }));
  try {
    await mongoDb.collection('User').insertMany([{ _id: ownerId, email: `fence-owner-${marker}@example.invalid`, password: 'synthetic', name: 'Owner', createdAt: oldDate, updatedAt: oldDate }, { _id: actorId, email: user.email, password: 'synthetic', name: user.name, createdAt: oldDate, updatedAt: oldDate }]);
    await mongoDb.collection('CompanyProfile').insertOne({ _id: companyId, userId: ownerId, companyName: 'Isolated fence fixture', nip: '5261040828', createdAt: oldDate, updatedAt: oldDate });
    await mongoDb.collection('CompanyMember').insertOne({ _id: memberId, userId: actorId, companyId, role: 'employee', canIssueInvoices: true, canExport: true, createdAt: oldDate, updatedAt: oldDate });
    await mongoDb.collection('Contractor').insertOne({ _id: contractorId, userId: ownerId, companyId, name: 'Synthetic buyer', nip: '5261040828', address: { street: 'Fixture', city: 'Warszawa', postal: '00-001', country: 'PL' }, createdAt: oldDate, updatedAt: oldDate });
    await mongoDb.collection('Project').insertOne({ _id: projectId, companyId, name: 'Read only fixture', createdAt: oldDate, updatedAt: oldDate });
    for (const before of [true, false]) for (const kind of ['permission', 'mfa']) for (const sameTimestamp of [false, true]) {
      await resetAccess();
      await mongoDb.collection('CompanyProfile').updateOne({ _id: companyId }, { $set: { updatedAt: oldDate } });
      const reached = deferred(), release = deferred(); activeRelease = release;
      let paused = false;
      const observed = observedDb(db, { afterAccess: async () => { if (paused) return; paused = true; events.push(`${before ? 'before' : 'after'}:${kind}:authorized-snapshot`); reached.resolve(); await bounded(release.promise, 'release authorization snapshot'); } });
      const fenceClock = sameTimestamp ? oldDate.getTime() : undefined;
      const app = application(observed.db, user, { before, fenceClock }), number = `FENCE/${marker}/${before ? 'OLD' : 'NEW'}/${kind}/${sameTimestamp ? 'SAME' : 'NEW'}`;
      const pending = post(app, number);
      await bounded(reached.promise, 'POST transaction authorization read');
      await revoke(kind, fenceClock); events.push(`${kind}:revocation-committed`);
      release.resolve(); activeRelease = undefined;
      const response = await bounded(pending, 'POST after committed revocation'), body = await response.json(), counts = await artifactCounts(number);
      assert.equal(response.status, before ? 201 : 403, JSON.stringify(body));
      assert.deepEqual(counts, before ? { invoices: 1, numberClaims: 1, printContexts: 1, printVersions: 1, audit: 1, payments: 0 } : { invoices: 0, numberClaims: 0, printContexts: 0, printVersions: 0, audit: 0, payments: 0 });
      assert.equal(observed.state.conflicts.length, before ? 0 : 1, 'The fenced stale snapshot must abort with native Prisma P2034');
      assert.equal(observed.state.attempts, before ? 1 : 2, 'POST retries the full transaction and checks the revoked access');
      outcomes.push({ mode: before ? 'exact-pre-fix-POST' : 'fenced-POST', revocation: kind, forcedSameTimestamp: sameTimestamp, status: response.status, attempts: observed.state.attempts, conflicts: observed.state.conflicts, artifacts: counts });
    }
    // Reverse the order: once an admitted business transaction holds the company
    // fence, a revoker cannot commit ahead of it. Also force a Date collision to
    // verify native Mongo no-op updates retain the transaction write conflict.
    for (const sameTimestamp of [false, true]) {
      await resetAccess();
      await mongoDb.collection('CompanyProfile').updateOne({ _id: companyId }, { $set: { updatedAt: oldDate } });
      const reached = deferred(), release = deferred(); activeRelease = release; let paused = false;
      const observed = observedDb(db, { afterFence: async () => { if (paused) return; paused = true; reached.resolve(); await bounded(release.promise, 'release admitted business transaction'); } });
      const app = application(observed.db, user, sameTimestamp ? { fenceClock: oldDate.getTime() } : {}), number = `FENCE/${marker}/FIRST/${sameTimestamp ? 'SAME' : 'NEW'}`;
      const pending = post(app, number);
      await bounded(reached.promise, 'POST company fence');
      let revocationError;
      try { await bounded(revoke('permission', sameTimestamp ? oldDate.getTime() : undefined), 'revoker while business fence is held'); }
      catch (error) { revocationError = error; }
      release.resolve(); activeRelease = undefined;
      const response = await bounded(pending, 'admitted POST commit');
      assert.equal(revocationError?.code, 'P2034', 'A concurrent revoker must conflict even when the fence timestamp is unchanged');
      assert.equal(response.status, 201, JSON.stringify(await response.json()));
      assert.deepEqual(await artifactCounts(number), { invoices: 1, numberClaims: 1, printContexts: 1, printVersions: 1, audit: 1, payments: 0 });
      await revoke('permission');
      const later = await post(application(db, user), `${number}/NEXT`); assert.equal(later.status, 403);
      outcomes.push({ mode: 'business-fence-first', forcedSameTimestamp: sameTimestamp, revocationConflict: revocationError.code, admittedStatus: response.status, laterStatus: later.status });
    }
    await resetAccess();
    const readOnly = observedDb(db), app = application(readOnly.db, user);
    const companyBefore = await mongoDb.collection('CompanyProfile').findOne({ _id: companyId });
    const response = await app.projects.GET(new Request(`http://127.0.0.1/api/projects?companyId=${ids.company}&projectId=${ids.project}`));
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.equal(readOnly.state.attempts, 1, 'The actual GET uses its read-only detail transaction');
    assert.equal(readOnly.state.transactionWrites, 0); assert.equal(readOnly.state.profileWrites, 0);
    assert.deepEqual(await mongoDb.collection('CompanyProfile').findOne({ _id: companyId }), companyBefore);
    outcomes.push({ mode: 'actual-project-detail-GET', status: response.status, transactionWrites: 0, companyWrites: 0 });
    const result = { status: 'passed', cases: outcomes.length, beforeInvoiceRouteSha256, afterInvoiceRouteSha256: sha(readFileSync(path.join(root, 'src/app/api/invoices/route.ts'), 'utf8')), controlledBarriers: true, externalProviders: false, outcomes, events };
    console.log(`[integration] PASS company write fence ${outcomes.length} native cases: exact pre-fix POST reproduces permission/MFA race; fenced POST P2034 rollback/retry403; reverse/no-op ordering; read-only GET has zero writes`);
    return result;
  } finally {
    activeRelease?.resolve();
    const invoiceIds = (await mongoDb.collection('Invoice').find({ sellerCompanyId: companyId }).project({ _id: 1 }).toArray()).map(row => row._id);
    await mongoDb.collection('InvoicePrintVersion').deleteMany({ invoiceId: { $in: invoiceIds } });
    await mongoDb.collection('InvoicePrintContext').deleteMany({ _id: { $in: invoiceIds } });
    await mongoDb.collection('InvoiceNumberClaim').deleteMany({ _id: { $regex: `^${ids.company}:FENCE/${marker}/` } });
    for (const collection of ['Invoice', 'AuditLog', 'AccountingPeriod', 'CompanyMember', 'CompanyBankAccount', 'CompanySecurityPolicy', 'Contractor', 'Project']) {
      await mongoDb.collection(collection).deleteMany(collection === 'CompanySecurityPolicy' ? { _id: companyId } : ['Invoice'].includes(collection) ? { sellerCompanyId: companyId } : { companyId });
    }
    await mongoDb.collection('CompanyProfile').deleteOne({ _id: companyId });
    await mongoDb.collection('User').deleteMany({ _id: { $in: [ownerId, actorId] } });
  }
}

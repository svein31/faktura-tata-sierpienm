import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { Prisma, PrismaClient } from '@prisma/client';
import { application } from './company-write-fence-regression.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = filename => createHash('sha256').update(readFileSync(path.join(root, filename))).digest('hex');
const lostAcknowledgment = code => code
  ? new Prisma.PrismaClientKnownRequestError('Synthetic local commit acknowledgement loss', { code, clientVersion: Prisma.prismaVersion.client })
  : new Error('Synthetic local commit acknowledgement loss');

// Only auth and DB injection are provided to the shared application loader.
// Every delegate operation and business transaction below executes in native Mongo.
function observedDb(db, { code = 'P2028', afterCommit, beforeCallbackEnd = false } = {}) {
  const state = { attempts: 0, realCommits: 0, injectedErrors: 0, createdIds: [], claimedIds: [], recoveryInvoiceReads: [], recoveryClaimReads: 0 };
  let inject = true;
  const wrap = (target, transactional = false) => new Proxy(target, { get(client, key) {
    if (key === '$transaction') return async (callback, options) => {
      state.attempts++;
      const result = await client.$transaction(tx => callback(wrap(tx, true)), options);
      state.realCommits++;
      await afterCommit?.();
      if (inject && !beforeCallbackEnd) {
        inject = false; state.injectedErrors++;
        // Awaiting the real Prisma transaction first proves that Mongo committed.
        throw lostAcknowledgment(code);
      }
      return result;
    };
    const value = client[key];
    if (!value || typeof value !== 'object' || !('findUnique' in value)) return typeof value === 'function' ? value.bind(client) : value;
    return new Proxy(value, { get(delegate, operation) {
      const fn = delegate[operation];
      if (typeof fn !== 'function') return fn;
      return async (...args) => {
        if (!transactional && key === 'invoice' && operation === 'findFirst' && args[0].where.id) state.recoveryInvoiceReads.push(args[0].where);
        if (!transactional && key === 'invoiceNumberClaim' && operation === 'findUnique') state.recoveryClaimReads++;
        const result = await fn.apply(delegate, args);
        if (transactional && key === 'invoice' && operation === 'create') state.createdIds.push(result.id);
        if (transactional && key === 'invoiceNumberClaim' && operation === 'create') state.claimedIds.push(args[0].data.invoiceId);
        if (inject && beforeCallbackEnd && transactional && key === 'invoicePrintVersion' && operation === 'create') {
          inject = false; state.injectedErrors++;
          // Real quota, invoice and print writes exist only inside this uncommitted
          // transaction. The thrown error forces Prisma to roll them all back.
          throw lostAcknowledgment(code);
        }
        return result;
      };
    } });
  } });
  return { db: wrap(db), state };
}

await test('invoice POST recovers native commit acknowledgement loss without a second creation', { timeout: 180000 }, async t => {
  // This fresh replica set and both explicit clients ignore inherited DATABASE_URL.
  // Loopback binding, synthetic requests and absent consent cookies keep providers unused.
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1' },
    instanceOpts: [{ ip: '127.0.0.1', args: process.platform === 'win32' ? [] : ['--nounixsocket'] }],
  });
  const databaseName = 'invoice_create_commit_recovery_native';
  const databaseUrl = mongo.getUri(databaseName);
  assert.match(databaseUrl, /^mongodb:\/\/127\.0\.0\.1:/, 'Only the fresh loopback replica set can be used');
  const client = new MongoClient(databaseUrl), db = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  const outcomes = [];
  try {
    await client.connect();
    const mongoDb = client.db(databaseName);
    await mongoDb.collection('CompanyMember').createIndex({ companyId: 1, userId: 1 }, { unique: true });
    async function fixture(label) {
      const ownerId = new ObjectId(), actorId = new ObjectId(), companyId = new ObjectId(), memberId = new ObjectId(), contractorId = new ObjectId();
      const ids = { owner: ownerId.toHexString(), actor: actorId.toHexString(), company: companyId.toHexString(), member: memberId.toHexString(), contractor: contractorId.toHexString() };
      const oldDate = new Date('2026-01-01T00:00:00.000Z');
      const user = { id: ids.actor, name: 'Synthetic issuer', email: `${ids.actor}@example.invalid`, role: 'employee' };
      await mongoDb.collection('User').insertMany([
        { _id: ownerId, email: `${ids.owner}@example.invalid`, password: 'synthetic', name: 'Synthetic owner', billingQuotaVersion: 0, createdAt: oldDate, updatedAt: oldDate },
        { _id: actorId, email: user.email, password: 'synthetic', name: user.name, billingQuotaVersion: 0, createdAt: oldDate, updatedAt: oldDate },
      ]);
      await mongoDb.collection('CompanyProfile').insertOne({ _id: companyId, userId: ownerId, companyName: 'Isolated recovery fixture', nip: '5261040828', invoiceNumberPattern: `RECOVERY-${label}/{PREFIX}/{NN}`, createdAt: oldDate, updatedAt: oldDate });
      await mongoDb.collection('CompanyMember').insertOne({ _id: memberId, userId: actorId, companyId, role: 'employee', canIssueInvoices: true, createdAt: oldDate, updatedAt: oldDate });
      await mongoDb.collection('Contractor').insertOne({ _id: contractorId, userId: ownerId, companyId, name: 'Synthetic buyer', nip: '5261040828', address: { street: 'Fixture', city: 'Warszawa', postal: '00-001', country: 'PL' }, createdAt: oldDate, updatedAt: oldDate });
      const post = (app, changes = {}) => app.invoice.POST(new Request('http://127.0.0.1/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerCompanyId: ids.company, contractorId: ids.contractor, number: 'UNUSED/SERVER/1', autoNumber: true,
          type: 'sale', status: 'issued', issueDate: '2026-10-10', saleDate: '2026-10-10', dueDate: '2030-10-22', currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14,
          lines: [{ name: 'Synthetic recovery item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }], ...changes }),
      }));
      async function artifacts() {
        const invoices = await mongoDb.collection('Invoice').find({ sellerCompanyId: companyId }).toArray();
        const invoiceIds = invoices.map(invoice => invoice._id);
        return {
          invoices, claims: await mongoDb.collection('InvoiceNumberClaim').find({ _id: { $regex: `^${ids.company}:` } }).toArray(),
          quota: (await mongoDb.collection('User').findOne({ _id: ownerId })).billingQuotaVersion,
          actorQuota: (await mongoDb.collection('User').findOne({ _id: actorId })).billingQuotaVersion,
          contexts: await mongoDb.collection('InvoicePrintContext').countDocuments({ _id: { $in: invoiceIds } }),
          prints: await mongoDb.collection('InvoicePrintVersion').countDocuments({ invoiceId: { $in: invoiceIds } }),
          audit: await mongoDb.collection('AuditLog').countDocuments({ companyId, action: 'invoice_created' }),
          payments: await mongoDb.collection('PaymentRecord').countDocuments({ userId: actorId }),
        };
      }
      async function assertOne(response, state) {
        const body = await response.json();
        assert.equal(response.status, 201, JSON.stringify(body));
        assert.match(body.invoice.id, /^[a-f0-9]{24}$/);
        assert.deepEqual(state.createdIds, [body.invoice.id]); assert.deepEqual(state.claimedIds, [body.invoice.id]);
        assert.equal(state.attempts, 1); assert.equal(state.realCommits, 1); assert.equal(state.injectedErrors, 1);
        assert.deepEqual(state.recoveryInvoiceReads, [{ id: body.invoice.id, userId: ids.actor, sellerCompanyId: ids.company }]);
        assert.equal(state.recoveryClaimReads, 1);
        const value = await artifacts();
        assert.equal(value.invoices.length, 1); assert.equal(value.claims.length, 1);
        assert.equal(value.invoices[0]._id.toHexString(), body.invoice.id); assert.equal(value.invoices[0].userId.toHexString(), ids.actor);
        assert.equal(value.claims[0].invoiceId.toHexString(), body.invoice.id);
        assert.equal(value.claims[0]._id, `${ids.company}:${body.invoice.number}`);
        assert.deepEqual({ ...value, invoices: undefined, claims: undefined }, { invoices: undefined, claims: undefined, quota: 1, actorQuota: 0, contexts: 1, prints: 1, audit: 1, payments: 0 });
        return { number: body.invoice.number, status: response.status, transactionAttempts: state.attempts, invoices: 1, linkedClaims: 1, quotaIncrements: 1, contexts: 1, prints: 1, audit: 1, payments: 0 };
      }
      const revoke = () => db.$transaction(async tx => {
        await application(db, user).access.fenceCompanyWrite(tx, ids.company);
        await tx.companyMember.update({ where: { id: ids.member }, data: { canIssueInvoices: false } });
      });
      return { ids, user, post, artifacts, assertOne, revoke, oldDate };
    }

    await t.test('P2028 after actual commit recovers the same invoice, linked claim and one financial unit', async () => {
      const f = await fixture('P2028'), observed = observedDb(db);
      outcomes.push({ case: 'committed-P2028', ...await f.assertOne(await f.post(application(observed.db, f.user)), observed.state) });
    });
    await t.test('an unclassified error after actual commit also recovers without choosing another number', async () => {
      const f = await fixture('UNKNOWN'), observed = observedDb(db, { code: null });
      outcomes.push({ case: 'committed-unclassified-error', ...await f.assertOne(await f.post(application(observed.db, f.user)), observed.state) });
    });
    await t.test('revocation after business commit preserves its authorized result; the next POST is denied', async () => {
      const f = await fixture('REVOKED'), observed = observedDb(db, { afterCommit: f.revoke });
      const result = await f.assertOne(await f.post(application(observed.db, f.user)), observed.state);
      assert.equal((await db.companyMember.findUnique({ where: { id: f.ids.member } })).canIssueInvoices, false);
      await assert.rejects(application(db, f.user).access.companyAccess(db, f.ids.actor, f.ids.company, 'canIssueInvoices'), error => error.status === 403);
      const later = await f.post(application(db, f.user));
      assert.equal(later.status, 403, JSON.stringify(await later.json()));
      const value = await f.artifacts(); assert.equal(value.invoices.length, 1); assert.equal(value.claims.length, 1);
      assert.equal(value.quota, 1); assert.equal(value.prints, 1); assert.equal(value.contexts, 1); assert.equal(value.audit, 1);
      outcomes.push({ case: 'committed-then-revoked-before-lost-acknowledgement', ...result, laterStatus: later.status });
    });
    await t.test('a P2028 before callback completion rolls back native writes and is never blindly retried', async () => {
      const f = await fixture('ROLLED-BACK'), observed = observedDb(db, { beforeCallbackEnd: true });
      const response = await f.post(application(observed.db, f.user));
      assert.equal(response.status, 500, JSON.stringify(await response.json()));
      assert.equal(observed.state.attempts, 1); assert.equal(observed.state.realCommits, 0); assert.equal(observed.state.injectedErrors, 1);
      assert.equal(observed.state.createdIds.length, 1, 'The actual invoice write happened before the injected native rollback');
      assert.equal(observed.state.claimedIds.length, 1); assert.deepEqual(observed.state.recoveryInvoiceReads, []); assert.equal(observed.state.recoveryClaimReads, 0);
      const value = await f.artifacts();
      assert.deepEqual(value, { invoices: [], claims: [], quota: 0, actorQuota: 0, contexts: 0, prints: 0, audit: 0, payments: 0 });
      const invoiceId = new ObjectId(observed.state.createdIds[0]);
      assert.equal(await mongoDb.collection('InvoicePrintContext').countDocuments({ _id: invoiceId }), 0);
      assert.equal(await mongoDb.collection('InvoicePrintVersion').countDocuments({ invoiceId }), 0);
      assert.deepEqual((await mongoDb.collection('CompanyProfile').findOne({ _id: new ObjectId(f.ids.company) })).updatedAt, f.oldDate, 'The company write fence rolled back too');
      outcomes.push({ case: 'P2028-before-callback-completed', status: response.status, transactionAttempts: 1, nativeRollback: true, invoices: 0, linkedClaims: 0, quotaIncrements: 0, contexts: 0, prints: 0, audit: 0, payments: 0 });
    });
    for (const role of ['viewer', 'owner', 'accountant']) {
      await t.test(`personal ${role} uses its current native account role before any financial write`, async () => {
        const f = await fixture(`PERSONAL-${role}`);
        await db.user.update({ where: { id: f.ids.actor }, data: { role } });
        await db.contractor.update({ where: { id: f.ids.contractor }, data: { userId: f.ids.actor, companyId: null } });
        const number = `PERSONAL/${f.ids.actor}`;
        const response = await f.post(application(db, f.user), { sellerCompanyId: null, autoNumber: false, number });
        const body = await response.json();
        assert.equal(response.status, role === 'viewer' ? 403 : 201, JSON.stringify(body));
        const invoices = await db.invoice.findMany({ where: { userId: f.ids.actor } });
        assert.equal(invoices.length, role === 'viewer' ? 0 : 1);
        const claim = await db.invoiceNumberClaim.findUnique({ where: { id: `${f.ids.actor}:${number}` } });
        const actor = await mongoDb.collection('User').findOne({ _id: new ObjectId(f.ids.actor) });
        assert.equal(actor.billingQuotaVersion, role === 'viewer' ? 0 : 1);
        assert.equal(await db.auditLog.count({ where: { userId: f.ids.actor, action: 'invoice_created' } }), role === 'viewer' ? 0 : 1);
        if (role === 'viewer') assert.equal(claim, null);
        else { assert.equal(claim.invoiceId, body.invoice.id); assert.equal(invoices[0].id, body.invoice.id); }
        outcomes.push({ case: `personal-${role}`, status: response.status, invoices: invoices.length, quotaIncrements: actor.billingQuotaVersion });
      });
    }
    console.log(JSON.stringify({ status: 'passed', cases: outcomes.length, disposableLoopbackReplicaSet: true, externalProviders: false,
      invoicePostSha256: digest('src/app/api/invoices/route.ts'), nativeScriptSha256: digest('scripts/invoice-create-commit-recovery-native.mjs'), outcomes }));
  } finally { await db.$disconnect(); await client.close(); await mongo.stop(); }
});

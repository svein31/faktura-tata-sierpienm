// Same HTTP operation recovery and confirmed rollback retries; no cross-request idempotency.
require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const routePath = require.resolve('../../src/app/api/invoices/route.ts');
const actorId = 'a'.repeat(24), companyId = 'b'.repeat(24), requestInvoiceId = 'd'.repeat(24);
const fault = code => Object.assign(new Error(`Synthetic ${code || 'commit acknowledgement'} fault`), code ? { code } : {});
class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const payload = {
  sellerCompanyId: companyId, number: 'QA/1', type: 'sale', status: 'issued',
  issueDate: '2026-10-10', dueDate: '2030-10-10', currency: 'PLN', isCorrection: false,
  isProforma: false, paymentStatus: 'unpaid', paidAmount: 0,
};
const request = body => new Request('http://synthetic.invalid/api/invoices', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function match(invoice, where) {
  if (where.id && invoice.id !== where.id) return false;
  if (where.userId && invoice.userId !== where.userId) return false;
  if (where.sellerCompanyId && invoice.sellerCompanyId !== where.sellerCompanyId) return false;
  if (where.number && invoice.number !== where.number) return false;
  if (where.OR && invoice.sellerCompanyId != null) return false;
  return true;
}
function fixture({ plans = [{ commit: true }], recoveryAccessError, recoveryReadError,
  claimMode, responseError, initialClaims = [], recoveryMutation } = {}) {
  let durable = { invoices: [], claims: initialClaims, quota: [], prints: [], audit: [] };
  const events = [], creates = [], claims = [], lookups = [], captured = [];
  let attempts = 0, entropyCalls = 0, numberProposals = 0, recoveryAccessCalls = 0;
  const db = {
    companyMember: { findMany: async () => [{ companyId }] },
    companyProfile: { findUnique: async () => ({ invoiceNumberPattern: '{PREFIX}/{NN}' }), count: async () => 1 },
    invoice: { findFirst: async query => {
      lookups.push(query);
      if (query.where.id) {
        events.push('recovery:invoice');
        if (recoveryReadError) throw recoveryReadError;
      }
      return durable.invoices.find(invoice => match(invoice, query.where)) || null;
    } },
    invoiceNumberClaim: { findUnique: async query => {
      events.push('recovery:claim');
      assert.deepEqual(query.select, { invoiceId: true });
      if (claimMode === 'throw') throw fault();
      if (claimMode === 'missing') return null;
      if (claimMode === 'foreign') return { invoiceId: 'e'.repeat(24) };
      return durable.claims.find(claim => claim.id === query.where.id) || null;
    } },
    $transaction: async callback => {
      const plan = plans[attempts++] || { commit: true };
      events.push('transaction:start');
      if (plan.startError) throw plan.startError;
      const stage = structuredClone(durable);
      const tx = {
        user: { findUnique: async query => {
          assert.deepEqual(query, { where: { id: actorId }, select: { role: true } });
          events.push('personal:current-role');
          return plan.missingUser ? null : { role: plan.personalRole || 'owner' };
        } },
        invoiceNumberClaim: { create: async ({ data }) => {
          claims.push(data); events.push('claim:create');
          if (stage.claims.some(claim => claim.id === data.id)) throw fault('P2002');
          stage.claims.push(data); return data;
        } },
        invoice: { create: async ({ data }) => {
          creates.push(data); events.push('invoice:create');
          if (stage.invoices.some(invoice => invoice.id === data.id)) throw fault('P2002');
          const invoice = { ...data, sellerCompany: data.sellerCompanyId ? { id: data.sellerCompanyId } : null };
          stage.invoices.push(invoice); return invoice;
        } },
        stage, plan,
      };
      const invoice = await callback(tx);
      events.push('callback:return');
      if (plan.commit) {
        durable = stage;
        if (recoveryMutation) recoveryMutation(durable);
        events.push('transaction:commit');
      }
      if (plan.foreignInvoice) durable.invoices.push(plan.foreignInvoice);
      if (plan.error) throw plan.error;
      return invoice;
    },
  };
  const mocks = {
    'node:crypto': { randomBytes: size => { assert.equal(size, 12); entropyCalls++; return Buffer.from(requestInvoiceId, 'hex'); } },
    '@/lib/auth': { getApiSessionUser: async () => ({ id: actorId, name: 'Synthetic actor', email: 'actor@example.invalid' }) },
    '@/lib/db': { prisma: db },
    '@/lib/api': { ApiError, json: (value, init = {}) => Response.json(value, { status: init.status || 200 }),
      readJson: req => req.json(), handleApiError: error => {
        captured.push(error);
        return Response.json({ error: 'synthetic error' }, { status: error.status || (['P2002', 'P2034'].includes(error.code) ? 409 : 500) });
      } },
    '@/lib/company-scope': { contractorForCompany: async () => true },
    '@/lib/parsers': { parseInvoiceBody: async body => ({ ...body, sellerCompanyId: body.sellerCompanyId || null }) },
    '@/lib/company-write': {
      companyWriteAccess: async (tx, user, company, permission) => {
        assert.notEqual(tx, db); assert.equal(user, actorId); assert.equal(company, companyId);
        assert.equal(permission, tx.plan.correction ? 'canCreateCorrections' : 'canIssueInvoices');
        events.push('write:access');
        if (tx.plan.accessError) throw tx.plan.accessError;
      },
      companyAccess: async (client, user, company, permission) => {
        assert.equal(client, db, 'recovery access is a read, with no business transaction or write fence');
        assert.equal(user, actorId); assert.equal(company, companyId);
        assert.equal(permission, plans[attempts - 1].correction ? 'canCreateCorrections' : 'canIssueInvoices');
        recoveryAccessCalls++; events.push('recovery:access');
        if (recoveryAccessError) throw recoveryAccessError;
      },
    },
    '@/lib/accounting-period': { assertAccountingPeriodsOpen: async tx => { events.push('period:check'); assert.ok(tx.stage); } },
    '@/lib/invoice-quota': { claimInvoiceQuota: async tx => { tx.stage.quota.push(requestInvoiceId); return new Date('2026-10-10T12:00:00Z'); } },
    '@/lib/pdf/invoice-print': { captureInvoicePrint: async (tx, invoice) => {
      if (tx.plan.printError) throw tx.plan.printError;
      tx.stage.prints.push(invoice.id);
    } },
    '@/lib/audit': { recordAuditLog: async ({ client, documentId }) => {
      if (client.plan.auditError) throw client.plan.auditError;
      client.stage.audit.push(documentId);
    } },
    '@/lib/pilot-metrics': { recordPilotEvent: () => { events.push('response:metric'); } },
    '@/lib/dto': { invoiceToDto: invoice => { if (responseError) throw responseError; return invoice; } },
    '@/lib/invoice-bank-account': { invoiceBankAccountForCompany: async () => ({}) },
    '@/lib/invoice-correction-source': { resolveInvoiceCorrectionSource: async (_client, _user, body) => body },
    '@/lib/invoice-numbering': { DEFAULT_INVOICE_PATTERN: '{PREFIX}/{NN}', invoicePrefix: () => 'QA' },
    '@/lib/invoice-numbering-server': { nextPersistedInvoiceNumber: async () => `QA/${++numberProposals}` },
    '@/lib/invoice-number-scope': { invoiceNumberScope: (userId, sellerCompanyId) => sellerCompanyId ? { sellerCompanyId } : {
      userId, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }],
    } },
    '@/lib/scheduling': { warsawDate: () => '2026-10-10' },
  };
  const originalLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    return Object.hasOwn(mocks, name) ? mocks[name] : originalLoad.call(this, name, parent, isMain);
  };
  let route;
  try { delete require.cache[require.resolve(routePath)]; route = require(routePath); }
  finally { Module._load = originalLoad; }
  return { post: body => route.POST(request({ ...payload, ...body })), durable: () => durable,
    attempts: () => attempts, entropyCalls: () => entropyCalls, recoveryAccessCalls: () => recoveryAccessCalls,
    events, creates, claims, lookups, captured };
}
function oneAtomicCreation(f) {
  const state = f.durable();
  assert.equal(state.invoices.length, 1); assert.equal(state.claims.length, 1);
  assert.equal(state.invoices[0].id, requestInvoiceId); assert.equal(state.claims[0].invoiceId, requestInvoiceId);
  assert.deepEqual(state.quota, [requestInvoiceId]); assert.deepEqual(state.prints, [requestInvoiceId]);
  assert.deepEqual(state.audit, [requestInvoiceId]);
}

test('a confirmed P2034 rollback retries with one handler ID and commits quota, print and audit once', async () => {
  const f = fixture({ plans: [{ error: fault('P2034') }, { commit: true }] });
  assert.equal((await f.post()).status, 201); assert.equal(f.attempts(), 2); assert.equal(f.entropyCalls(), 1);
  assert.deepEqual(f.creates.map(data => data.id), [requestInvoiceId, requestInvoiceId]);
  assert.equal(f.lookups.filter(query => query.where.id).length, 0, 'P2034 is confirmed rollback');
  oneAtomicCreation(f);
});
test('auto-number P2002 from another claim selects a new number with the same request ID', async () => {
  const f = fixture({ initialClaims: [{ id: `${companyId}:QA/1`, invoiceId: 'e'.repeat(24) }] });
  assert.equal((await f.post({ autoNumber: true })).status, 201); assert.equal(f.attempts(), 2);
  assert.deepEqual(f.claims.map(claim => claim.invoiceId), [requestInvoiceId, requestInvoiceId]);
  assert.equal(f.durable().invoices[0].number, 'QA/2'); assert.equal(f.entropyCalls(), 1);
  assert.equal(f.lookups.filter(query => query.where.id).length, 0);
});
test('manual-number P2002 retains 409 and never looks up a same-number invoice for recovery', async () => {
  const f = fixture({ initialClaims: [{ id: `${companyId}:QA/1`, invoiceId: 'e'.repeat(24) }] });
  assert.equal((await f.post()).status, 409); assert.equal(f.attempts(), 1);
  assert.equal(f.durable().invoices.length, 0); assert.equal(f.lookups.filter(query => query.where.id).length, 0);
});
for (const code of ['P2028', undefined, 'P2002']) {
  test(`a lost commit acknowledgement (${code || 'unclassified'}) recovers only the scoped ID and linked claim`, async () => {
    const f = fixture({ plans: [{ commit: true, error: fault(code) }] });
    const response = await f.post({ autoNumber: true });
    assert.equal(response.status, 201); assert.equal((await response.json()).invoice.id, requestInvoiceId);
    assert.equal(f.attempts(), 1); oneAtomicCreation(f);
    const lookup = f.lookups.find(query => query.where.id);
    assert.deepEqual(lookup.where, { id: requestInvoiceId, userId: actorId, sellerCompanyId: companyId });
    assert.equal(f.recoveryAccessCalls(), 0);
    assert.ok(f.events.indexOf('recovery:invoice') < f.events.indexOf('recovery:claim'));
    assert.equal(f.events.includes('recovery:access'), false, 'recovery returns the previously authorized operation result');
  });
}
test('P2028 before callback start has no possible commit, no recovery and no retry', async () => {
  const f = fixture({ plans: [{ startError: fault('P2028') }] });
  assert.equal((await f.post({ autoNumber: true })).status, 500); assert.equal(f.attempts(), 1);
  assert.equal(f.creates.length, 0); assert.equal(f.lookups.filter(query => query.where.id).length, 0);
});
for (const phase of ['printError', 'auditError']) {
  test(`P2028 during ${phase} rolls back the full unit and cannot trigger another creation`, async () => {
    const f = fixture({ plans: [{ [phase]: fault('P2028') }] });
    assert.equal((await f.post({ autoNumber: true })).status, 500); assert.equal(f.attempts(), 1);
    assert.deepEqual(f.durable(), { invoices: [], claims: [], quota: [], prints: [], audit: [] });
    assert.equal(f.lookups.filter(query => query.where.id).length, 0);
  });
}
test('absence after an unknown commit remains an error even with another invoice using the same number', async () => {
  const original = fault('P2028');
  const f = fixture({ plans: [{ error: original, foreignInvoice: { ...payload, id: 'e'.repeat(24), userId: actorId } }] });
  assert.equal((await f.post({ autoNumber: true })).status, 500); assert.equal(f.attempts(), 1);
  assert.equal(f.captured[0], original); assert.equal(f.durable().invoices[0].id, 'e'.repeat(24));
  assert.equal(f.events.includes('recovery:claim'), false);
});
for (const claimMode of ['missing', 'foreign', 'throw']) {
  test(`an uncertain commit with ${claimMode} claim proof is not recovered or retried`, async () => {
    const original = fault('P2028');
    const f = fixture({ plans: [{ commit: true, error: original }], claimMode });
    assert.equal((await f.post({ autoNumber: true })).status, 500); assert.equal(f.attempts(), 1);
    assert.equal(f.captured[0], original); assert.equal(f.recoveryAccessCalls(), 0);
  });
}
test('a recovery read failure preserves the original commit error and does not retry', async () => {
  const original = fault('P2028');
  const f = fixture({ plans: [{ commit: true, error: original }], recoveryReadError: fault() });
  assert.equal((await f.post({ autoNumber: true })).status, 500); assert.equal(f.attempts(), 1);
  assert.equal(f.captured[0], original);
});
for (const changed of [{ userId: 'e'.repeat(24) }, { sellerCompanyId: 'e'.repeat(24) }]) {
  test(`recovery does not disclose an invoice outside ${Object.keys(changed)[0]} scope`, async () => {
    const f = fixture({ plans: [{ commit: true, error: fault('P2028') }],
      recoveryMutation: state => Object.assign(state.invoices[0], changed) });
    assert.equal((await f.post()).status, 500); assert.equal(f.attempts(), 1);
    assert.equal(f.recoveryAccessCalls(), 0);
  });
}
for (const reason of ['revoked', 'invalid role', 'MFA policy']) {
  test(`recovery returns the already-authorized operation result despite subsequent ${reason}, without new writes`, async () => {
    const f = fixture({ plans: [{ commit: true, error: fault('P2028') }],
      recoveryAccessError: new ApiError(403, `Synthetic ${reason}`) });
    assert.equal((await f.post()).status, 201); assert.equal(f.attempts(), 1); assert.equal(f.recoveryAccessCalls(), 0); oneAtomicCreation(f);
  });
}
test('correction recovery preserves the completed canCreateCorrections-authorized operation without fresh access', async () => {
  const f = fixture({ plans: [{ correction: true, commit: true, error: fault('P2028') }] });
  assert.equal((await f.post({ isCorrection: true })).status, 201); assert.equal(f.recoveryAccessCalls(), 0);
  oneAtomicCreation(f);
});
test('personal recovery uses the exact actor and null-or-missing company scope without company access writes', async () => {
  const f = fixture({ plans: [{ commit: true, error: fault('P2028') }] });
  assert.equal((await f.post({ sellerCompanyId: null })).status, 201); assert.equal(f.recoveryAccessCalls(), 0);
  assert.deepEqual(f.lookups.find(query => query.where.id).where, {
    id: requestInvoiceId, userId: actorId, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }],
  });
  assert.equal(f.durable().claims[0].id, `${actorId}:QA/1`); oneAtomicCreation(f);
});
test('revocation inside the original write transaction cannot reach a claim or invoice', async () => {
  const f = fixture({ plans: [{ accessError: new ApiError(403, 'Synthetic revoked access') }] });
  assert.equal((await f.post()).status, 403); assert.equal(f.attempts(), 1);
  assert.equal(f.claims.length, 0); assert.equal(f.creates.length, 0);
  assert.equal(f.lookups.filter(query => query.where.id).length, 0);
});
for (const code of ['P2034', 'P2002', undefined]) {
  test(`a postcommit DTO error (${code || 'unclassified'}) is outside the retry catch`, async () => {
    const f = fixture({ responseError: fault(code) });
    assert.equal((await f.post({ autoNumber: true })).status, code ? 409 : 500);
    assert.equal(f.attempts(), 1); oneAtomicCreation(f);
    assert.equal(f.lookups.filter(query => query.where.id).length, 0);
  });
}

for (const claimMode of ['missing', 'foreign', 'throw']) {
  test(`callback-completed P2002 with ${claimMode} proof cannot blindly auto-number retry`, async () => {
    const original = fault('P2002');
    const f = fixture({ plans: [{ commit: true, error: original }], claimMode });
    assert.equal((await f.post({ autoNumber: true })).status, 409);
    assert.equal(f.attempts(), 1); assert.equal(f.entropyCalls(), 1);
    assert.equal(f.captured[0], original); oneAtomicCreation(f);
  });
}
test('callback-completed P2002 with an absent exact invoice cannot auto-number retry', async () => {
  const original = fault('P2002');
  const f = fixture({ plans: [{ error: original }] });
  assert.equal((await f.post({ autoNumber: true })).status, 409);
  assert.equal(f.attempts(), 1); assert.equal(f.captured[0], original);
});

test('a current personal viewer cannot create any invoice or financial artifact', async () => {
  const f = fixture({ plans: [{ personalRole: 'viewer', commit: true }] });
  assert.equal((await f.post({ sellerCompanyId: null })).status, 403);
  assert.equal(f.creates.length, 0); assert.equal(f.claims.length, 0);
  assert.deepEqual(f.durable(), { invoices: [], claims: [], quota: [], prints: [], audit: [] });
  assert.ok(f.events.includes('personal:current-role'));
});

test('a missing personal actor is denied before any invoice or financial artifact', async () => {
  const f = fixture({ plans: [{ missingUser: true, commit: true }] });
  assert.equal((await f.post({ sellerCompanyId: null })).status, 403);
  assert.deepEqual(f.durable(), { invoices: [], claims: [], quota: [], prints: [], audit: [] });
});

test('an unknown personal actor role is denied before any invoice or financial artifact', async () => {
  const f = fixture({ plans: [{ personalRole: 'unexpected', commit: true }] });
  assert.equal((await f.post({ sellerCompanyId: null })).status, 403);
  assert.deepEqual(f.durable(), { invoices: [], claims: [], quota: [], prints: [], audit: [] });
});

for (const personalRole of ['owner', 'accountant']) {
  test(`a current personal ${personalRole} retains creation access`, async () => {
    const f = fixture({ plans: [{ personalRole, commit: true }] });
    assert.equal((await f.post({ sellerCompanyId: null })).status, 201); oneAtomicCreation(f);
    assert.ok(f.events.includes('personal:current-role'));
  });
}

test('company creation does not use or query a personal account role', async () => {
  const f = fixture({ plans: [{ personalRole: 'viewer', commit: true }] });
  assert.equal((await f.post()).status, 201); oneAtomicCreation(f);
  assert.ok(!f.events.includes('personal:current-role'));
});

require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { ApiError } = require('../../src/lib/api.ts');
const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), invoiceId = 'c'.repeat(24);
function fixture({ revoked = false, personal = false, changedOwner = false, role = "owner", missingActor = false } = {}) {
  const writes = { invoice: 0, payment: 0, audit: 0, authorization: 0 };
  const current = { id: invoiceId, userId: changedOwner ? 'd'.repeat(24) : userId,
    sellerCompanyId: personal ? null : companyId, type: 'sale', number: 'SYNTHETIC/1',
    status: 'issued', documentStatus: 'issued', issueDate: '2026-10-10', dueDate: '2030-10-22',
    currency: 'PLN', version: 1, paidAmount: 0, paymentStatus: 'unpaid',
    lines: [{ name: 'Synthetic item', quantity: 1, netPrice: 100, vatRate: '23', unit: 'szt.' }] };
  const preflight = { ...current, userId };
  const db = { invoice: { findUnique: async () => preflight } };
  const tx = { user: { findUnique: async () => missingActor ? null : ({ role }) }, invoice: { findUnique: async () => current, update: async ({ data }) => { writes.invoice++; return { ...current, ...data }; } },
    paymentRecord: { findMany: async () => [], create: async ({ data }) => { writes.payment++; return { id: 'synthetic-payment', ...data }; } } };
  db.$transaction = async callback => callback(tx);
  const mocks = {
    '@/lib/db': { prisma: db }, '@/lib/auth': { getSessionUser: async () => ({ id: userId, email: 'test@example.invalid' }) },
    '@/lib/permissions': { getCompanyMembership: async () => ({ role: 'employee' }), requireCompanyAccess: async () => ({ ok: true }) },
    '@/lib/company-write': { companyWriteAccess: async (supplied, actor, company, permission) => {
      assert.equal(supplied, tx); assert.equal(actor, userId); assert.equal(company, companyId); assert.equal(permission, 'canRecordPayments');
      writes.authorization++; if (revoked) throw new ApiError(403, 'Uprawnienie cofnięte przed zapisem.');
    } },
    '@/lib/accounting-period': { assertAccountingPeriodsOpen: async () => {} },
    '@/lib/audit': { recordAuditLog: async () => { writes.audit++; } },
    '@/lib/dto': { invoiceToDto: value => value },
  };
  const original = Module._load;
  Module._load = function(request, parent, isMain) { return Object.hasOwn(mocks, request) ? mocks[request] : original.call(this, request, parent, isMain); };
  try { const path = require.resolve('../../src/app/api/invoices/[id]/payments/route.ts'); delete require.cache[path]; return { route: require(path), writes }; }
  finally { Module._load = original; }
}
const request = () => new Request('http://127.0.0.1/api/invoices/synthetic/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 10, method: 'transfer', paidAt: '2026-10-10' }) });
const context = { params: Promise.resolve({ id: invoiceId }) };
test('payment permission revoked after preflight prevents every ledger write', async () => {
  const f = fixture({ revoked: true }); const response = await f.route.POST(request(), context);
  assert.equal(response.status, 403); assert.deepEqual(f.writes, { invoice: 0, payment: 0, audit: 0, authorization: 1 });
});
test('authorized payment checks the business transaction and records the existing partial-payment calculation', async () => {
  const f = fixture(); const response = await f.route.POST(request(), context); const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.paidAmount, 10); assert.equal(body.remainingAmount, 113); assert.equal(body.paymentStatus, 'partially_paid');
  assert.deepEqual(f.writes, { invoice: 2, payment: 1, audit: 1, authorization: 1 });
});
test('personal legacy invoice preserves the direct owner payment without company access', async () => {
  const f = fixture({ personal: true }); const response = await f.route.POST(request(), context);
  assert.equal(response.status, 200); assert.equal(f.writes.authorization, 0); assert.equal(f.writes.payment, 1);
});
test('personal invoice ownership changing after preflight prevents every ledger write', async () => {
  const f = fixture({ personal: true, changedOwner: true }); const response = await f.route.POST(request(), context);
  assert.equal(response.status, 404); assert.deepEqual(f.writes, { invoice: 0, payment: 0, audit: 0, authorization: 0 });
});

for (const role of ['viewer', 'unknown-legacy-role']) {
  test(`personal invoice current ${role} cannot register a payment`, async () => {
    const f = fixture({ personal: true, role });
    assert.equal((await f.route.POST(request(), context)).status, 403);
    assert.deepEqual(f.writes, { invoice: 0, payment: 0, audit: 0, authorization: 0 });
  });
}
test('missing personal actor cannot register a payment', async () => {
  const f = fixture({ personal: true, missingActor: true });
  assert.equal((await f.route.POST(request(), context)).status, 403);
  assert.deepEqual(f.writes, { invoice: 0, payment: 0, audit: 0, authorization: 0 });
});
test('personal accountant preserves registering a payment to their invoice', async () => {
  const f = fixture({ personal: true, role: 'accountant' });
  assert.equal((await f.route.POST(request(), context)).status, 200);
  assert.equal(f.writes.payment, 1);
});

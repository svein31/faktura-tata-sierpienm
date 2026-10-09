require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), contractorId = 'c'.repeat(24), invoiceId = 'd'.repeat(24);
function fixture(existing) {
  let saved;
  const db = { companyMember: { findMany: async () => [{ companyId }] },
    invoice: { findFirst: async () => null, findUnique: async () => existing, create: async ({ data }) => (saved = { id: invoiceId, ...data }), findMany: async () => [saved], update: async ({ data }) => ({ ...existing, ...data }) },
    invoiceNumberClaim: { create: async () => ({}) }, $transaction: async callback => callback(db) };
  const membership = { role: 'employee', permissions: { canIssueInvoices: true, canRecordPayments: false, canExport: false } };
  const mocks = {
    '@/lib/auth': { getSessionUser: async () => ({ id: userId, role: 'owner', name: 'Synthetic employee', email: 'synthetic@example.invalid' }) },
    '@/lib/db': { prisma: db }, '@/lib/company-scope': { contractorForCompany: async () => true },
    '@/lib/permissions': { requireCompanyAccess: async () => ({ ok: true, membership }), getCompanyMembership: async () => membership },
    '@/lib/company-write': { companyAccess: async () => ({ role: 'employee', company: { id: companyId } }) },
    '@/lib/accounting-period': { assertAccountingPeriodsOpen: async () => {} }, '@/lib/pdf/invoice-print': { captureInvoicePrint: async () => {} },
    '@/lib/dto': { invoiceToDto: value => ({ paidAmount: 0, paymentStatus: 'unpaid', approvalStatus: 'pending', ...value }) },
    '@/lib/audit': { recordAuditLog: async () => {}, buildFieldDiff: () => ({ diff: {} }) }, '@/lib/pilot-metrics': { recordPilotEvent: async () => {} },
    '@/lib/invoice-bank-account': { invoiceBankAccountForCompany: async () => ({}) },
    '@/lib/invoice-correction-source': { resolveInvoiceCorrectionSource: async (_db, _id, body) => body },
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) { if (Object.hasOwn(mocks, request)) return mocks[request]; return originalLoad.call(this, request, parent, isMain); };
  try {
    const paths = ['../../src/app/api/invoices/route.ts', '../../src/app/api/invoices/[id]/route.ts', '../../src/app/api/invoices/approve/route.ts'].map(require.resolve);
    for (const path of paths) delete require.cache[path];
    return { create: require(paths[0]), edit: require(paths[1]), approve: require(paths[2]), saved: () => saved };
  } finally { Module._load = originalLoad; }
}
const payload = { sellerCompanyId: companyId, contractorId, number: 'QA/APPROVAL/1', type: 'purchase', status: 'issued', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2030-10-22', currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14, lines: [{ name: 'Synthetic item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }], approvalStatus: 'approved' };
const req = body => new Request('http://127.0.0.1/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('a creator with employee permissions cannot preapprove a cost through POST', async () => {
  const f = fixture();
  assert.equal((await f.create.POST(req(payload))).status, 201);
  assert.equal(f.saved().approvalStatus, 'pending');
  assert.equal((await f.approve.POST(req({ invoiceId }))).status, 403);
});
test('creating a document cannot fabricate a paid ledger or trust a client overdue status', async () => {
  for (const fields of [{ status: 'paid' }, { paidAmount: 123 }, { paymentStatus: 'paid' }, { paymentStatus: 'partially_paid' }]) {
    const f = fixture(); assert.equal((await f.create.POST(req({ ...payload, ...fields }))).status, 409); assert.equal(f.saved(), undefined);
  }
  const f = fixture(); assert.equal((await f.create.POST(req({ ...payload, paymentStatus: 'overdue' }))).status, 201);
  assert.equal(f.saved().paymentStatus, 'unpaid'); assert.equal(f.saved().paidAmount, 0);
});
test('editing a saved draft cannot convert it into an approved cost', async () => {
  const f = fixture({ id: invoiceId, sellerCompanyId: companyId, userId, type: 'sale', status: 'draft', version: 1 });
  const ctx = { params: Promise.resolve({ id: invoiceId }) };
  assert.equal((await f.edit.PUT(req({ type: 'purchase', approvalStatus: 'approved' }), ctx)).status, 409);
  assert.equal((await f.edit.PUT(req({ approvalStatus: 'approved' }), ctx)).status, 409);
});
test('accepted KSeF invoice edit accepts unchanged approval metadata and validates notes', async () => {
  const f = fixture({ id: invoiceId, sellerCompanyId: companyId, userId, type: 'sale', status: 'ksef_sent', ksefNumber: 'SYNTHETIC-KSEF', ksefStatus: 'accepted', version: 1 });
  const ctx = { params: Promise.resolve({ id: invoiceId }) };
  assert.equal((await f.edit.PUT(req({ notes: 'Poprawna notatka', approvalStatus: 'pending' }), ctx)).status, 200);
  for (const body of [{ approvalStatus: 'invalid' }, { notes: {} }, { notes: 'x'.repeat(4001) }]) assert.equal((await f.edit.PUT(req(body), ctx)).status, 400);
});

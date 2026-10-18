require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const actor = 'a'.repeat(24), company = 'b'.repeat(24), invoiceId = 'c'.repeat(24);

function loadRoute(path, mocks) {
  const filename = require.resolve(path), original = Module._load;
  Module._load = function (name, parent, isMain) {
    return Object.hasOwn(mocks, name) ? mocks[name] : original.call(this, name, parent, isMain);
  };
  try { delete require.cache[filename]; return require(filename); }
  finally { Module._load = original; }
}

test('issuing a saved draft records activation only after the business transaction commits', async () => {
  for (const scenario of ['issue', 'draft', 'proforma', 'existing-issued', 'rollback', 'unauthenticated']) {
    const events = [];
    const existing = { id: invoiceId, userId: actor, sellerCompanyId: company, number: 'SYNTHETIC/1',
      type: 'sale', status: scenario === 'existing-issued' ? 'issued' : 'draft', isProforma: false,
      issuedAt: scenario === 'existing-issued' ? new Date('2026-10-18T10:00:00Z') : null,
      version: 1, paidAmount: 0, paymentStatus: 'unpaid', totalGross: 123, issueDate: '2026-10-18' };
    const db = {
      invoice: { findUnique: async () => existing, update: async ({ data }) => ({ ...existing, ...data }) },
      companyMember: { findMany: async () => [{ companyId: company }] },
      $transaction: async callback => {
        events.push('transaction'); const result = await callback(db);
        if (scenario === 'rollback') throw Object.assign(new Error('Synthetic rollback'), { code: 'P2034' });
        events.push('committed'); return result;
      },
    };
    const route = loadRoute('../../src/app/api/invoices/[id]/route.ts', {
      '@/lib/auth': { getApiSessionUser: async () => scenario === 'unauthenticated' ? null : { id: actor } },
      '@/lib/db': { prisma: db },
      '@/lib/permissions': { getCompanyMembership: async () => ({ role: 'owner' }), requireCompanyAccess: async () => ({ ok: true }) },
      '@/lib/company-write': { companyWriteAccess: async () => {} },
      '@/lib/accounting-period': { assertAccountingPeriodsOpen: async () => {} },
      '@/lib/pdf/invoice-print': { captureInvoicePrint: async () => {} },
      '@/lib/parsers': { parseInvoiceBody: async body => body },
      '@/lib/invoice-correction-source': { resolveInvoiceCorrectionSource: async (_db, _id, body) => body },
      '@/lib/invoice-bank-account': { invoiceBankAccountForCompany: async () => ({}) },
      '@/lib/invoice-quota': { claimInvoiceQuota: async () => new Date('2026-10-18T11:00:00Z') },
      '@/lib/dto': { invoiceToDto: value => value },
      '@/lib/audit': { recordAuditLog: async () => {}, buildFieldDiff: () => ({ diff: {} }) },
      '@/lib/pilot-metrics': { recordPilotEvent: (_req, event) => events.push(event) },
    });
    const body = { ...existing, issuedAt: undefined, status: scenario === 'draft' ? 'draft' : 'issued',
      isProforma: scenario === 'proforma', dueDate: '2030-10-18' };
    const result = await route.PUT(new Request('https://example.test/api/invoices/' + invoiceId, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: invoiceId }) });
    assert.equal(result.status, scenario === 'rollback' ? 409 : scenario === 'unauthenticated' ? 401 : 200, scenario);
    assert.equal(events.includes('first_invoice'), scenario === 'issue', scenario);
    if (scenario === 'issue') assert.ok(events.indexOf('first_invoice') > events.indexOf('committed'));
  }
});

test('paid conversion excludes trials, gifts, expired access and unknown plans without changing account access', async () => {
  for (const scenario of ['paid', 'trial', 'gift', 'expired', 'unknown-plan', 'no-stripe', 'unauthenticated']) {
    const events = [];
    const record = { status: scenario === 'trial' ? 'trialing' : 'active', plan: scenario === 'unknown-plan' ? 'invalid' : 'monthly',
      stripeSubscriptionId: scenario === 'no-stripe' ? null : 'sub_synthetic',
      accessSource: scenario === 'gift' ? 'complimentary' : null,
      currentPeriodEnd: new Date(Date.now() + (scenario === 'expired' ? -60000 : 60000)) };
    const route = loadRoute('../../src/app/api/subscription/route.ts', {
      '@/lib/auth': { getSessionUser: async () => scenario === 'unauthenticated' ? null : { id: actor } },
      '@/lib/db': { prisma: { subscription: { findUnique: async () => record } } },
      '@/lib/invoice-quota': { currentInvoiceQuota: async () => ({ used: 0 }) },
      '@/lib/pilot-metrics': { recordPilotEvent: (_req, event) => events.push(event) },
    });
    const result = await route.GET(new Request('https://example.test/api/subscription'));
    assert.equal(result.status, scenario === 'unauthenticated' ? 401 : 200, scenario);
    assert.deepEqual(events, scenario === 'paid' ? ['pro'] : [], scenario);
    if (scenario === 'trial' || scenario === 'gift') assert.equal((await result.json()).subscription.isPro, true);
  }
});

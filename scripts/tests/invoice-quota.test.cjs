const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { claimInvoiceQuota, invoiceQuota, quotaMonth } = require('../../src/lib/invoice-quota.ts');

test('monthly limits use Warsaw calendar boundaries, including seasonal clock changes', () => {
  const march = quotaMonth(new Date('2026-03-31T21:59:59Z'));
  assert.equal(march.start.toISOString(), '2026-02-28T23:00:00.000Z');
  assert.equal(march.end.toISOString(), '2026-03-31T22:00:00.000Z');
  const april = quotaMonth(new Date('2026-03-31T22:00:00Z'));
  assert.equal(april.start.toISOString(), march.end.toISOString());
  assert.equal(april.end.toISOString(), '2026-04-30T22:00:00.000Z');
  const october = quotaMonth(new Date('2026-10-31T22:59:59Z'));
  assert.equal(october.end.toISOString(), '2026-10-31T23:00:00.000Z');
});

test('five free invoices across all owned companies block a sixth issue inside its transaction', async () => {
  let writes = 0, seenWhere;
  const tx = {
    companyProfile: { findUnique: async () => ({ userId: 'owner' }), findMany: async () => [{ id: 'company1' }, { id: 'company2' }] },
    subscription: { findUnique: async () => null },
    user: { update: async () => { writes++; } },
    invoice: { count: async ({ where }) => { seenWhere = where; return 5; } },
  };
  await assert.rejects(() => claimInvoiceQuota(tx, 'teammate', 'company1'), error => error.code === 'FREE_INVOICE_LIMIT');
  assert.equal(writes, 1);
  assert.deepEqual(seenWhere.OR[0].sellerCompanyId.in, ['company1', 'company2']);
  assert.equal(seenWhere.type, 'sale');
  assert.deepEqual(seenWhere.AND[0].OR, [{ isProforma: false }, { isProforma: null }, { isProforma: { isSet: false } }]);
  assert.equal((await invoiceQuota({ ...tx, invoice: { count: async () => 4 } }, 'owner')).remaining, 1);
});

test('an active nonexpired monthly or yearly plan skips the free quota', async () => {
  let count = 0, writes = 0;
  const tx = {
    companyProfile: { findUnique: async () => ({ userId: 'owner' }) },
    subscription: { findUnique: async () => ({ plan: 'yearly', status: 'active', currentPeriodEnd: new Date('2027-01-01') }) },
    user: { update: async () => { writes++; } },
    invoice: { count: async () => { count++; return 6; } },
  };
  await claimInvoiceQuota(tx, 'author', 'company', new Date('2026-09-01'));
  assert.equal(count, 0);
  assert.equal(writes, 0);
});

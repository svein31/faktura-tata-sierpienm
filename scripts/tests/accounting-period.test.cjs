require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { accountingMonth, periodKeys, assertAccountingPeriodsOpen } = require('../../src/lib/accounting-period.ts');
test('period dates reject calendar rollover and timezone ambiguity', () => {
  assert.equal(accountingMonth('2024-02-29'), '2024-02');
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-09-20T00:00:00Z', '', null]) assert.throws(() => accountingMonth(date));
});
test('moving a document locks both company-months in stable order and deduplicates', () => {
  const a = { companyId: 'a', issueDate: '2026-09-01' }, b = { companyId: 'b', issueDate: '2026-10-01' };
  assert.deepEqual(periodKeys([a, b, a]), periodKeys([b, a]));
  assert.equal(periodKeys([a, b]).length, 2);
  assert.equal(periodKeys([{ companyId: null, issueDate: null }]).length, 0);
});
test('guard writes transaction lock and fails closed on unknown or closed status', async () => {
  for (const status of ['closed', 'corrupt']) {
    const tx = { accountingPeriod: { upsert: async args => { assert.ok(args.update.operationKey); return { status }; } } };
    await assert.rejects(assertAccountingPeriodsOpen(tx, [{ companyId: 'a', issueDate: '2026-09-01' }]), /zamknięty/);
  }
});

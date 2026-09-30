require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { inventoryQuery, warehouseReadScope } = require('../../src/lib/warehouse/read-scope.ts');
const { canManageStock, normalizeRole } = require('../../src/lib/warehouse/guard.ts');
const { normalizeDocumentLines } = require('../../src/lib/warehouse/stock-engine.ts');

test('warehouse document lines reject missing, nonfinite and excessive numbers', () => {
  const line = { name: 'Test', quantity: 1, unitPriceNet: 0 };
  assert.equal(normalizeDocumentLines([line])[0].unitPriceNet, 0);
  for (const value of [NaN, Infinity, -1, null, 'abc', 1e10]) {
    assert.throws(() => normalizeDocumentLines([{ ...line, unitPriceNet: value }]));
  }
  assert.throws(() => normalizeDocumentLines(Array.from({ length: 201 }, () => line)));
});

test('warehouse writes fail closed for unknown, missing and read-only roles', () => {
  for (const role of [undefined, null, '', 'invalid', 'OWNER', 'viewer']) assert.equal(canManageStock({ role }), false);
  for (const role of ['owner', 'employee', 'accountant']) assert.equal(canManageStock({ role }), true);
  assert.equal(canManageStock(null), false);
  assert.equal(normalizeRole('unrecognized'), 'viewer');
});
test('warehouse query rejects malformed filters rather than widening the scope', () => {
  for (const filter of ['view=all', 'warehouseId=bad', 'itemId=bad', 'cursor=bad', `search=${'x'.repeat(121)}`]) {
    assert.throws(() => inventoryQuery(new URLSearchParams(filter)), error => error.status === 400);
  }
  assert.deepEqual(inventoryQuery(new URLSearchParams('search=abc&lowOnly=true')), {
    view: 'stock', warehouseId: '', itemId: '', cursor: '', search: 'abc', lowOnly: true,
  });
});
test('warehouse legacy scope stays explicitly owner-only and unassigned', async () => {
  assert.deepEqual(await warehouseReadScope('owner-id', 'legacy'), {
    userId: 'owner-id', OR: [{ companyId: null }, { companyId: { isSet: false } }],
  });
  await assert.rejects(warehouseReadScope('owner-id', null), error => error.status === 400);
  await assert.rejects(warehouseReadScope('owner-id', 'invalid'), error => error.status === 400);
});

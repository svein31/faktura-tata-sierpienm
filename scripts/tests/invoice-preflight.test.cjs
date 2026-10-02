require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { assessInvoice } = require('../../src/lib/invoice-preflight.ts');
const valid = { number: 'FV/1', issueDate: '2026-10-02', saleDate: '2026-10-02', dueDate: '2026-10-16', currency: 'PLN', gross: 123, seller: { companyName: 'Firma', nip: '5260301706', street: 'Testowa 1', city: 'Warszawa', postalCode: '00-001' }, buyer: { name: 'Nabywca', nip: '5250001003', country: 'PL', street: 'Testowa 2', city: 'Warszawa', postal: '00-001' }, lines: [{ name: 'Usługa', quantity: 1, netPrice: 100, vatRate: '23' }] };
test('complete invoice passes preflight; invalid calendar and NaN values block issuance', () => {
  assert.deepEqual(assessInvoice(valid), []);
  for (const patch of [{ issueDate: '2026-02-30' }, { currency: 'bad' }, { buyer: { ...valid.buyer, nip: '1234567890' } }, { lines: [{ ...valid.lines[0], quantity: NaN }] }]) assert.ok(assessInvoice({ ...valid, ...patch }).some(i => i.severity === 'error'));
});
test('MPP amount alone is a warning, foreign identifier is not validated as Polish NIP', () => {
  assert.equal(assessInvoice({ ...valid, gross: 15000 }).some(i => i.code === 'mpp'), false);
  assert.equal(assessInvoice({ ...valid, gross: 15000.01 }).find(i => i.code === 'mpp').severity, 'warning');
  assert.equal(assessInvoice({ ...valid, buyer: { ...valid.buyer, country: 'DE', nip: 'DE123456789', taxIdType: 'vat_eu' } }).some(i => i.code === 'buyer.nip'), false);
});

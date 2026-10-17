require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { correctionDifferenceLines } = require('../../src/lib/invoice-correction-lines.ts');
const { invoiceTotals } = require('../../src/lib/format.ts');
const { normalizeInvoiceLineAmounts } = require('../../src/lib/invoice-input.ts');
const line = { id: 'source-0', name: 'Usługa Łódź', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' };

test('desired final quantity produces a refund delta without changing the original', () => {
  const original = [structuredClone(line)];
  const before = structuredClone(original);
  const delta = correctionDifferenceLines(original, [{ ...line, quantity: 0.5 }]);
  assert.equal(invoiceTotals({ lines: delta }).gross, -61.5);
  assert.deepEqual(original, before);
  assert.equal(delta[0].quantity, -1);
  assert.equal(delta[1].quantity, 0.5);
  assert.equal(new Set(delta.map(item => item.id)).size, delta.length);
});

test('price and VAT changes preserve separate negative old and positive new tax groups', () => {
  const delta = correctionDifferenceLines([line], [{ ...line, netPrice: 80, vatRate: '8' }]);
  assert.deepEqual(invoiceTotals({ lines: delta }), { net: -20, vat: -16.6, gross: -36.6, vatByRate: { 23: -23, 8: 6.4 } });
});

test('zero quantity or removing a row refunds it; adding a row increases only the difference', () => {
  assert.equal(invoiceTotals({ lines: correctionDifferenceLines([line], [{ ...line, quantity: 0 }]) }).gross, -123);
  assert.equal(invoiceTotals({ lines: correctionDifferenceLines([line], []) }).gross, -123);
  const added = { ...line, id: 'new', name: 'Nowa usługa', quantity: 2, netPrice: 10 };
  const delta = correctionDifferenceLines([line], [line, added]);
  assert.equal(delta.length, 1);
  assert.equal(invoiceTotals({ lines: delta }).gross, 24.6);
});

test('unchanged positions permit a formal correction with zero financial effect', () => {
  const delta = correctionDifferenceLines([line], [structuredClone(line)]);
  assert.equal(delta.length, 2);
  assert.ok(delta.every(item => item.quantity !== 0));
  assert.equal(invoiceTotals({ lines: delta }).gross, 0);
});

test('fractional quantities, half-up prices and multiple VAT groups reconcile final minus original', () => {
  const before = [line, { ...line, id: 'source-1', quantity: 0.123456, netPrice: 99.99, vatRate: '8' }];
  const after = [{ ...line, quantity: 0.3333333, netPrice: 1.005 }, { ...before[1], quantity: 0.234567, vatRate: '5' }];
  const oldTotals = invoiceTotals({ lines: before.map(normalizeInvoiceLineAmounts) });
  const newTotals = invoiceTotals({ lines: after.map(normalizeInvoiceLineAmounts) });
  const delta = invoiceTotals({ lines: correctionDifferenceLines(before, after) });
  for (const key of ['net', 'vat', 'gross']) assert.equal(Math.round(delta[key] * 100), Math.round(newTotals[key] * 100) - Math.round(oldTotals[key] * 100));
});

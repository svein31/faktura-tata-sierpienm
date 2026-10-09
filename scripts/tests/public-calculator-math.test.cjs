require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { parseGrosz, calculateVat, formatPlnCents } = require('../../src/lib/seo/calculator-math.ts');

test('public calculator parses Polish amounts exactly and rejects malformed or overflowing input', () => {
  for (const [input, cents] of [['100', 10000], ['1 234,56', 123456], ['0,01', 1], ['90071992547409.91', Number.MAX_SAFE_INTEGER]]) {
    assert.equal(parseGrosz(input), cents, input);
  }
  for (const input of ['', '-1', 'Infinity', '1e3', '<script>', 'ą', '1.234', '1,2,3', '90071992547409.92', '9'.repeat(500)]) {
    assert.equal(parseGrosz(input), null, input);
  }
});

test('public VAT calculator rounds in grosze with exact intermediate arithmetic', () => {
  assert.deepEqual(calculateVat(10000, 'net', 23), { net: 10000, vat: 2300, gross: 12300 });
  assert.deepEqual(calculateVat(10000, 'gross', 23), { net: 8130, vat: 1870, gross: 10000 });
  assert.deepEqual(calculateVat(10, 'net', 5), { net: 10, vat: 1, gross: 11 });
  assert.deepEqual(calculateVat(6007199254700015, 'net', 23), { net: 6007199254700015, vat: 1381655828581003, gross: 7388855083281018 });
  for (const cents of [0, 1, 7, 10, 10000, 6007199254700015, Number.MAX_SAFE_INTEGER]) {
    for (const rate of [0, 5, 8, 23]) {
      for (const direction of ['net', 'gross']) {
        const result = calculateVat(cents, direction, rate);
        const amount = BigInt(cents);
        const net = direction === 'net' ? amount : (amount * 100n + BigInt(Math.floor((100 + rate) / 2))) / BigInt(100 + rate);
        const gross = direction === 'gross' ? amount : amount + (amount * BigInt(rate) + 50n) / 100n;
        if (gross > BigInt(Number.MAX_SAFE_INTEGER)) assert.equal(result, null);
        else assert.deepEqual(result, { net: Number(net), vat: Number(gross - net), gross: Number(gross) });
      }
    }
  }
});

test('public calculator rejects unsafe results and displays exact cents at the accepted limit', () => {
  assert.equal(calculateVat(Number.MAX_SAFE_INTEGER, 'net', 23), null);
  assert.equal(calculateVat(null, 'net', 23), null);
  assert.equal(calculateVat(-1, 'net', 23), null);
  assert.equal(calculateVat(100, 'net', 22), null);
  assert.equal(formatPlnCents(9007199254700015).replace(/\s/g, ''), '90071992547000,15zł');
  assert.equal(formatPlnCents(0).replace(/\s/g, ''), '0,00zł');
});

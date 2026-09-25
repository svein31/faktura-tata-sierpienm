require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextFormattedInvoiceNumber, parseInvoicePattern, DEFAULT_INVOICE_PATTERN } = require('../../src/lib/invoice-numbering.ts');

test('monthly numbering resets only for a different month within the same company', () => {
  const numbers = ['FV 01/07/2026', 'FV 02/07/2026'];
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-07-31', 'FV'), 'FV 03/07/2026');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-08-01', 'FV'), 'FV 01/08/2026');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2027-07-01', 'FV'), 'FV 01/07/2027');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-07-31', 'KOR'), 'KOR 01/07/2026');
});

test('yearly and custom formats continue from persisted numbers', () => {
  assert.equal(nextFormattedInvoiceNumber('NN/RRRR', ['01/2026', '05/2026'], '2026-09-25', 'FV'), '06/2026');
  assert.equal(nextFormattedInvoiceNumber('FA-{NNNN}-{YYYY}', ['FA-0002-2026'], '2026-09-25', 'FV'), 'FA-0003-2026');
  assert.throws(() => parseInvoicePattern('FV/{YYYY}'), /licznik/);
  assert.throws(() => parseInvoicePattern('FV/{UNKNOWN}/{NN}'), /Nieznany/);
});

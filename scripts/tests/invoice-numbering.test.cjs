require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextFormattedInvoiceNumber, parseInvoicePattern, DEFAULT_INVOICE_PATTERN } = require('../../src/lib/invoice-numbering.ts');
const { accountConflictsWithAnotherCompany } = require('../../src/lib/company-bank-account-scope.ts');
const { defaultCompanyBankAccount } = require('../../src/lib/company-default-bank-account.ts');
const { invoicePatternFromExample, INVOICE_NUMBER_PRESETS } = require('../../src/lib/invoice-numbering.ts');

test('monthly numbering resets only for a different month within the same company', () => {
  const numbers = ['FV 01/07/2026', 'FV 02/07/2026'];
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-07-31', 'FV'), 'FV 03/07/2026');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-08-01', 'FV'), 'FV 01/08/2026');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2027-07-01', 'FV'), 'FV 01/07/2027');
  assert.equal(nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, numbers, '2026-07-31', 'KOR'), 'KOR 01/07/2026');
});

test('daily, ISO weekly and patterns without a year retain unique counters', () => {
  assert.equal(nextFormattedInvoiceNumber('{DD}/{MM}/{YYYY}/{NN}', ['25/09/2026/02'], '2026-09-25', 'FV'), '25/09/2026/03');
  assert.equal(nextFormattedInvoiceNumber('{DD}/{MM}/{YYYY}/{NN}', ['25/09/2026/02'], '2026-09-26', 'FV'), '26/09/2026/01');
  assert.equal(nextFormattedInvoiceNumber('{MM}/{NN}', ['09/07'], '2027-09-01', 'FV'), '09/08');
  assert.equal(nextFormattedInvoiceNumber('{GGGG}/{WW}/{NN}', ['2026/53/02'], '2027-01-01', 'FV'), '2026/53/03');
  assert.equal(nextFormattedInvoiceNumber('{WW}/{NN}', ['39/04'], '2026-09-25', 'FV'), '39/05');
  for (const preset of INVOICE_NUMBER_PRESETS) assert.ok(nextFormattedInvoiceNumber(preset.pattern, [], '2026-09-25', 'FV'));
  assert.throws(() => nextFormattedInvoiceNumber(DEFAULT_INVOICE_PATTERN, [], '2026-02-31', 'FV'), /data/);
  assert.throws(() => nextFormattedInvoiceNumber('{NN}', ['9007199254740992'], '2026-09-25', 'FV'), /zakres/);
  assert.throws(() => parseInvoicePattern('A'.repeat(50) + '{N}'), /50 znaków/);
});

test('custom company names stay literal and only the selected fragment becomes a counter', () => {
  const pattern = invoicePatternFromExample('ANNA-SUMMER 007/2026', 0);
  assert.equal(pattern, 'ANNA-SUMMER {NNN}/2026');
  assert.equal(nextFormattedInvoiceNumber(pattern, ['ANNA-SUMMER 007/2026'], '2026-09-25', 'FV'), 'ANNA-SUMMER 008/2026');
  assert.throws(() => invoicePatternFromExample('ABC', 0), /fragment/);
});

test('default bank selection respects company and invoice currency', () => {
  const accounts = [
    { id: 'legacy-extra', companyId: 'enervio', currency: 'PLN', isDefault: false },
    { id: 'current-default', companyId: 'enervio', currency: 'PLN', isDefault: true },
    { id: 'eur', companyId: 'enervio', currency: 'EUR', isDefault: true },
    { id: 'other-company', companyId: 'geomatic', currency: 'PLN', isDefault: true },
  ];
  assert.equal(defaultCompanyBankAccount('enervio', accounts, 'PLN').id, 'current-default');
  assert.equal(defaultCompanyBankAccount('enervio', accounts, 'EUR').id, 'eur');
  assert.equal(defaultCompanyBankAccount('enervio', accounts, 'USD').id, 'current-default');
  assert.equal(defaultCompanyBankAccount('missing', accounts, 'PLN'), undefined);
  accounts.push({ id: 'multi', companyId: 'enervio', currency: 'MULTI', isDefault: true });
  assert.equal(defaultCompanyBankAccount('enervio', accounts, 'USD').id, 'multi');
});

test('yearly and custom formats continue from persisted numbers', () => {
  assert.equal(nextFormattedInvoiceNumber('NN/RRRR', ['01/2026', '05/2026'], '2026-09-25', 'FV'), '06/2026');
  assert.equal(nextFormattedInvoiceNumber('FA-{NNNN}-{YYYY}', ['FA-0002-2026'], '2026-09-25', 'FV'), 'FA-0003-2026');
  assert.throws(() => parseInvoicePattern('FV/{YYYY}'), /licznik/);
  assert.throws(() => parseInvoicePattern('FV/{UNKNOWN}/{NN}'), /Nieznany/);
});

test('bank accounts are isolated by company, including legacy duplicate entries', () => {
  const profiles = [
    { id: 'enervio', companyName: 'ENERVIO SP. Z O.O.', bankAccount: 'PL91 1090 1753 0000 0000 1619 9007' },
    { id: 'geomatic', companyName: 'GEOMATIC', bankAccount: '35 1090 1753 0000 0000 1619 9004' },
  ];
  assert.equal(accountConflictsWithAnotherCompany('enervio', 'PL35109017530000000016199004', profiles), true);
  assert.equal(accountConflictsWithAnotherCompany('enervio', '91 1090 1753 0000 0000 1619 9007', profiles), false);
  assert.equal(accountConflictsWithAnotherCompany('enervio', 'PL00 0000 0000 0000 0000 0000 0000', profiles, 'GEOMATIC'), true);
});

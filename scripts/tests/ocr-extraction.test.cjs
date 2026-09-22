require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { ocrNumber, extractOcrFields } = require('../../src/lib/ocr-extraction.ts');
test('OCR amount parsing handles decimal separators without inventing amounts', () => {
  assert.equal(ocrNumber('1 234,56 PLN'), 1234.56); assert.equal(ocrNumber('1.234,56'), 1234.56); assert.equal(ocrNumber('1,234.56'), 1234.56);
  assert.equal(ocrNumber('1,2,3'), null); assert.equal(ocrNumber('Razem 100'), null); assert.equal(ocrNumber('NaN'), null);
});
test('labelled OCR fields keep source evidence, seller scope, ambiguity and unknown confidence', () => {
  const result = extractOcrFields(['Faktura VAT nr FV/12/2026\nSprzedawca: Firma A\nNIP: 526-030-17-06\nNabywca: Firma B\nNIP: 5250001003\nData wystawienia: 20.09.2026\nWaluta: PLN\nRazem netto: 100,00\nRazem VAT: 23,00\nRazem brutto: 123,00\nDo zapłaty: 80,00', 'Razem brutto: 124,00']);
  assert.equal(result.fields.number[0].value, 'FV/12/2026'); assert.equal(result.fields.nip.length, 1); assert.equal(result.fields.nip[0].value, '5260301706');
  assert.equal(result.fields.issueDate[0].value, '2026-09-20'); assert.equal(result.fields.totalGross.length, 2);
  assert.equal(result.fields.totalGross[1].page, 2); assert.equal(result.fields.totalGross[1].confidence, null);
  assert.equal(result.confidence, null); assert.ok(result.warnings.length);
});
test('OCR table extraction requires explicit net, VAT amounts and gross columns', () => {
  const result = extractOcrFields(['Nazwa\tIlość\tJm\tWartość netto\tKwota VAT\tWartość brutto\nUsługa\t2\tszt.\t100,00\t23,00\t123,00\nRazem\t2\t\t100,00\t23,00\t123,00']);
  assert.equal(result.lines.length, 1); assert.equal(result.lines[0].name, 'Usługa'); assert.equal(result.lines[0].totalVat, 23); assert.equal(result.lines[0].source.line, 2);
  assert.equal(extractOcrFields(['Nazwa  Ilość  Netto  VAT %  Brutto\nUsługa  2  100  23  123']).lines.length, 0, 'VAT rate must never be mistaken for VAT amount');
});

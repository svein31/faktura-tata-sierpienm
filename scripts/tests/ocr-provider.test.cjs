require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { parseOcrResponse } = require('../../src/lib/ocr-provider.ts');
const { reviewLines } = require('../../src/lib/document-inbox.ts');
test('OCR rejects partial, empty and oversized responses instead of approving partial text', () => {
  const valid = { OCRExitCode: '1', IsErroredOnProcessing: false, ParsedResults: [{ FileParseExitCode: '1', ParsedText: 'Faktura VAT nr FV/1' }] };
  assert.equal(parseOcrResponse(valid).extraction.fields.number[0].value, 'FV/1');
  for (const response of [null, {}, { ...valid, OCRExitCode: 2 }, { ...valid, ParsedResults: [] }, { ...valid, ParsedResults: [...valid.ParsedResults, { FileParseExitCode: 0, ParsedText: 'partial' }] }, { ...valid, ParsedResults: [{ FileParseExitCode: 1, ParsedText: ' ' }] }, { ...valid, ParsedResults: [{ FileParseExitCode: 1, ParsedText: 'x'.repeat(100001) }] }]) assert.throws(() => parseOcrResponse(response));
});
test('reviewed lines reconcile amounts and reject invalid data without trusting OCR metadata', () => {
  const totals = { totalNet: 100, totalVat: 23, totalGross: 123 };
  const row = { name: 'Usługa', unit: 'szt.', quantity: 2, ...totals, confidence: 100, source: 'untrusted' };
  assert.deepEqual(reviewLines([row], totals), [{ name: 'Usługa', unit: 'szt.', quantity: 2, ...totals }]);
  assert.equal(reviewLines(undefined, totals), undefined);
  assert.deepEqual(reviewLines([], totals), []);
  for (const patch of [{ quantity: 0 }, { quantity: Infinity }, { totalNet: '100' }, { totalVat: -1 }, { totalGross: 125 }, { unit: '' }]) assert.throws(() => reviewLines([{ ...row, ...patch }], totals));
  assert.throws(() => reviewLines([row], { ...totals, totalGross: 246 }));
  assert.throws(() => reviewLines(Array(201).fill(row), totals));
});

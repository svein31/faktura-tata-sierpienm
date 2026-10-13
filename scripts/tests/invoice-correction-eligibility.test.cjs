require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { correctionOriginalKsefNumber, isCorrectableInvoiceSource } = require('../../src/lib/invoice-correction-eligibility.ts');

const issued = { type: 'sale', status: 'issued', documentStatus: 'issued', documentKind: 'vat', isProforma: false };

test('ordinary issued invoices and proven stale document drafts remain correctable', () => {
  assert.equal(isCorrectableInvoiceSource(issued), true);
  assert.equal(isCorrectableInvoiceSource({ ...issued, documentStatus: null }), true);
  assert.equal(isCorrectableInvoiceSource({ ...issued, documentStatus: 'draft' }), false);
  for (const issuedAt of [new Date('2026-10-01T10:00:00Z'), '2026-10-01T10:00:00Z'])
    assert.equal(isCorrectableInvoiceSource({ ...issued, documentStatus: 'draft', issuedAt }), true);
});

test('persisted scalar and legacy JSON numbers recover accepted originals with stale draft fields', () => {
  for (const reference of [{ ksefNumber: '  QA-KSEF  ' }, { ksef: { number: '  QA-LEGACY  ', status: 'ACTIVE' } }]) {
    for (const fields of [{ status: 'draft' }, { documentStatus: 'draft' }, { status: 'draft', documentStatus: 'draft' }])
      assert.equal(isCorrectableInvoiceSource({ ...issued, ...fields, ...reference }), true);
  }
});

test('missing, blank and non-string references never turn a genuine draft into an accepted source', () => {
  const draft = { ...issued, status: 'draft', documentStatus: 'draft', issuedAt: new Date() };
  for (const fields of [
    {}, { ksefNumber: null }, { ksefNumber: '' }, { ksefNumber: ' \t\n ' },
    { ksefNumber: 200 }, { ksefNumber: { number: 'fake' } },
    { ksef: null }, { ksef: 'QA-KSEF' }, { ksef: ['QA-KSEF'] },
    { ksef: { number: '' } }, { ksef: { number: '  ' } }, { ksef: { number: 200 } },
    { ksef: { number: ['QA-KSEF'] } }, { ksef: { status: 'ACTIVE' }, ksefStatus: 'accepted' },
  ]) {
    assert.equal(correctionOriginalKsefNumber({ ...draft, ...fields }), null);
    assert.equal(isCorrectableInvoiceSource({ ...draft, ...fields }), false);
  }
  assert.equal(isCorrectableInvoiceSource({ type: 'sale' }), false);
});

test('cancellation, purchase, proforma and settlement guards take precedence over any accepted number', () => {
  for (const fields of [
    { status: 'cancelled' }, { documentStatus: 'cancelled' },
    { type: 'purchase' }, { isProforma: true }, { documentKind: 'advance' }, { documentKind: 'final' },
  ]) {
    for (const reference of [{ ksefNumber: 'QA-KSEF' }, { ksef: { number: 'QA-LEGACY' } }])
      assert.equal(isCorrectableInvoiceSource({ ...issued, ...fields, ...reference }), false);
  }
});

test('canonical nonempty reference wins, legacy fallback is strict, and source records remain unchanged', () => {
  const source = Object.freeze({ ...issued, ksefNumber: ' QA-CANONICAL ', ksef: Object.freeze({ number: 'QA-LEGACY' }) });
  assert.equal(correctionOriginalKsefNumber(source), 'QA-CANONICAL');
  assert.equal(isCorrectableInvoiceSource(source), true);
  assert.equal(source.ksefNumber, ' QA-CANONICAL ');
  for (const ksefNumber of ['', '  ', null, undefined, 200])
    assert.equal(correctionOriginalKsefNumber({ ksefNumber, ksef: { number: ' QA-LEGACY ' } }), 'QA-LEGACY');
});

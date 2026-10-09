require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module'), originalLoad = Module._load;
let permitted = true, checked = [];
Module._load = function(request, parent, main) {
  if (request === '@/lib/permissions') return { requireCompanyAccess: async (...args) => {
    checked.push(args); return permitted ? { ok: true } : { ok: false, status: 403, error: 'Denied' };
  } };
  return originalLoad.call(this, request, parent, main);
};
const { resolveInvoiceCorrectionSource } = require('../../src/lib/invoice-correction-source.ts');
Module._load = originalLoad;
const actor = 'a'.repeat(24), company = 'b'.repeat(24), sourceId = 'c'.repeat(24);
const source = { id: sourceId, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued', documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'FV/1', issueDate: '2026-10-01', ksefNumber: 'real-ksef-number', lines: [{ name: 'Usługa', quantity: 1, netPrice: 100, vatRate: '23' }] };
const body = { isCorrection: true, originalInvoiceId: sourceId, sellerCompanyId: company, type: 'sale', currency: 'PLN', issueDate: '2026-10-08' };
const db = value => ({ invoice: { findUnique: async () => value } });

test('linked corrections use actual authorised source metadata instead of forged snapshots', async () => {
  permitted = true; checked = [];
  const resolved = await resolveInvoiceCorrectionSource(db(source), actor, { ...body, originalInvoiceNumber: 'fake', originalIssueDate: '1900-01-01', originalKsefNumber: 'fake', originalLines: [] });
  assert.equal(resolved.originalInvoiceNumber, source.number);
  assert.equal(resolved.originalIssueDate, source.issueDate);
  assert.equal(resolved.originalKsefNumber, source.ksefNumber);
  assert.deepEqual(resolved.originalLines, source.lines);
  assert.deepEqual(checked, [[actor, company, 'canCreateCorrections']]);
});

test('revoked company access and another actor legacy source are indistinguishable from a missing source', async () => {
  permitted = false;
  for (const record of [null, source, { ...source, documentKind: 'advance' }, { ...source, sellerCompanyId: null, userId: 'd'.repeat(24) }])
    await assert.rejects(resolveInvoiceCorrectionSource(db(record), actor, body), error => error.status === 404 && error.message === 'Nie znaleziono dostępnej faktury do skorygowania.');
  permitted = true;
});

test('correction source rejects self-reference, wrong seller/currency, draft and unsupported settlement sources', async () => {
  await assert.rejects(resolveInvoiceCorrectionSource(db(source), actor, body, sourceId), error => error.status === 400);
  for (const patch of [{ sellerCompanyId: 'd'.repeat(24) }, { currency: 'EUR' }, { issueDate: '2026-09-30' }, { type: 'purchase' }, { isProforma: true }, { isRecurring: true }])
    await assert.rejects(resolveInvoiceCorrectionSource(db(source), actor, { ...body, ...patch }), error => error.status === 400);
  for (const patch of [{ status: 'draft' }, { documentStatus: 'cancelled' }, { isProforma: true }, { type: 'purchase' }])
    await assert.rejects(resolveInvoiceCorrectionSource(db({ ...source, ...patch }), actor, body), error => error.status === 409);
  for (const documentKind of ['advance', 'final'])
    await assert.rejects(resolveInvoiceCorrectionSource(db({ ...source, documentKind }), actor, body), error => error.status === 400);
});

test('unlinked external corrections and normal invoices do not read unrelated source data', async () => {
  const unread = { invoice: { findUnique: async () => { throw new Error('Unexpected read'); } } };
  const normal = { isCorrection: false, originalInvoiceId: sourceId };
  assert.equal(await resolveInvoiceCorrectionSource(unread, actor, normal), normal);
  const external = { isCorrection: true, originalInvoiceNumber: 'PAPER/1', originalIssueDate: '2026-10-01' };
  assert.equal(await resolveInvoiceCorrectionSource(unread, actor, external), external);
  const legacy = { ...source, sellerCompanyId: null };
  assert.equal((await resolveInvoiceCorrectionSource(db(legacy), actor, { ...body, sellerCompanyId: null })).originalInvoiceNumber, source.number);
});

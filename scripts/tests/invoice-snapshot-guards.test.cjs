require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const { parseInvoiceBody } = require('../../src/lib/parsers.ts');
const { invoiceTotals } = require('../../src/lib/format.ts');
const { buildFinalLines } = require('../../src/lib/advance-lines.ts');
const owner = { contractorOwnedBy: async () => true, companyOwnedBy: async () => true };
const line = { id: 'line-1', name: 'Usługa', quantity: 0.004, unit: 'szt.', netPrice: 1000.01, vatRate: '23' };
const body = { number: 'TEST/1', type: 'sale', status: 'draft', contractorId: 'a'.repeat(24), sellerCompanyId: 'b'.repeat(24), currency: 'PLN', language: 'PL', paymentMethod: 'transfer', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', lines: [line] };
const correction = { ...body, isCorrection: true, correctionReason: 'Korekta ilości', originalInvoiceNumber: 'PAPER/1', originalIssueDate: '2026-10-01', lines: [{ ...line, quantity: -0.004 }] };

test('invoice line identifiers retain supported values and stop at 128 characters', async () => {
  for (const id of ['line-1', 'x'.repeat(128)]) {
    const parsed = await parseInvoiceBody({ ...body, lines: [{ ...line, id }] }, owner);
    assert.equal(parsed.lines[0].id, id);
  }
  await assert.rejects(parseInvoiceBody({ ...body, lines: [{ ...line, id: 'x'.repeat(129) }] }, owner), error => error.status === 400 && typeof error.fieldErrors['lines[0].id'] === 'string');
});

test('optional and empty original snapshots keep their previous storage semantics', async () => {
  for (const originalLines of [undefined, null]) {
    assert.equal((await parseInvoiceBody({ ...body, originalLines }, owner)).originalLines, undefined);
  }
  assert.deepEqual((await parseInvoiceBody({ ...body, originalLines: [] }, owner)).originalLines, []);
});

test('external paper snapshots preserve signed correction quantities and supported precision', async () => {
  const originalLines = [{ ...line, quantity: -0.004 }, { ...line, id: 'positive', quantity: 0.000001, netPrice: 1.01 }];
  const parsed = await parseInvoiceBody({ ...correction, originalLines }, owner);
  assert.deepEqual(parsed.originalLines, originalLines);
  assert.equal(parsed.totalGross, invoiceTotals({ lines: correction.lines }).gross);
  const withExtra = await parseInvoiceBody({ ...correction, originalLines: [{ ...originalLines[0], unusedPayload: 'x'.repeat(1000), nested: { ignored: true } }] }, owner);
  assert.deepEqual(withExtra.originalLines, [originalLines[0]]);
});

test('snapshots reject oversized lists, IDs, strings and invalid shapes even on normal invoices', async () => {
  for (const originalLines of [{}, 'not-a-list', 1, Array.from({ length: 201 }, () => line), [{ ...line, id: 'x'.repeat(129) }], [{ ...line, name: 'x'.repeat(501) }], [{ ...line, unit: 'x'.repeat(31) }], [{ ...line, quantity: 0 }], [{ ...line, quantity: Infinity }]]) {
    for (const input of [body, correction]) {
      await assert.rejects(parseInvoiceBody({ ...input, originalLines }, owner), error => error.status === 400 && typeof error.fieldErrors.originalLines === 'string');
    }
  }
});

test('original settlement snapshots retain amounts only in the existing authorized settlement parser mode', async () => {
  const order = [{ ...line, quantity: 1, netPrice: 100 }];
  const originalLines = buildFinalLines(order, [{ number: 'Z/1', lines: [{ ...line, quantity: 1, netPrice: 20, settlementNet: 20, settlementVat: 4.6 }] }]);
  await assert.rejects(parseInvoiceBody({ ...body, originalLines }, owner), error => error.status === 400);
  const parsed = await parseInvoiceBody({ ...body, originalLines }, { ...owner, allowSettlementLines: true });
  assert.deepEqual(parsed.originalLines, originalLines);
  assert.equal(invoiceTotals({ lines: parsed.originalLines }).gross, invoiceTotals({ lines: originalLines }).gross);
});

test('a valid snapshot resolved from an authorized original remains valid through invoice parsing', async t => {
  const resolverPath = require.resolve('../../src/lib/invoice-correction-source.ts'), cached = require.cache[resolverPath];
  const originalLoad = Module._load, permissionCalls = [];
  delete require.cache[resolverPath];
  Module._load = function(request, parent, main) {
    if (request === '@/lib/permissions') return { requireCompanyAccess: async (...args) => { permissionCalls.push(args); return { ok: true }; } };
    return originalLoad.call(this, request, parent, main);
  };
  let resolveInvoiceCorrectionSource;
  try { ({ resolveInvoiceCorrectionSource } = require(resolverPath)); }
  finally { Module._load = originalLoad; }
  t.after(() => { if (cached) require.cache[resolverPath] = cached; else delete require.cache[resolverPath]; });
  const sourceId = 'c'.repeat(24), userId = 'd'.repeat(24);
  const source = { id: sourceId, userId, sellerCompanyId: body.sellerCompanyId, type: 'sale', status: 'issued', documentStatus: 'issued', documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'ORIGINAL/1', issueDate: '2026-10-01', ksefNumber: 'actual-ksef', lines: [line] };
  const resolved = await resolveInvoiceCorrectionSource({ invoice: { findUnique: async () => source } }, userId, { ...correction, originalInvoiceId: sourceId, originalLines: [{ forged: 'metadata' }] });
  const parsed = await parseInvoiceBody(resolved, owner);
  assert.deepEqual(parsed.originalLines, source.lines);
  assert.equal(parsed.originalInvoiceNumber, source.number);
  assert.equal(parsed.originalKsefNumber, source.ksefNumber);
  assert.deepEqual(permissionCalls, [[userId, body.sellerCompanyId, 'canCreateCorrections']]);
});

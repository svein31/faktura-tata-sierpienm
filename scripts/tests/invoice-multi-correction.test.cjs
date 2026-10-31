require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '../..');
const { correctionDifferenceLines } = require('../../src/lib/invoice-correction-lines.ts');
const {
  effectiveCorrectionLines,
  editableCorrectionTargetLines,
  correctionLineLabel,
} = require('../../src/lib/invoice-correction-chain.ts');
const { invoiceTotals } = require('../../src/lib/format.ts');
const { isStaleMigratedBankAccount } = require('../../src/lib/company-bank-account-scope.ts');
const { ksefPresentation } = require('../../src/lib/ksef/presentation.ts');
const { round2 } = require('../../src/lib/tax/money.ts');

const fv01LinesNoId = [
  { id: undefined, name: 'Usługa budowlano-montażowa etap 1', quantity: 1, unit: 'usł.', netPrice: 50000, vatRate: '23' },
  { id: undefined, name: 'Usługa geodezyjna etap 2', quantity: 1, unit: 'usł.', netPrice: 27930, vatRate: '23' },
];

const kor01PriceChangeLines = [
  { id: undefined, name: 'Usługa budowlano-montażowa etap 1', quantity: -1, unit: 'usł.', netPrice: 50000, vatRate: '23', beforeCorrection: true },
  { id: undefined, name: 'Usługa budowlano-montażowa etap 1', quantity: 1, unit: 'usł.', netPrice: 40004.04, vatRate: '23', beforeCorrection: false },
];

const kor02FullOriginalZeroLines = [
  { id: undefined, name: 'Usługa budowlano-montażowa etap 1', quantity: -1, unit: 'usł.', netPrice: 50000, vatRate: '23', beforeCorrection: true },
  { id: undefined, name: 'Usługa geodezyjna etap 2', quantity: -1, unit: 'usł.', netPrice: 27930, vatRate: '23', beforeCorrection: true },
];

test('multi-position correction without line IDs keeps both positions and subtracts remaining 83 558,87 PLN instead of 95 853,90 PLN', () => {
  const fvTotals = invoiceTotals({ lines: fv01LinesNoId });
  assert.equal(fvTotals.gross, 95853.9);

  const kor01Totals = invoiceTotals({ lines: kor01PriceChangeLines });
  assert.equal(kor01Totals.gross, -12295.03);

  const effectiveAfterKor01 = effectiveCorrectionLines(fv01LinesNoId, [{ lines: kor01PriceChangeLines }]);
  assert.equal(effectiveAfterKor01.length, 2);
  assert.equal(invoiceTotals({ lines: effectiveAfterKor01 }).gross, 83558.87);

  const editable = editableCorrectionTargetLines(effectiveAfterKor01, fv01LinesNoId);
  assert.equal(editable.length, 2);

  const zeroedTarget = editable.map(line => ({ ...line, quantity: 0 }));
  const deltaLines = correctionDifferenceLines(effectiveAfterKor01, zeroedTarget);
  assert.equal(deltaLines.length, 2, 'Zeroing 2 remaining positions must emit exactly 2 delta rows without dropping position 2');
  assert.equal(invoiceTotals({ lines: deltaLines }).gross, -83558.87);
});

test('over-corrected KSeF chain (95 853,90 - 12 295,03 - 95 853,90 = -12 295,03) defaults to 0 target and produces +12 295,03 balancing correction', () => {
  const effectiveAfterKor02 = effectiveCorrectionLines(fv01LinesNoId, [
    { lines: kor01PriceChangeLines },
    { lines: kor02FullOriginalZeroLines },
  ]);
  const cumulativeTotals = invoiceTotals({ lines: effectiveAfterKor02 });
  assert.equal(cumulativeTotals.gross, -12295.03);

  const targetLines = editableCorrectionTargetLines(effectiveAfterKor02, fv01LinesNoId);
  assert.equal(targetLines.length, 2);
  assert.ok(targetLines.every(line => line.quantity === 0));

  const kor03Delta = correctionDifferenceLines(effectiveAfterKor02, targetLines);
  const kor03Totals = invoiceTotals({ lines: kor03Delta });
  assert.equal(kor03Totals.net, 9995.96);
  assert.equal(kor03Totals.vat, 2299.07);
  assert.equal(kor03Totals.gross, 12295.03);

  // Verify final cumulative ledger across FV 01 + KOR 01 + KOR 02 + KOR 03 equals 0.00
  const fvTotals = invoiceTotals({ lines: fv01LinesNoId });
  const kor01Totals = invoiceTotals({ lines: kor01PriceChangeLines });
  const kor02Totals = invoiceTotals({ lines: kor02FullOriginalZeroLines });
  assert.equal(round2(fvTotals.net + kor01Totals.net + kor02Totals.net + kor03Totals.net), 0);
  assert.equal(round2(fvTotals.vat + kor01Totals.vat + kor02Totals.vat + kor03Totals.vat), 0);
  assert.equal(round2(fvTotals.gross + kor01Totals.gross + kor02Totals.gross + kor03Totals.gross), 0);

  // Positive balancing row is clearly labelled instead of looking like a duplicate before-row
  const positiveReversal = kor03Delta.find(line => String(line.id).startsWith('correction-before-') && line.quantity > 0);
  assert.equal(correctionLineLabel(positiveReversal), 'korekta wyrównująca');
});

test('resolveInvoiceCorrectionSource walks back from KOR 02 to root FV 01 and excludes edited KOR 03 from prior chain', async () => {
  const originalLoad = Module._load;
  Module._load = function (request, parent, main) {
    if (request === '@/lib/permissions') {
      return { requireCompanyAccess: async () => ({ ok: true }) };
    }
    return originalLoad.call(this, request, parent, main);
  };
  try {
    const sourceModPath = path.join(root, 'src/lib/invoice-correction-source.ts');
    delete require.cache[sourceModPath];
    const { resolveInvoiceCorrectionSource, invoiceCorrectionContext } = require(sourceModPath);

    const actor = 'a'.repeat(24);
    const company = 'b'.repeat(24);
    const fv01Id = '1'.repeat(24);
    const kor01Id = '2'.repeat(24);
    const kor02Id = '3'.repeat(24);
    const kor03Id = '4'.repeat(24);

    const records = new Map([
      [fv01Id, {
        id: fv01Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'FV 01/10/2026', issueDate: '2026-10-01',
        ksefNumber: '7011253524-20261001-ROOT', totalGross: 95853.9, lines: fv01LinesNoId, isCorrection: false, originalInvoiceId: null,
      }],
      [kor01Id, {
        id: kor01Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 01/10/2026', issueDate: '2026-10-19',
        createdAt: new Date('2026-10-19T10:00:00Z'), ksefNumber: '7011253524-20261019-KOR1', ksefStatus: 'ACCEPTED',
        totalNet: -9995.96, totalVat: -2299.07, totalGross: -12295.03, lines: kor01PriceChangeLines, isCorrection: true, originalInvoiceId: fv01Id,
      }],
      [kor02Id, {
        id: kor02Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 02/10/2026', issueDate: '2026-10-19',
        createdAt: new Date('2026-10-31T18:00:00Z'), ksefNumber: '7011253524-20261031-KOR2', ksefStatus: 'ACCEPTED',
        totalNet: -77930, totalVat: -17923.9, totalGross: -95853.9, lines: kor02FullOriginalZeroLines, isCorrection: true, originalInvoiceId: fv01Id,
      }],
      [kor03Id, {
        id: kor03Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 03/10/2026', issueDate: '2026-10-31',
        createdAt: new Date('2026-10-31T18:30:00Z'), ksefNumber: null, ksefStatus: null,
        totalNet: -67934.04, totalVat: -15624.83, totalGross: -83558.87, lines: [], isCorrection: true, originalInvoiceId: fv01Id,
      }],
    ]);

    const db = {
      invoice: {
        findUnique: async ({ where }) => records.get(where.id) || null,
        findMany: async () => Array.from(records.values()),
      },
    };

    const resolved = await resolveInvoiceCorrectionSource(
      db,
      actor,
      { isCorrection: true, originalInvoiceId: kor02Id, sellerCompanyId: company, type: 'sale', currency: 'PLN', issueDate: '2026-10-31' },
      kor03Id,
    );
    assert.equal(resolved.originalInvoiceId, fv01Id);
    assert.equal(resolved.originalInvoiceNumber, 'FV 01/10/2026');
    assert.equal(resolved.originalKsefNumber, '7011253524-20261001-ROOT');

    const ctx = await invoiceCorrectionContext(db, records.get(fv01Id), kor03Id);
    assert.equal(ctx.priorCorrections.length, 2);
    assert.equal(ctx.effectiveGross, -12295.03);
  } finally {
    Module._load = originalLoad;
  }
});

test('stale auto-migrated Konto podstawowe is ignored in favour of current company primary bankAccount', async () => {
  const companyId = 'a'.repeat(24);
  const staleId = 'b'.repeat(24);
  const customId = 'c'.repeat(24);
  const enervioPrimary = '91109017530000000161990007';

  const staleAccount = {
    id: staleId,
    companyId,
    accountName: 'Konto podstawowe',
    beneficiaryName: 'ENERVIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    bankName: 'Rachunek bieżący',
    accountNumber: '35109017530000000161990045',
    currency: 'PLN',
    isDefault: true,
  };
  const customAccount = {
    id: customId,
    companyId,
    accountName: 'Rachunek pomocniczy EUR',
    beneficiaryName: 'ENERVIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    bankName: 'Santander',
    accountNumber: '11109017530000000161990099',
    currency: 'EUR',
    isDefault: false,
  };

  assert.equal(isStaleMigratedBankAccount(staleAccount, enervioPrimary), true);
  assert.equal(isStaleMigratedBankAccount(customAccount, enervioPrimary), false);

  const companyRecord = {
    id: companyId,
    userId: 'd'.repeat(24),
    companyName: 'ENERVIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    bankAccount: enervioPrimary,
    bankAccounts: [staleAccount, customAccount],
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@/lib/db') {
      return {
        prisma: {
          companyProfile: {
            findUnique: async () => companyRecord,
            findMany: async () => [companyRecord],
          },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const bankModPath = path.join(root, 'src/lib/invoice-bank-account.ts');
    delete require.cache[bankModPath];
    const { invoiceBankAccountForCompany } = require(bankModPath);

    // Explicit stale migrated ID heals to primary account
    const healed = await invoiceBankAccountForCompany(companyId, staleId, 'PLN');
    assert.equal(healed.bankAccountId, null);
    assert.equal(healed.bankAccountSnapshot.accountNumber, enervioPrimary);

    // Default selection for PLN also ignores stale migrated default and uses primary account
    const autoSelected = await invoiceBankAccountForCompany(companyId, null, 'PLN');
    assert.equal(autoSelected.bankAccountId, null);
    assert.equal(autoSelected.bankAccountSnapshot.accountNumber, enervioPrimary);
  } finally {
    Module._load = originalLoad;
  }
});

test('DELETE /api/invoices/[id] allows unsent local KOR 03 and rejects KSeF-accepted KOR 02', async () => {
  const originalLoad = Module._load;
  const actor = 'c'.repeat(24);
  const company = 'a'.repeat(24);
  const invoiceId = '5'.repeat(24);
  let currentInvoice = null;
  let deleted = 0;

  const db = {
    $transaction: async cb => cb(db),
    companySecurityPolicy: { findUnique: async () => null, findMany: async () => [] },
    accountingPeriod: { upsert: async () => ({ status: 'open' }) },
    invoiceSettlement: { count: async () => 0 },
    invoiceNumberClaim: { deleteMany: async () => ({ count: 1 }) },
    invoice: {
      findUnique: async () => currentInvoice,
      findMany: async () => [currentInvoice],
      count: async () => 0,
      updateMany: async () => ({ count: 1 }),
      delete: async () => { deleted++; },
    },
    companyProfile: {
      findUnique: async () => ({ id: company, userId: actor, updatedAt: new Date('2026-01-01T00:00:00Z') }),
      aggregateRaw: async () => [{
        company: { id: company, userId: actor, companyName: 'ENERVIO', nip: '7011253524' },
        members: [],
        policies: [],
        mfaEnabled: false,
      }],
      update: async () => ({}),
    },
    companyMember: { findUnique: async () => null, findMany: async () => [] },
    paymentRecord: { findMany: async () => [] },
  };

  Module._load = function (request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@/lib/db') return { prisma: db };
    if (request === '@/lib/auth') return {
      getSessionUser: async () => ({ id: actor, name: 'Michał', email: 'm@example.com' }),
      getApiSessionUser: async () => ({ id: actor, name: 'Michał', email: 'm@example.com' }),
    };
    if (request === '@/lib/dto') return { invoiceToDto: v => v };
    if (request === '@/lib/audit') return { buildFieldDiff: () => ({ diff: [] }), recordAuditLog: async () => {} };
    if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(path.join(root, 'src'))) delete require.cache[key];
    }
    const route = require(path.join(root, 'src/app/api/invoices/[id]/route.ts'));

    // Unsent local KOR 03 ("Zapisana") can be deleted
    currentInvoice = {
      id: invoiceId,
      userId: actor,
      sellerCompanyId: company,
      type: 'sale',
      isCorrection: true,
      number: 'KOR 03/10/2026',
      issueDate: '2026-10-31',
      currency: 'PLN',
      status: 'issued',
      documentStatus: 'issued',
      issuedAt: new Date('2026-10-31T18:30:00Z'),
      ksefNumber: null,
      ksefStatus: null,
      referenceNumber: null,
      sentAt: null,
      paidAmount: 0,
      payments: [],
      version: 1,
    };
    const okRes = await route.DELETE(new Request('http://localhost/api'), { params: { id: invoiceId } });
    assert.equal(okRes.status, 200);
    assert.equal(deleted, 1);

    // KSeF-accepted KOR 02 cannot be deleted
    currentInvoice = {
      ...currentInvoice,
      number: 'KOR 02/10/2026',
      ksefNumber: '7011253524-20261031-KOR2',
      ksefStatus: 'ACCEPTED',
    };
    const blockedRes = await route.DELETE(new Request('http://localhost/api'), { params: { id: invoiceId } });
    assert.equal(blockedRes.status, 400);
    assert.equal(deleted, 1);
  } finally {
    Module._load = originalLoad;
  }
});

test('ksefPresentation distinguishes local draft ("Szkic") from issued unsent document ("Zapisana")', () => {
  assert.equal(ksefPresentation({ type: 'sale', status: 'draft' }).label, 'Szkic');
  assert.equal(ksefPresentation({ type: 'sale', status: 'issued' }).label, 'Zapisana');
});

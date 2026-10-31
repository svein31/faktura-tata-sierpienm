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

test('exact ENERVIO production chain (renamed KOR 01 row + 0,00 PLN rows in KOR 02 + unsent KOR 03) produces 2-row +12 295,03 PLN FA(3) balancing correction', async () => {
  const { buildFa3Xml, validateFa3Xml } = require('../../src/lib/ksef/xmlBuilder.ts');
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
    const { invoiceCorrectionContext } = require(sourceModPath);

    const actor = 'a'.repeat(24);
    const company = 'b'.repeat(24);
    const fv01Id = '6abe2978bb3b6afc2e08681b';
    const kor01Id = '2'.repeat(24);
    const kor02Id = '3'.repeat(24);
    const kor03UnsentId = '4'.repeat(24);

    const realFv01Lines = [
      { name: 'Przygotowanie ROOŚ dla obiektu Leszkowice/Pęcław', quantity: 1, unit: 'szt.', netPrice: 49980, vatRate: '23' },
      { name: 'Złożenie dokumentacji środowiskowej do gminy', quantity: 1, unit: 'szt.', netPrice: 27950, vatRate: '23' },
    ];
    const realKor01Lines = [
      { name: 'Przygotowanie ROOŚ dla obiektu Leszkowice/Pęcław', quantity: -1, unit: 'szt.', netPrice: 49980, vatRate: '23' },
      { name: 'Przygotowanie ROOŚ dla obiektu Leszkowice/Pęcław - płatność 80%', quantity: 1, unit: 'szt.', netPrice: 39984.04, vatRate: '23' },
    ];
    const realKor02Lines = [
      { name: 'Przygotowanie ROOŚ dla obiektu Leszkowice/Pęcław', quantity: -1, unit: 'szt.', netPrice: 49980, vatRate: '23' },
      { name: 'Przygotowanie ROOŚ dla obiektu Leszkowice/Pęcław', quantity: 1, unit: 'szt.', netPrice: 0, vatRate: '23' },
      { name: 'Złożenie dokumentacji środowiskowej do gminy', quantity: -1, unit: 'szt.', netPrice: 27950, vatRate: '23' },
      { name: 'Złożenie dokumentacji środowiskowej do gminy', quantity: 1, unit: 'szt.', netPrice: 0, vatRate: '23' },
    ];

    const records = new Map([
      [fv01Id, {
        id: fv01Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'FV 01/10/2026', issueDate: '2026-10-01',
        ksefNumber: '7011253524-20261001-519CDDC00000-92', totalGross: 95853.9, lines: realFv01Lines, isCorrection: false, originalInvoiceId: null,
      }],
      [kor01Id, {
        id: kor01Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 01/10/2026', issueDate: '2026-10-19',
        createdAt: new Date('2026-10-19T10:00:00Z'), ksefNumber: '7011253524-20261019-644A7C400006-1C', ksefStatus: 'accepted',
        totalNet: -9995.96, totalVat: -2299.07, totalGross: -12295.03, lines: realKor01Lines, isCorrection: true, originalInvoiceId: fv01Id,
      }],
      [kor02Id, {
        id: kor02Id, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 02/10/2026', issueDate: '2026-10-19',
        createdAt: new Date('2026-10-31T18:00:00Z'), ksefNumber: '7011253524-20261031-8928BE800002-44', ksefStatus: 'accepted',
        totalNet: -77930, totalVat: -17923.9, totalGross: -95853.9, lines: realKor02Lines, isCorrection: true, originalInvoiceId: fv01Id,
      }],
      [kor03UnsentId, {
        id: kor03UnsentId, userId: actor, sellerCompanyId: company, type: 'sale', status: 'issued', documentStatus: 'issued',
        documentKind: 'standard', isProforma: false, currency: 'PLN', number: 'KOR 03/10/2026', issueDate: '2026-10-31',
        createdAt: new Date('2026-10-31T18:30:00Z'), ksefNumber: null, ksefStatus: null, referenceNumber: null,
        totalNet: -67934.04, totalVat: -15624.83, totalGross: -83558.87, lines: [], isCorrection: true, originalInvoiceId: fv01Id,
      }],
    ]);

    const db = {
      invoice: {
        findUnique: async ({ where }) => records.get(where.id) || null,
        findMany: async () => Array.from(records.values()),
      },
    };

    // Even when creating a brand-new correction (no currentId), unsent local KOR 03 is NOT in KSeF circulation!
    const ctx = await invoiceCorrectionContext(db, records.get(fv01Id));
    assert.equal(ctx.priorCorrections.length, 2);
    assert.equal(ctx.unsentCorrections.length, 1);
    assert.equal(ctx.unsentCorrections[0].number, 'KOR 03/10/2026');
    assert.equal(ctx.effectiveGross, -12295.03);

    const targetLines = editableCorrectionTargetLines(ctx.effectiveLines, realFv01Lines);
    const kor03BalancingLines = correctionDifferenceLines(ctx.effectiveLines, targetLines);
    assert.equal(kor03BalancingLines.length, 2, '0,00 PLN rows from KOR 02 must not create extra ghost rows on KOR 03');
    const kor03Totals = invoiceTotals({ lines: kor03BalancingLines });
    assert.equal(kor03Totals.net, 9995.96);
    assert.equal(kor03Totals.vat, 2299.07);
    assert.equal(kor03Totals.gross, 12295.03);

    // Validate generated FA(3) XML for KSeF submission
    const xml = buildFa3Xml({
      invoice: {
        id: 'newkor03',
        number: 'KOR 03/10/2026',
        type: 'sale',
        status: 'issued',
        currency: 'PLN',
        language: 'PL',
        issueDate: '2026-10-31',
        saleDate: '2026-10-31',
        dueDate: '2026-11-14',
        paymentMethod: 'transfer',
        paymentTermDays: 14,
        contractorId: 'ctr1',
        isCorrection: true,
        correctionReason: 'Korekta błędnie wystawionej korekty KOR 02/10/2026',
        originalInvoiceNumber: 'FV 01/10/2026',
        originalIssueDate: '2026-10-01',
        originalKsefNumber: '7011253524-20261001-519CDDC00000-92',
        lines: kor03BalancingLines,
        createdAt: '2026-10-31T21:00:00Z',
      },
      seller: {
        id: company,
        userId: actor,
        companyName: 'ENERVIO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
        nip: '7011253524',
        street: 'Czapliniecka 60',
        postal: '97-400',
        city: 'Bełchatów',
        country: 'PL',
        bankAccount: '91109017530000000161990007',
        isDefault: true,
        createdAt: '',
        updatedAt: '',
      },
      buyer: {
        id: 'ctr1',
        name: 'GALIA GREEN POWER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
        nip: '7011195376',
        address: { street: 'Poznańska 37', postal: '00-689', city: 'Warszawa', country: 'PL' },
        isVatPayer: true,
        createdAt: '',
      },
    });
    const validation = validateFa3Xml(xml);
    assert.equal(validation.ok, true, JSON.stringify(validation.issues));
    assert.ok(xml.includes('<P_15>12295.03</P_15>'));
    assert.ok(xml.includes('<NrKSeFFaKorygowanej>7011253524-20261001-519CDDC00000-92</NrKSeFFaKorygowanej>'));
  } finally {
    Module._load = originalLoad;
  }
});

test('setting Cena netto = 0 on existing positive positions zeroes them without doubling 2 rows into 4', () => {
  const before = [
    { id: '1', name: 'Przygotowanie ROOŚ', quantity: 1, unit: 'szt.', netPrice: 49980, vatRate: '23' },
    { id: '2', name: 'Złożenie dokumentacji', quantity: 1, unit: 'szt.', netPrice: 27950, vatRate: '23' },
  ];
  const afterWithZeroPrice = before.map(line => ({ ...line, netPrice: 0 }));
  const delta = correctionDifferenceLines(before, afterWithZeroPrice);
  assert.equal(delta.length, 2);
  assert.equal(invoiceTotals({ lines: delta }).gross, -95853.9);
});

test('correction invoices themselves do not expose Koryguj action, while root sales invoices do', () => {
  const { isCorrectableInvoiceSource } = require('../../src/lib/invoice-correction-eligibility.ts');
  const rootIssued = { type: 'sale', status: 'issued', documentStatus: 'issued', isProforma: false, isCorrection: false, ksefNumber: '7011253524-ROOT' };
  const korIssued = { ...rootIssued, isCorrection: true, ksefNumber: '7011253524-KOR1' };
  const korLocal = { ...rootIssued, isCorrection: true, ksefNumber: null };
  assert.equal(isCorrectableInvoiceSource(rootIssued), true);
  assert.equal(isCorrectableInvoiceSource(korIssued), false);
  assert.equal(isCorrectableInvoiceSource(korLocal), false);
});

test('two-way Netto <-> Brutto unit price helpers convert accurately across VAT rates', () => {
  const { unitGrossFromNet, unitNetFromGross } = require('../../src/lib/invoice-input.ts');
  for (const [net, gross, rate] of [
    [49980, 61475.4, '23'],
    [27950, 34378.5, '23'],
    [39984.04, 49180.37, '23'],
    [9995.96, 12295.03, '23'],
    [100, 108, '8'],
    [250, 250, 'zw'],
  ]) {
    assert.equal(unitGrossFromNet(net, rate), gross);
    assert.equal(unitNetFromGross(gross, rate), net);
  }
});

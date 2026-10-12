require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { captureInvoicePrint, currentPrintContext, printInvoiceData } = require('../../src/lib/pdf/invoice-print.ts');
const { companyProfileToDto, contractorToDto, invoiceToDto } = require('../../src/lib/dto.ts');

const company = {
  id: 'b'.repeat(24), userId: 'a'.repeat(24), nip: '5260301706', companyName: 'Sprzedawca',
  street: 'Długa', buildingNumber: '1', flatNumber: '2', city: 'Łódź', postalCode: '00-001',
  bankAccount: 'PL001234', invoiceNumberPattern: 'FV/{YYYY}/{NNN}', isDefault: true,
  ksefToken: 'must-never-be-archived', ksefEnvironment: 'test', logoUrl: '/logo.png',
  createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date('2026-10-02T10:00:00Z'),
};
const contractor = {
  id: 'c'.repeat(24), companyId: company.id, name: 'Nabywca', nip: '5250001003',
  address: { street: 'Krótka 2', city: 'Warszawa', postal: '00-002', country: 'PL' },
  isVatPayer: true, createdAt: new Date('2026-10-01T10:00:00Z'),
};
const invoice = {
  id: 'd'.repeat(24), userId: company.userId, sellerCompanyId: company.id, contractorId: contractor.id,
  number: 'FV/2026/1', type: 'sale', status: 'issued', documentStatus: 'issued', documentKind: 'vat',
  currency: 'PLN', language: 'PL', issueDate: '2026-10-10', saleDate: '2026-10-10', dueDate: '2026-10-24',
  paymentMethod: 'transfer', paymentTermDays: 14, version: 1,
  lines: [{ id: 'line-1', name: 'Usługa', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }],
  bankAccountSnapshot: { accountNumber: 'PL001234', currency: 'PLN', bankName: 'Bank' },
  createdAt: new Date('2026-10-10T10:00:00Z'),
};
const template = { id: 'e'.repeat(24), companyId: company.id, version: 3, config: { accentColor: '#123456', footerText: 'Stopka', layout: 'compact' } };
const cloneJson = value => JSON.parse(JSON.stringify(value));

function transaction({ freshCompany = company, archivedContext = null, versions = [], rejectCompanyRead = false } = {}) {
  let context = archivedContext;
  const savedVersions = new Map(versions.map(version => [version.id, version]));
  const calls = { companyUnique: [], companyFirst: [], contractor: [], setting: [], template: [], contextRead: 0, contextCreate: 0, versionRead: 0, versionCreate: 0 };
  const tx = {
    companyProfile: {
      findUnique: async args => { calls.companyUnique.push(args); assert.equal(rejectCompanyRead, false, 'Snapshot reuse must skip the company reread'); return freshCompany; },
      findFirst: async args => { calls.companyFirst.push(args); assert.equal(rejectCompanyRead, false, 'Snapshot reuse must skip the default company reread'); return freshCompany; },
    },
    contractor: { findUnique: async args => { calls.contractor.push(args); return contractor; } },
    pdfTemplateSetting: { findUnique: async args => { calls.setting.push(args); return { id: freshCompany.id, templateId: template.id }; } },
    pdfTemplateVersion: { findFirst: async args => { calls.template.push(args); return template; } },
    invoicePrintContext: {
      findUnique: async () => { calls.contextRead++; return context; },
      create: async ({ data }) => { calls.contextCreate++; assert.equal(context, null); context = cloneJson(data); return context; },
    },
    invoicePrintVersion: {
      findUnique: async ({ where }) => { calls.versionRead++; return savedVersions.get(where.id) || null; },
      create: async ({ data }) => { calls.versionCreate++; const version = cloneJson(data); savedVersions.set(version.id, version); return version; },
    },
  };
  return { tx, calls, context: () => context };
}

function expectedContext(profile = company) {
  const companyDto = companyProfileToDto(profile);
  delete companyDto.ksefToken;
  delete companyDto.ksefTokenSet;
  return cloneJson({ company: companyDto, contractor: contractorToDto(contractor), config: template.config, templateId: template.id, templateVersion: template.version });
}

test('same-transaction seller profile preserves exact archived JSON, source hash and version ID without bank relation data', async () => {
  const bankAccounts = [{ id: 'f'.repeat(24), accountNumber: 'unused-relation-account', credential: 'unused-bank-relation-secret' }];
  const previous = transaction();
  const previousVersion = await captureInvoicePrint(previous.tx, { ...invoice, sellerCompany: { ...company, bankAccounts } });
  const optimized = transaction({ rejectCompanyRead: true });
  const snapshot = { ...company };
  const optimizedVersion = await captureInvoicePrint(optimized.tx, { ...invoice, sellerCompany: snapshot }, 'issued', snapshot);

  assert.equal(JSON.stringify(optimized.context()), JSON.stringify(previous.context()));
  assert.deepEqual(optimized.context(), { id: invoice.id, companyId: company.id, captureReason: 'issued', data: expectedContext() });
  assert.equal(JSON.stringify(optimizedVersion), JSON.stringify(previousVersion));
  const invoiceData = printInvoiceData(invoiceToDto(invoice));
  const sourceHash = createHash('sha256').update(JSON.stringify({ layout: 4, context: expectedContext(), invoice: invoiceData })).digest('hex');
  const versionId = createHash('sha256').update(`${invoice.id}:${sourceHash}`).digest('hex').slice(0, 24);
  assert.equal(optimizedVersion.sourceHash, sourceHash);
  assert.equal(optimizedVersion.id, versionId);
  assert.deepEqual(optimizedVersion.invoiceData.bankAccountSnapshot, invoice.bankAccountSnapshot);
  assert.equal(JSON.stringify(optimized.context()).includes('must-never-be-archived'), false);
  assert.equal(JSON.stringify(optimized.context()).includes('unused-bank-relation'), false);
  assert.equal(previous.calls.companyUnique.length, 1);
  assert.equal(optimized.calls.companyUnique.length + optimized.calls.companyFirst.length, 0);
  assert.deepEqual(optimized.calls.contractor, [{ where: { id: contractor.id } }]);
  assert.deepEqual(optimized.calls.setting, [{ where: { id: company.id } }]);
  assert.deepEqual(optimized.calls.template, [{ where: { id: template.id, companyId: company.id } }]);

  const bankRichSnapshot = transaction({ rejectCompanyRead: true });
  const bankRichVersion = await captureInvoicePrint(bankRichSnapshot.tx, invoice, 'issued', { ...snapshot, bankAccounts });
  assert.equal(JSON.stringify(bankRichSnapshot.context()), JSON.stringify(optimized.context()));
  assert.equal(JSON.stringify(bankRichVersion), JSON.stringify(optimizedVersion));
});

test('a mismatched seller snapshot reads the invoice seller and archives the fresh profile', async () => {
  const freshCompany = { ...company, companyName: 'Aktualny sprzedawca', updatedAt: new Date('2026-10-10T11:00:00Z') };
  const state = transaction({ freshCompany });
  await captureInvoicePrint(state.tx, invoice, 'issued', { ...company, id: 'f'.repeat(24), companyName: 'Inna firma' });
  assert.deepEqual(state.calls.companyUnique, [{ where: { id: invoice.sellerCompanyId } }]);
  assert.deepEqual(state.calls.companyFirst, []);
  assert.deepEqual(state.context().data, expectedContext(freshCompany));
});

test('a null invoice seller keeps the default company read even when a snapshot is supplied', async () => {
  const state = transaction();
  const legacyInvoice = { ...invoice, sellerCompanyId: null };
  await captureInvoicePrint(state.tx, legacyInvoice, 'issued', company);
  assert.deepEqual(state.calls.companyUnique, []);
  assert.deepEqual(state.calls.companyFirst, [{ where: { userId: invoice.userId, isDefault: true } }]);
  assert.equal(state.context().companyId, null);
  assert.deepEqual(state.context().data, expectedContext());
});

test('legacy captures and current context read an updated profile unless explicitly given a transaction snapshot', async () => {
  const freshCompany = { ...company, companyName: 'Firma po aktualizacji', updatedAt: new Date('2026-10-10T12:00:00Z') };
  const state = transaction({ freshCompany });
  await captureInvoicePrint(state.tx, { ...invoice, sellerCompany: company }, 'legacy-first-render');
  assert.deepEqual(state.calls.companyUnique, [{ where: { id: invoice.sellerCompanyId } }]);
  assert.deepEqual(state.context().data, expectedContext(freshCompany));
  assert.equal(state.context().captureReason, 'legacy-first-render');

  const current = transaction({ freshCompany });
  assert.deepEqual(await currentPrintContext(current.tx, { ...invoice, sellerCompany: company }), expectedContext(freshCompany));
  assert.deepEqual(current.calls.companyUnique, [{ where: { id: invoice.sellerCompanyId } }]);
});

test('an existing archived context and print version stay immutable when the seller profile changes', async () => {
  const initial = transaction();
  const initialVersion = await captureInvoicePrint(initial.tx, invoice);
  const archivedContext = initial.context();
  const before = JSON.stringify(archivedContext);
  const updated = { ...company, companyName: 'Nowa nazwa', updatedAt: new Date('2026-10-10T13:00:00Z') };
  const existing = transaction({ freshCompany: updated, archivedContext, versions: [initialVersion], rejectCompanyRead: true });
  const result = await captureInvoicePrint(existing.tx, invoice, 'edited', updated);
  assert.equal(result, initialVersion);
  assert.equal(JSON.stringify(existing.context()), before);
  assert.equal(existing.calls.contextCreate, 0);
  assert.equal(existing.calls.versionCreate, 0);
  assert.equal(existing.calls.companyUnique.length + existing.calls.companyFirst.length + existing.calls.contractor.length + existing.calls.setting.length + existing.calls.template.length, 0);
});

test('draft captures are a no-op with or without a transaction snapshot', async () => {
  for (const draft of [{ ...invoice, status: 'draft', documentStatus: 'draft' }, { ...invoice, status: 'draft', documentStatus: null }]) {
    for (const snapshot of [undefined, company]) {
      const state = transaction({ rejectCompanyRead: true });
      assert.equal(await captureInvoicePrint(state.tx, draft, 'issued', snapshot), null);
      assert.equal(state.context(), null);
      assert.deepEqual(state.calls, { companyUnique: [], companyFirst: [], contractor: [], setting: [], template: [], contextRead: 0, contextCreate: 0, versionRead: 0, versionCreate: 0 });
    }
  }
});

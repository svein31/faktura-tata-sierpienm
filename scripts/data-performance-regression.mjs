import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { ObjectId } from 'mongodb';
import * as indexMigration from './migrations/018-performance-indexes.mjs';

const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const { invoiceToDto } = require('../src/lib/dto.ts');
const { invoiceBootstrapScope, invoiceContractorSearchLookup, readInvoiceSummaries } = require('../src/lib/invoice-summary.ts');
const { nextPersistedInvoiceNumber } = require('../src/lib/invoice-numbering-server.ts');
const { nextFormattedInvoiceNumber } = require('../src/lib/invoice-numbering.ts');
const { invoiceTotals } = require('../src/lib/format.ts');
const { contractorHistory } = require('../src/lib/crm.ts');
const { ksefProgress } = require('../src/lib/ksef/progress.ts');

/** Isolated real-Mongo regression: no external services or production records. */
export async function checkDataPerformance(db) {
  const suffix = randomBytes(8).toString('hex');
  const owner = await db.user.create({ data: { email: `data-owner-${suffix}@example.test`, password: 'fixture' } });
  const foreign = await db.user.create({ data: { email: `data-other-${suffix}@example.test`, password: 'fixture' } });
  const companies = [];
  const claimPrefix = [];
  try {
    for (const [userId, label, nip] of [[owner.id, 'Own', '5260301706'], [foreign.id, 'Shared', '5260301706'], [foreign.id, 'Private', '5250001003']]) {
      companies.push(await db.companyProfile.create({ data: { userId, nip, companyName: `${label} performance fixture` } }));
    }
    const [own, shared, privateCompany] = companies;
    const xml = `<Faktura>${randomBytes(16_000).toString('hex')}</Faktura>`;
    const upo = `<UPO>${randomBytes(4_000).toString('hex')}</UPO>`;
    const createData = (index, sellerCompanyId, userId = owner.id) => ({
      userId, sellerCompanyId, number: `FV ${String(index + 1).padStart(2, '0')}/10/2026`, type: index % 7 === 0 ? 'purchase' : 'sale',
      status: index % 9 === 0 ? 'paid' : 'issued', documentStatus: 'issued', contractorId: `contractor-${suffix}`,
      issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: index % 3 === 0 ? 'EUR' : 'PLN',
      lines: [{ id: String(index), name: 'Funkcja księgowa', unit: 'szt.', quantity: index + 1, netPrice: 1.25, vatRate: '23' }],
      totalNet: (index + 1) * 1.25, totalVat: (index + 1) * 0.2875, totalGross: (index + 1) * 1.5375,
      paidAmount: index % 9 === 0 ? (index + 1) * 1.5375 : 0.5,
      ksefXml: xml, upoXml: index % 4 === 0 ? upo : null, ksefNumber: `KSEF-${index}`, ksefStatus: 'accepted', ksef: { number: `KSEF-${index}`, status: 'ACCEPTED', environment: 'test', sentAt: '2026-10-08T08:00:00.000Z' },
      isRecurring: index % 5 === 0, recurringNextDate: '2026-11-08', recurringInterval: 'monthly', recurringAnchorDay: 8,
      isCorrection: index % 11 === 0, originalLines: [{ id: 'original', quantity: 1, netPrice: 2, vatRate: '23' }],
      bankAccountSnapshot: { accountNumber: '11111111111111111111111111', beneficiaryName: 'Frozen seller' },
      settlementMetadata: { sourceId: 'source', orderLines: [{ name: 'Frozen order' }], advances: [] },
    });
    await db.invoice.createMany({ data: [
      ...Array.from({ length: 60 }, (_, index) => createData(index, own.id)),
      ...Array.from({ length: 10 }, (_, index) => createData(index + 60, shared.id, foreign.id)),
      createData(70, null), createData(71, null),
      createData(72, privateCompany.id), createData(73, null, foreign.id),
    ] });
    const missing = await db.invoice.findFirst({ where: { userId: owner.id, sellerCompanyId: null }, select: { id: true } });
    await db.$runCommandRaw({ update: 'Invoice', updates: [{ q: { _id: { $oid: missing.id } }, u: { $unset: {
      sellerCompanyId: '', language: '', totalNet: '', documentStatus: '', ksefStatus: '', paidAmount: '', recurringAnchorDay: '', recurringLastError: '',
    } } }] });

    const companyIds = [own.id, shared.id];
    const baselineRows = await db.invoice.findMany({ where: { OR: [
      { userId: owner.id, OR: [{ sellerCompanyId: null }, { sellerCompanyId: { isSet: false } }] }, { sellerCompanyId: { in: companyIds } },
    ] }, include: { sellerCompany: { include: { bankAccounts: true } }, payments: true }, orderBy: { createdAt: 'desc' } });
    const baseline = baselineRows.map(invoiceToDto);
    let transferred = 0;
    const measured = { invoice: { aggregateRaw: async args => {
      const rows = await db.invoice.aggregateRaw(args); transferred += Buffer.byteLength(JSON.stringify(rows)); return rows;
    } } };
    const summaries = await readInvoiceSummaries(measured, invoiceBootstrapScope(owner.id, companyIds));
    assert.equal(summaries.length, 72, 'Finance/recurring/legacy context must keep all authorised invoices, beyond a page');
    assert.deepEqual(summaries.map(invoice => invoice.id).sort(), baseline.map(invoice => invoice.id).sort(), 'Scope must retain shared-company invoices and omit unrelated/unassigned foreign records');
    const summarised = new Map(summaries.map(invoice => [invoice.id, invoice]));
    const omitHeavy = invoice => Object.fromEntries(Object.entries(invoice).filter(([key]) => !['sellerCompany', 'payments', 'ksefXml', 'upoXml', 'detailsLoaded'].includes(key)));
    for (const original of baseline) {
      const summary = summarised.get(original.id);
      assert.deepEqual(omitHeavy(summary), omitHeavy(original), 'All editing/financial/recurring fields must survive summary projection');
      assert.deepEqual(invoiceTotals(summary), invoiceTotals(original));
      assert.deepEqual(ksefProgress(summary), ksefProgress(original), 'An archived UPO must not trigger perpetual status polling');
      assert.equal(summary.detailsLoaded, false);
      assert.equal(summary.ksefXml, null); assert.equal(summary.upoXml, null);
    }
    for (const companyId of [...companyIds, null]) {
      assert.deepEqual(contractorHistory(summaries, `contractor-${suffix}`, companyId).balances, contractorHistory(baseline, `contractor-${suffix}`, companyId).balances);
    }
    const retained = await db.invoice.findUnique({ where: { id: summaries[0].id }, include: { payments: true } });
    assert.equal(retained.ksefXml, xml, 'Original archives must remain unchanged and available through detail reads');
    assert.equal(invoiceToDto(retained).detailsLoaded, true);
    const originalRawBytes = Buffer.byteLength(JSON.stringify(baselineRows));
    const originalDtoBytes = Buffer.byteLength(JSON.stringify(baseline));
    const summaryDtoBytes = Buffer.byteLength(JSON.stringify(summaries));
    assert.ok(transferred < originalRawBytes * 0.2, 'Large archives must be removed before DB-to-server transfer');
    assert.ok(summaryDtoBytes < originalDtoBytes * 0.2, 'Large archives must be removed before browser transfer');

    // Compare real persisted aggregate with the established format across every date/series mode.
    const formats = ['{PREFIX} {NN}/{MM}/{YYYY}', '{NN}/{YYYY}', '{DD}/{MM}/{YYYY}/{NN}', '{MM}/{NN}', '{WW}/{NN}', '{GGGG}/{WW}/{NN}', 'FA/{YYYY}/{NNNN}', 'ANNA.{NNN}+{YYYY}', '{NN}'];
    const historic = ['FV 006/10/2026', 'FV 012/09/2026', 'KOR 99/10/2026', '06/2026', '08/10/2026/006', '10/006', '41/006', '2026/41/006', 'FA/2026/0006', 'ANNA.006+2026', '0006'];
    const reserved = ['FV 008/10/2026', '08/2026', '08/10/2026/008', '10/008', '41/008', '2026/41/008', 'FA/2026/0008', 'ANNA.008+2026', '0008'];
    const numberingCompany = await db.companyProfile.create({ data: { userId: owner.id, nip: '5250001003', companyName: 'Numbering parity' } });
    companies.push(numberingCompany); claimPrefix.push(`${numberingCompany.id}:`);
    await db.invoice.createMany({ data: historic.map((number, index) => ({ ...createData(index, numberingCompany.id), number })) });
    await db.invoiceNumberClaim.createMany({ data: reserved.map(number => ({ id: `${numberingCompany.id}:${number}` })) });
    let counterBytes = 0;
    const measuredNumbering = Object.fromEntries(['invoice', 'invoiceNumberClaim'].map(model => [model, { aggregateRaw: async args => {
      const rows = await db[model].aggregateRaw(args); counterBytes += Buffer.byteLength(JSON.stringify(rows)); return rows;
    } }]));
    for (const pattern of formats) {
      assert.equal(await nextPersistedInvoiceNumber(measuredNumbering, numberingCompany.id, pattern, '2026-10-08', 'FV'), nextFormattedInvoiceNumber(pattern, [...historic, ...reserved], '2026-10-08', 'FV'));
    }
    assert.ok(counterBytes < 2048, 'Every numbering request returns at most two scalar counters');
    await db.invoiceNumberClaim.create({ data: { id: `${numberingCompany.id}:9007199254740992` } });
    await assert.rejects(nextPersistedInvoiceNumber(db, numberingCompany.id, '{NN}', '2026-10-08', 'FV'), /zakres/);
    console.log(`[integration] PASS summary keeps 72 authorised invoices, financial/recurring/edit/UPO parity and original archives; raw DB bytes ${originalRawBytes} → ${transferred}, response ${originalDtoBytes} → ${summaryDtoBytes}, gzip ${gzipSync(JSON.stringify(baseline)).length} → ${gzipSync(JSON.stringify(summaries)).length}; numbering 9 patterns/reservations checked with ${counterBytes} aggregate bytes`);
    return { originalRawBytes, transferred, originalDtoBytes, summaryDtoBytes, oldGzip: gzipSync(JSON.stringify(baseline)).length, newGzip: gzipSync(JSON.stringify(summaries)).length };
  } finally {
    for (const prefix of claimPrefix) await db.invoiceNumberClaim.deleteMany({ where: { id: { startsWith: prefix } } });
    for (const user of [owner, foreign]) if (await db.user.findUnique({ where: { id: user.id } })) await db.user.delete({ where: { id: user.id } });
  }
}

/** Run on the harness's dedicated migration database before schema initialisation. */
export async function checkPerformanceIndexes(db) {
  const companyId = new ObjectId();
  const contractorId = new ObjectId();
  const marker = { _id: new ObjectId(), sellerCompanyId: companyId, number: 'PERF/KEEP', contractorId: contractorId.toHexString(), marker: 'preserve-invoice' };
  const indexName = `existing_number_${companyId.toHexString()}`;
  await db.collection('Invoice').createIndex({ sellerCompanyId: 1, number: 1 }, { name: indexName });
  await db.collection('Invoice').insertMany([marker, ...Array.from({ length: 200 }, (_, index) => ({ _id: new ObjectId(), sellerCompanyId: new ObjectId(), number: `PERF/${index}`, createdAt: new Date() }))]);
  const checkpoint = await indexMigration.plan(db);
  assert.ok(!checkpoint.indexes.some(index => index.name === 'Invoice_sellerCompanyId_number_idx'), 'Equivalent pre-existing index is preserved under its original name');
  await indexMigration.up(db, checkpoint); await indexMigration.up(db, checkpoint);
  const explained = await db.collection('Invoice').find({ sellerCompanyId: companyId, number: marker.number }).explain('executionStats');
  assert.equal(explained.executionStats.nReturned, 1);
  assert.ok(explained.executionStats.totalDocsExamined <= 1, 'Number uniqueness lookup examines one candidate instead of every invoice');
  await db.collection('Contractor').insertMany([{ _id: contractorId, name: 'Match contractor', nip: '5260301706' }, ...Array.from({ length: 200 }, (_, index) => ({ _id: new ObjectId(), name: `Unrelated contractor ${index}` }))]);
  const lookup = invoiceContractorSearchLookup();
  const joined = await db.collection('Invoice').aggregate([{ $match: { _id: marker._id } }, lookup]).toArray();
  assert.equal(joined[0].searchContractor[0].name, 'Match contractor');
  const lookupExplain = await db.collection('Invoice').aggregate([{ $match: { _id: marker._id } }, lookup]).explain('executionStats');
  const lookupStats = lookupExplain.stages.find(stage => stage.$lookup);
  assert.ok(lookupStats.indexesUsed.includes('_id_'), 'Invoice contractor search must use the foreign _id index');
  assert.ok(lookupStats.totalDocsExamined <= 1, 'Search must not scan every unrelated tenant contractor for each invoice');
  const invalid = await db.collection('Invoice').aggregate([{ $match: { _id: marker._id } }, { $set: { contractorId: 'legacy-non-object-id' } }, lookup]).toArray();
  assert.deepEqual(invalid[0].searchContractor, [], 'A legacy malformed reference must not break the complete search');
  await indexMigration.down(db, checkpoint);
  assert.deepEqual(await db.collection('Invoice').findOne({ _id: marker._id }), marker, 'Rollback preserves every invoice field');
  assert.ok((await db.collection('Invoice').listIndexes().toArray()).some(index => index.name === indexName), 'Rollback retains an equivalent pre-existing index');
  await indexMigration.up(db, await indexMigration.plan(db));
  console.log('[integration] PASS additive performance indexes up/up/down/up preserve documents/existing indexes; number and contractor lookups each examine 1 of 201 fixture records');
}

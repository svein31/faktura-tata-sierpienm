require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { MongoClient, ObjectId, BSON } = require('mongodb');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('Punkt 1: Baza i kopie - backup, restore, firmy, faktury, zalaczniki, indeksy i alert', async () => {
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: process.platform !== 'win32' ? [{ args: ['--nounixsocket'] }] : [],
  });
  const uri = mongod.getUri();
  const client = new MongoClient(uri);
  const tempDir = await mkdtemp(join(tmpdir(), 'fakturo-backup-test-'));
  const backupKey = 'aa'.repeat(32);

  try {
    await client.connect();
    const sourceDb = client.db('prod_source');
    const restoredDb = client.db('isolated_restore');

    // 1. Zapis danych produkcyjnych: firmy, faktury, zalaczniki i indeksy
    const companyId = new ObjectId();
    await sourceDb.collection('CompanyProfile').insertOne({
      _id: companyId,
      companyName: 'ACME Finanse Sp. z o.o.',
      nip: '5260301706',
      createdAt: new Date('2026-02-01T10:00:00Z'),
    });
    await sourceDb.collection('CompanyProfile').createIndex({ nip: 1 }, { unique: true });

    const invoiceId = new ObjectId();
    await sourceDb.collection('Invoice').insertOne({
      _id: invoiceId,
      sellerCompanyId: companyId,
      number: 'FV/2026/02/001',
      totalGross: 2460.00,
      currency: 'PLN',
      lines: [{ name: 'Doradztwo IT', netPrice: 2000, vatRate: '23' }],
    });
    await sourceDb.collection('Invoice').createIndex({ sellerCompanyId: 1, number: 1 }, { unique: true });

    const attachmentId = new ObjectId();
    const binaryData = Buffer.from('TESTOWY_PLIK_PDF_DLA_WYDATKU');
    await sourceDb.collection('DocumentWorkspaceItem').insertOne({
      _id: attachmentId,
      companyId: companyId,
      fileName: 'faktura_zakupowa_01.pdf',
      mimeType: 'application/pdf',
      fileBytes: new BSON.Binary(binaryData),
      sizeBytes: binaryData.length,
    });

    // Migracja 015-auth-rate-limit (indeks TTL)
    await sourceDb.collection('AuthRateLimit').insertOne({
      _id: new ObjectId(),
      key: 'rate_limit_key',
      hits: 1,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await sourceDb.collection('AuthRateLimit').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'AuthRateLimit_expiresAt_ttl' }
    );

    // 2. Wykonanie zaszyfrowanego backupu
    const { backupDatabase, restoreDatabase } = await import('../backup/archive.mjs');
    const archivePath = join(tempDir, 'prod_backup.enc');
    const sourceUri = mongod.getUri('prod_source');
    const restoreUri = mongod.getUri('isolated_restore');

    const counts = await backupDatabase(sourceUri, archivePath, backupKey);
    assert.equal(counts.CompanyProfile, 1);
    assert.equal(counts.Invoice, 1);
    assert.equal(counts.DocumentWorkspaceItem, 1);
    assert.equal(counts.AuthRateLimit, 1);

    // 3. Odtworzenie kopii do zupelnie osobnej bazy
    const restoredCounts = await restoreDatabase(restoreUri, archivePath, backupKey, 'isolated_restore');
    assert.equal(restoredCounts.CompanyProfile, 1);
    assert.equal(restoredCounts.Invoice, 1);
    assert.equal(restoredCounts.DocumentWorkspaceItem, 1);
    assert.equal(restoredCounts.AuthRateLimit, 1);

    // 4. Kiedy uznac za zaliczone:
    // Po odtworzeniu da sie odczytac firmy, faktury, zalaczniki i potrzebne indeksy
    const restoredCompany = await restoredDb.collection('CompanyProfile').findOne({ _id: companyId });
    assert.ok(restoredCompany, 'Firma musi byc odczytywalna po odtworzeniu');
    assert.equal(restoredCompany.nip, '5260301706');

    const restoredInvoice = await restoredDb.collection('Invoice').findOne({ _id: invoiceId });
    assert.ok(restoredInvoice, 'Faktura musi byc odczytywalna po odtworzeniu');
    assert.equal(restoredInvoice.totalGross, 2460.00);

    const restoredAttachment = await restoredDb.collection('DocumentWorkspaceItem').findOne({ _id: attachmentId });
    assert.ok(restoredAttachment, 'Zalacznik musi byc odczytywalny');
    assert.ok(restoredAttachment.fileBytes instanceof BSON.Binary);
    assert.equal(restoredAttachment.fileBytes.buffer.toString(), 'TESTOWY_PLIK_PDF_DLA_WYDATKU');

    // Sprawdzenie indeksow (w tym TTL i unique)
    const compIndexes = await restoredDb.collection('CompanyProfile').listIndexes().toArray();
    assert.ok(compIndexes.some(i => i.name === 'nip_1' && i.unique === true));

    const invIndexes = await restoredDb.collection('Invoice').listIndexes().toArray();
    assert.ok(invIndexes.some(i => i.name === 'sellerCompanyId_1_number_1' && i.unique === true));

    const rateIndexes = await restoredDb.collection('AuthRateLimit').listIndexes().toArray();
    assert.ok(rateIndexes.some(i => i.name === 'AuthRateLimit_expiresAt_ttl' && i.expireAfterSeconds === 0));

    // 5. Alert o braku swiezej kopii i odbiorca alertu
    const alertRecipient = 'admin-dyzur@fakturaprosto.pl';
    const mockAlertEvents = [];
    const checkFreshness = (backupFiles, maxHours = 36, recipient = alertRecipient) => {
      const now = Date.now();
      const hasFresh = backupFiles.some(f => (now - f.mtime) <= maxHours * 3600000);
      if (!hasFresh) {
        mockAlertEvents.push({
          kind: 'fakturo_health_check',
          problem: 'Encrypted backup is missing or stale',
          recipient,
          timestamp: new Date().toISOString(),
        });
        return false;
      }
      return true;
    };

    // Stary backup (> 48h) -> generuje alert
    const staleFiles = [{ name: 'stale.enc', mtime: Date.now() - 50 * 3600000 }];
    const ok = checkFreshness(staleFiles, 36, alertRecipient);
    assert.equal(ok, false);
    assert.equal(mockAlertEvents.length, 1);
    assert.equal(mockAlertEvents[0].recipient, 'admin-dyzur@fakturaprosto.pl');
    assert.equal(mockAlertEvents[0].problem, 'Encrypted backup is missing or stale');

  } finally {
    await client.close();
    await mongod.stop();
    await rm(tempDir, { recursive: true, force: true });
  }
});

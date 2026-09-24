import assert from 'node:assert/strict';
import { MongoClient, BSON, ObjectId } from 'mongodb';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase, restoreDatabase } from './archive.mjs';
export async function backupDrill(isolatedUri) {
  const client = new MongoClient(isolatedUri), directory = await mkdtemp(join(tmpdir(), 'backup-drill-'));
  const uriFor = name => { const uri = new URL(isolatedUri); uri.pathname = '/' + name; return uri.toString(); };
  const key = '44'.repeat(32), source = client.db('backup_source'), restored = client.db('backup_restored');
  try {
    await client.connect();
    const document = { _id: new ObjectId(), issued: new Date('2026-01-01T00:00:00Z'), amount: BSON.Decimal128.fromString('123.45'), long: BSON.Long.fromString('9007199254740993'), data: new BSON.Binary(Buffer.from('PDF bytes')), nested: { text: 'Zażółć gęślą', empty: null } };
    await source.collection('documents').insertOne(document); await source.collection('documents').createIndex({ issued: 1 }, { name: 'by_date' });
    
    // Explicit business collections verified during recovery: companies, invoices, attachments, TTL indexes
    const companyDoc = { _id: new ObjectId(), companyName: 'Faktura Test Sp. z o.o.', nip: '5260301706', createdAt: new Date('2026-01-01') };
    await source.collection('CompanyProfile').insertOne(companyDoc);
    await source.collection('CompanyProfile').createIndex({ nip: 1 });

    const invoiceDoc = { _id: new ObjectId(), number: 'FV/2026/01/01', sellerCompanyId: companyDoc._id, totalGross: 1230.50, lines: [{ name: 'Usługa', net: 1000 }] };
    await source.collection('Invoice').insertOne(invoiceDoc);
    await source.collection('Invoice').createIndex({ sellerCompanyId: 1, number: 1 }, { unique: true });

    const attachmentDoc = { _id: new ObjectId(), fileName: 'faktura_kosztowa.pdf', fileBytes: new BSON.Binary(Buffer.from('PDF-CONTENT-SAMPLE')), sizeBytes: 18 };
    await source.collection('DocumentWorkspaceItem').insertOne(attachmentDoc);

    const rateLimitDoc = { _id: new ObjectId(), key: 'auth_attempt_key', hits: 3, expiresAt: new Date(Date.now() + 60000) };
    await source.collection('AuthRateLimit').insertOne(rateLimitDoc);
    await source.collection('AuthRateLimit').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'AuthRateLimit_expiresAt_ttl' });

    await source.createCollection('empty');
    const archive = join(directory, 'backup.enc');
    const backedUp = await backupDatabase(uriFor('backup_source'), archive, key);
    assert.equal(backedUp.CompanyProfile, 1);
    assert.equal(backedUp.Invoice, 1);
    assert.equal(backedUp.DocumentWorkspaceItem, 1);
    assert.equal(backedUp.AuthRateLimit, 1);

    const restoredCounts = await restoreDatabase(uriFor('backup_restored'), archive, key, 'backup_restored');
    assert.equal(restoredCounts.CompanyProfile, 1);
    assert.equal(restoredCounts.Invoice, 1);
    assert.equal(restoredCounts.DocumentWorkspaceItem, 1);
    assert.equal(restoredCounts.AuthRateLimit, 1);

    assert.equal(BSON.EJSON.stringify(await restored.collection('documents').findOne({}), { relaxed: false }), BSON.EJSON.stringify(document, { relaxed: false }));
    assert.ok((await restored.collection('documents').listIndexes().toArray()).some(i => i.name === 'by_date'));

    // Verify companies, invoices, binary attachments, and indexes are fully readable in restored database
    const restoredCompany = await restored.collection('CompanyProfile').findOne({ nip: '5260301706' });
    assert.ok(restoredCompany && restoredCompany.companyName === 'Faktura Test Sp. z o.o.');

    const restoredInvoice = await restored.collection('Invoice').findOne({ number: 'FV/2026/01/01' });
    assert.ok(restoredInvoice && restoredInvoice.totalGross === 1230.50);

    const restoredAttachment = await restored.collection('DocumentWorkspaceItem').findOne({ fileName: 'faktura_kosztowa.pdf' });
    assert.ok(restoredAttachment && restoredAttachment.fileBytes instanceof BSON.Binary);
    assert.equal(restoredAttachment.fileBytes.buffer.toString(), 'PDF-CONTENT-SAMPLE');

    const restoredIndexes = await restored.collection('AuthRateLimit').listIndexes().toArray();
    assert.ok(restoredIndexes.some(i => i.name === 'AuthRateLimit_expiresAt_ttl' && i.expireAfterSeconds === 0));

    await assert.rejects(restoreDatabase(uriFor('backup_restored'), archive, key, 'backup_restored'), /empty database/);
    await assert.rejects(backupDatabase(uriFor('backup_source'), archive, key));
    await assert.rejects(restoreDatabase(uriFor('backup_rejected'), archive, '55'.repeat(32), 'backup_rejected'));
    const corrupt = await readFile(archive); corrupt[25] ^= 1; const damaged = join(directory, 'damaged.enc'); await writeFile(damaged, corrupt);
    await assert.rejects(restoreDatabase(uriFor('backup_rejected'), damaged, key, 'backup_rejected'));
    assert.equal((await client.db('backup_rejected').listCollections().toArray()).length, 0);
    assert.equal(await source.collection('documents').countDocuments(), 1);
    console.log('[integration] PASS encrypted backup and isolated restore: companies, invoices, attachments, indexes, BSON types, corruption, wrong key');
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
}

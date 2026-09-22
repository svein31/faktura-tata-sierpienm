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
    await source.createCollection('empty');
    const archive = join(directory, 'backup.enc');
    assert.deepEqual(await backupDatabase(uriFor('backup_source'), archive, key), { documents: 1, empty: 0 });
    assert.deepEqual(await restoreDatabase(uriFor('backup_restored'), archive, key, 'backup_restored'), { documents: 1, empty: 0 });
    assert.equal(BSON.EJSON.stringify(await restored.collection('documents').findOne({}), { relaxed: false }), BSON.EJSON.stringify(document, { relaxed: false }));
    assert.ok((await restored.collection('documents').listIndexes().toArray()).some(i => i.name === 'by_date'));
    await assert.rejects(restoreDatabase(uriFor('backup_restored'), archive, key, 'backup_restored'), /empty database/);
    await assert.rejects(backupDatabase(uriFor('backup_source'), archive, key));
    await assert.rejects(restoreDatabase(uriFor('backup_rejected'), archive, '55'.repeat(32), 'backup_rejected'));
    const corrupt = await readFile(archive); corrupt[25] ^= 1; const damaged = join(directory, 'damaged.enc'); await writeFile(damaged, corrupt);
    await assert.rejects(restoreDatabase(uriFor('backup_rejected'), damaged, key, 'backup_rejected'));
    assert.equal((await client.db('backup_rejected').listCollections().toArray()).length, 0);
    assert.equal(await source.collection('documents').countDocuments(), 1);
    console.log('[integration] PASS encrypted backup and isolated restore: BSON, indexes, corruption, wrong key and nonempty target');
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
}

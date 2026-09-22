import { MongoClient, BSON } from 'mongodb';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, link, unlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
const MAGIC = Buffer.from('FAKTURO1');
const stringify = value => BSON.EJSON.stringify(value, { relaxed: false });
function keyBytes(key) { if (!/^[a-f\d]{64}$/i.test(key || '')) throw new Error('BACKUP_KEY must contain 32 bytes encoded as hex'); return Buffer.from(key, 'hex'); }
async function metadata(db) {
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const result = [];
  for (const c of collections.sort((a,b) => a.name.localeCompare(b.name))) {
    if (c.name.startsWith('system.')) continue;
    if (c.type !== 'collection' || c.options?.timeseries || c.options?.capped) throw new Error('Unsupported collection type; use managed MongoDB snapshots');
    result.push({ name: c.name, options: c.options || {}, indexes: await db.collection(c.name).listIndexes().toArray() });
  }
  return result;
}
export async function backupDatabase(uri, destination, key) {
  const encryptionKey = keyBytes(key), iv = randomBytes(12);
  const client = new MongoClient(uri), partial = destination + '.' + randomBytes(8).toString('hex') + '.partial';
  let session;
  try {
    await client.connect(); const db = client.db(); const collections = await metadata(db);
    session = client.startSession(); session.startTransaction({ readConcern: { level: 'snapshot' } });
    const counts = {};
    async function* records() {
      yield stringify({ format: 1, createdAt: new Date(), collections }) + '\n';
      for (const c of collections) {
        counts[c.name] = 0;
        for await (const doc of db.collection(c.name).find({}, { session })) {
          yield stringify({ collection: c.name, document: doc }) + '\n'; counts[c.name]++;
        }
      }
      if (stringify(await metadata(db)) !== stringify(collections)) throw new Error('Schema changed during backup; retry during a maintenance window');
      await session.commitTransaction();
      yield stringify({ complete: true, counts }) + '\n';
    }
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAAD(MAGIC);
    const header = Buffer.concat([MAGIC, iv]);
    const handle = await open(partial, 'wx', 0o600); await handle.write(header); await handle.close();
    await pipeline(Readable.from(records()), createGzip(), cipher, createWriteStream(partial, { flags: 'a', mode: 0o600 }));
    const out = await open(partial, 'a'); try { await out.write(cipher.getAuthTag()); await out.sync(); } finally { await out.close(); }
    // Publish without replacing an existing archive. A failed run leaves no final file.
    await link(partial, destination); await unlink(partial);
    return counts;
  } finally {
    if (session?.inTransaction()) await session.abortTransaction();
    await session?.endSession(); await client.close(); await unlink(partial).catch(() => {});
  }
}
async function* lines(path) {
  const input = createReadStream(path), reader = createInterface({ input, crlfDelay: Infinity });
  try { for await (const line of reader) if (line) yield BSON.EJSON.parse(line, { relaxed: false }); }
  finally { reader.close(); input.destroy(); }
}
export async function restoreDatabase(uri, archive, key, confirmedDatabase) {
  const encryptionKey = keyBytes(key), directory = await mkdtemp(join(tmpdir(), 'fakturo-restore-')), clear = join(directory, 'verified.jsonl');
  const client = new MongoClient(uri);
  try {
    const size = (await stat(archive)).size; if (size < 37) throw new Error('Invalid backup');
    const input = await open(archive, 'r'), header = Buffer.alloc(20), tag = Buffer.alloc(16);
    try { await input.read(header, 0, 20, 0); await input.read(tag, 0, 16, size - 16); } finally { await input.close(); }
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Unknown backup format');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, header.subarray(8)); decipher.setAAD(MAGIC); decipher.setAuthTag(tag);
    // Authentication and decompression finish before connecting to the restore database.
    await pipeline(createReadStream(archive, { start: 20, end: size - 17 }), decipher, createGunzip(), createWriteStream(clear, { flags: 'wx', mode: 0o600 }));
    let manifest, footer; const counts = {};
    for await (const record of lines(clear)) {
      if (!manifest) { manifest = record; if (Number(record.format) !== 1 || !Array.isArray(record.collections)) throw new Error('Invalid manifest'); for (const c of record.collections) counts[c.name] = 0; }
      else if (record.complete) { if (footer) throw new Error('Duplicate footer'); footer = record; }
      else { if (footer || !Object.hasOwn(counts, record.collection) || !record.document) throw new Error('Invalid document record'); counts[record.collection]++; }
    }
    if (!footer || Object.keys(counts).some(name => counts[name] !== Number(footer.counts[name]))) throw new Error('Incomplete backup');
    await client.connect(); const db = client.db();
    if (!confirmedDatabase || db.databaseName !== confirmedDatabase || ['admin', 'local', 'config'].includes(confirmedDatabase)) throw new Error('Explicit restore database name must match RESTORE_DATABASE_URL');
    if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error('Restore requires a new empty database; existing data is never dropped');
    for (const c of manifest.collections) await db.createCollection(c.name, c.options);
    for await (const record of lines(clear)) if (record.collection) await db.collection(record.collection).insertOne(record.document);
    for (const c of manifest.collections) {
      for (const index of c.indexes) {
        if (index.name === '_id_') continue;
        const { key: indexKey, v, ns, ...options } = index;
        await db.collection(c.name).createIndex(indexKey, options);
      }
      if (await db.collection(c.name).countDocuments() !== counts[c.name]) throw new Error('Restored document count mismatch');
    }
    return counts;
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
}

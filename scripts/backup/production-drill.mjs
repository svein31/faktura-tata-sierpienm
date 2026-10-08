import { backupDatabase, restoreDatabase } from './archive.mjs';
import { reportBackup } from './receipt.mjs';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
const source = process.env.BACKUP_DATABASE_URL, restoreBase = process.env.RESTORE_DATABASE_URL, selectedArchive = process.env.RESTORE_ARCHIVE;
if ((!source && !selectedArchive) || (selectedArchive && !isAbsolute(selectedArchive)) || !restoreBase || !process.env.BACKUP_KEY) { console.error('Backup drill requires a source or absolute RESTORE_ARCHIVE, separate restore access and encryption key.'); process.exit(1); }
const directory = await mkdtemp(join(tmpdir(), 'fakturaprosto-drill-'));
const databaseName = 'fakturaprosto_drill_' + randomUUID().replaceAll('-', '');
const restoreUrl = new URL(restoreBase); restoreUrl.pathname = '/' + databaseName;
const client = new MongoClient(restoreUrl.toString());
try {
  const archive = selectedArchive || join(directory, 'verified.enc');
  const counts = selectedArchive ? null : await backupDatabase(source, archive, process.env.BACKUP_KEY);
  const restored = await restoreDatabase(restoreUrl.toString(), archive, process.env.BACKUP_KEY, databaseName);
  if (counts) assert.deepEqual(restored, counts);
  await client.connect();
  for (const [collection, count] of Object.entries(restored)) assert.equal(await client.db(databaseName).collection(collection).countDocuments(), count);
  await reportBackup('restore', archive);
  console.log(JSON.stringify({ event: 'restore_drill', success: true, selectedArchive: Boolean(selectedArchive), collections: Object.keys(restored).length, confirmedAt: new Date().toISOString() }));
} catch { console.error('Restore drill failed; no successful restore receipt issued. Inspect operator logs privately.'); process.exitCode = 1; }
finally {
  // Only the freshly generated drill database can be removed.
  try { await client.connect(); await client.db(databaseName).dropDatabase(); } catch { console.error('Temporary drill database cleanup requires operator inspection.'); process.exitCode = 1; }
  await client.close(); await rm(directory, { recursive: true, force: true });
}

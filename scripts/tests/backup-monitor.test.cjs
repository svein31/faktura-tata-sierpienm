require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), { createHmac } = require('node:crypto');
const { verifyBackupSignature, backupReceipt, backupStatus } = require('../../src/lib/backup-monitor.ts');
test('backup monitor requires an exact signature and fresh signed receipt', () => {
  const secret = 'a'.repeat(32), now = Date.now();
  const receipt = { kind: 'backup', archiveSha256: 'b'.repeat(64), completedAt: new Date(now).toISOString(), sentAt: new Date(now).toISOString() };
  const body = JSON.stringify(receipt), signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyBackupSignature(body, signature, secret), true);
  assert.equal(verifyBackupSignature(body + ' ', signature, secret), false);
  assert.equal(verifyBackupSignature(body, signature, 'short'), false);
  assert.equal(backupReceipt(receipt, now).id, 'backup');
  assert.throws(() => backupReceipt({ ...receipt, sentAt: new Date(now - 600000).toISOString() }, now));
  assert.throws(() => backupReceipt({ ...receipt, completedAt: 'bad' }, now));
});
test('unknown backup is never green and offsite must match latest archive', () => {
  const now = Date.now(), backup = { id: 'backup', completedAt: new Date(now), archiveSha256: 'a'.repeat(64) };
  assert.equal(backupStatus([], false, now).status, 'unknown');
  assert.equal(backupStatus([{ ...backup, completedAt: new Date(now - 37 * 3600000) }], true, now).status, 'stale');
  const mismatched = { id: 'offsite', completedAt: new Date(now), archiveSha256: 'b'.repeat(64) };
  assert.equal(backupStatus([backup, mismatched], true, now).offsiteStatus, 'stale');
  assert.equal(backupStatus([backup, { ...mismatched, archiveSha256: backup.archiveSha256 }], true, now).offsiteStatus, 'ok');
});

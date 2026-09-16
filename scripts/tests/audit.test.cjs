require('../register-ts.cjs');
const Module = require('node:module'), test = require('node:test'), assert = require('node:assert/strict');
const original = Module._load;
Module._load = function(request, parent, main) { return request === '@/lib/db' ? { prisma: {} } : original.call(this, request, parent, main); };
const { sanitizeAuditData, buildFieldDiff, recordAuditLog } = require('../../src/lib/audit.ts');
test('audit recursively redacts secrets and preserves useful fields and dates', () => {
  const result = sanitizeAuditData({ name: 'Firma', nested: [{ mfaSecret: 'secret', recoveryCodes: ['code'], accessToken: 'token' }], date: new Date('2026-09-15T12:00:00Z') });
  assert.equal(result.name, 'Firma'); assert.equal(result.date, '2026-09-15T12:00:00.000Z');
  assert.ok(!JSON.stringify(result).includes('"secret"')); assert.ok(!JSON.stringify(result).includes('"code"')); assert.ok(!JSON.stringify(result).includes('"token"'));
});
test('audit captures a previously missing value and writes through supplied transaction', async () => {
  const { diff } = buildFieldDiff({}, { notes: 'Nowa notatka' }, { notes: 'Notatki' });
  assert.deepEqual(diff.notes, { old: null, new: 'Nowa notatka', label: 'Notatki' });
  let written;
  await recordAuditLog({ client: { auditLog: { create: async value => { written = value.data; } } }, action: 'updated', entityType: 'invoice', entityId: 'id', userId: 'user', details: { totpSecret: 'hidden' }, diff });
  assert.equal(written.userId, 'user'); assert.equal(written.diff.notes.new, 'Nowa notatka'); assert.notEqual(written.details.totpSecret, 'hidden');
});

require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { isEmailVerifiedForSending, requireVerifiedEmailForSending, confirmEmailVerification } = require('../../src/lib/email/verification.ts');

test('mail ownership grandfathering applies only to accounts without a verification requirement', () => {
  assert.equal(isEmailVerifiedForSending({}), true);
  assert.equal(isEmailVerifiedForSending({ emailVerificationRequiredAt: null, emailVerifiedAt: null }), true);
  assert.equal(isEmailVerifiedForSending({ emailVerificationRequiredAt: new Date(), emailVerifiedAt: null }), false);
  assert.equal(isEmailVerifiedForSending({ emailVerificationRequiredAt: new Date(), emailVerifiedAt: new Date() }), true);
});
test('external mail requires a persisted account and verified new address', async () => {
  await assert.rejects(requireVerifiedEmailForSending('deleted', { user: { findUnique: async () => null } }), error => error.status === 401);
  await assert.rejects(requireVerifiedEmailForSending('new', { user: { findUnique: async () => ({ emailVerificationRequiredAt: new Date() }) } }), error => error.code === 'EMAIL_NOT_VERIFIED');
  await requireVerifiedEmailForSending('old', { user: { findUnique: async () => ({}) } });
});
test('verification refuses malformed tokens before accessing the database', async () => {
  const db = { $transaction: () => { throw new Error('Unexpected database access'); } };
  for (const raw of ['', '0'.repeat(63), '0'.repeat(65), 'Z'.repeat(64)]) await assert.rejects(confirmEmailVerification(raw, db), error => error.code === 'INVALID_VERIFICATION_TOKEN');
});

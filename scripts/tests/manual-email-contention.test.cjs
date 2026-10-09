require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { claimManualEmail } = require('../../src/lib/email/manual-delivery.ts');

const input = { userId: '507f191e810c19729de860ea', key: 'synthetic-one-intended-send', requestHash: 'same-body', targetHash: 'same-invoice' };
function readOnlyFixture(status) {
  let writes = 0;
  const delivery = { id: '507f191e810c19729de860eb', status, requestHash: input.requestHash, leaseUntil: new Date(Date.now() + 120000), response: { success: true, message: 'Synthetic provider acceptance' } };
  const forbiddenWrite = async () => { writes++; throw new Error('An idempotent replay or busy decision must not acquire a user write lock'); };
  const tx = {
    user: { findUnique: async () => ({ id: input.userId, emailVerifiedAt: new Date(), emailSafetyVersion: 0 }), update: forbiddenWrite },
    manualEmailDelivery: { findUnique: async () => delivery, update: forbiddenWrite, create: forbiddenWrite },
  };
  return { db: { $transaction: callback => callback(tx) }, delivery, writeCount: () => writes };
}

test('accepted email response replay performs no writes for eight duplicate requests', async () => {
  const fixture = readOnlyFixture('accepted');
  const results = await Promise.all(Array.from({ length: 8 }, () => claimManualEmail(input, fixture.db)));
  assert.ok(results.every(result => result.token === '' && result.id === fixture.delivery.id));
  for (const result of results) assert.deepEqual(result.replay, fixture.delivery.response);
  assert.equal(fixture.writeCount(), 0);
});

test('live preparation, live sending and uncertain delivery reject without user-lock writes', async () => {
  for (const status of ['preparing', 'sending', 'verify_needed']) {
    const fixture = readOnlyFixture(status);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => claimManualEmail(input, fixture.db)));
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.status === 409 && result.reason.code === (status === 'verify_needed' ? 'EMAIL_DELIVERY_UNCERTAIN' : 'DUPLICATE_REQUEST')));
    assert.equal(fixture.writeCount(), 0, `${status}: no durable side effect or hot user lock`);
  }
});

test('bounded pre-provider contention returns a safe 409 EMAIL_BUSY instead of raw Prisma failure', async () => {
  let attempts = 0;
  const db = { $transaction: async () => { attempts++; throw Object.assign(new Error('Synthetic private database conflict details'), { code: 'P2034' }); } };
  await assert.rejects(claimManualEmail(input, db), error => error.status === 409 && error.code === 'EMAIL_BUSY' && !error.message.includes('private database'));
  assert.equal(attempts, 8, 'The retry budget is bounded and never reaches a provider');
});

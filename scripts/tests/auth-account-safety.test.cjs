const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('../register-ts.cjs');
const { ApiError } = require('../../src/lib/api.ts');
const { resetPasswordWithToken } = require('../../src/lib/password-reset.ts');

test('reset password refuses a token whose atomic claim was lost', async () => {
  let passwordWrites = 0, sessionWrites = 0;
  const db = { $transaction: callback => callback({
    passwordResetToken: { findFirst: async () => ({ id: 'token', userId: 'owner' }), updateMany: async () => ({ count: 0 }) },
    user: { update: async () => { passwordWrites++; } },
    session: { deleteMany: async () => { sessionWrites++; } },
  }) };
  await assert.rejects(resetPasswordWithToken('hash', 'password', db), error => error.code === 'INVALID_OR_EXPIRED_TOKEN');
  assert.equal(passwordWrites, 0); assert.equal(sessionWrites, 0);
});

test('reset password re-reads a consumed token after MongoDB write conflict', async () => {
  let attempts = 0, reads = 0;
  const db = { $transaction: async callback => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
    return callback({ passwordResetToken: { findFirst: async () => { reads++; return null; } } });
  } };
  await assert.rejects(resetPasswordWithToken('hash', 'password', db), error => error.code === 'INVALID_OR_EXPIRED_TOKEN');
  assert.equal(attempts, 2); assert.equal(reads, 1);
});

test('reset password bounds transaction retries and does not retry unexpected errors', async () => {
  let attempts = 0;
  const conflict = Object.assign(new Error('Write conflict'), { code: 'P2034' });
  await assert.rejects(resetPasswordWithToken('hash', 'password', { $transaction: async () => { attempts++; throw conflict; } }), error => error === conflict);
  assert.equal(attempts, 3);
  attempts = 0;
  const failure = new Error('Database unavailable');
  await assert.rejects(resetPasswordWithToken('hash', 'password', { $transaction: async () => { attempts++; throw failure; } }), error => error === failure);
  assert.equal(attempts, 1);
});

function accountRoute({ billingError, validPassword = true, user = { id: 'owner', password: 'hash' } } = {}) {
  const calls = [];
  const originalLoad = Module._load;
  const routePath = require.resolve('../../src/app/api/user/delete-account/route.ts');
  delete require.cache[routePath];
  Module._load = function(request, parent, isMain) {
    if (request === '@/lib/auth') return { getSessionUser: async () => user, verifyPassword: async () => validPassword, clearSessionCookieValue: () => 'auth_session=; Max-Age=0' };
    if (request === '@/lib/account-deletion') return { deleteUserAccount: async id => { calls.push(['delete', id]); } };
    if (request === '@/lib/billing-cancellation') return { withUserBillingCancellation: async (id, callback) => {
      calls.push(['cancel', id]);
      if (billingError) throw billingError;
      await callback();
    } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { return { route: require(routePath), calls }; }
  finally { Module._load = originalLoad; }
}
function deletionRequest(body = { password: 'secret', confirmation: 'USUŃ' }) {
  return new Request('https://example.test/api/user/delete-account', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

test('account deletion only removes the account after billing cancellation succeeds', async () => {
  const fixture = accountRoute();
  const response = await fixture.route.POST(deletionRequest());
  assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
  assert.deepEqual(fixture.calls, [['cancel', 'owner'], ['delete', 'owner']]);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('account deletion preserves the account and session on Stripe failure or busy billing lease', async () => {
  for (const status of [503, 409]) {
    const fixture = accountRoute({ billingError: new ApiError(status, 'Cancellation not confirmed', 'BILLING_BUSY') });
    const response = await fixture.route.POST(deletionRequest());
    assert.equal(response.status, status); assert.equal((await response.json()).success, undefined);
    assert.deepEqual(fixture.calls, [['cancel', 'owner']]);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('account deletion does not cancel billing until password and explicit confirmation are valid', async () => {
  for (const options of [{ validPassword: false }, { user: null }]) {
    const fixture = accountRoute(options);
    assert.notEqual((await fixture.route.POST(deletionRequest())).status, 200);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = accountRoute();
  assert.equal((await fixture.route.POST(deletionRequest({ password: 'secret', confirmation: 'TAK' }))).status, 400);
  assert.equal(fixture.calls.length, 0);
});

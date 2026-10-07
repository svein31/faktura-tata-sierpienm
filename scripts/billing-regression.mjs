import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createStripeDouble, loadBillingModules, checkoutRequest, stripeSubscription } = require('./billing-fixtures.cjs');

/** Real MongoDB transactions with all external Stripe calls replaced by an in-memory double. */
export async function checkBillingSafety(db) {
  const { stripe, state } = createStripeDouble();
  let user;
  const billing = loadBillingModules(db, stripe, async () => user ? db.user.findUnique({ where: { id: user.id } }) : null);
  try {
    user = await db.user.create({ data: { email: 'billing-safety-' + Date.now() + '@example.invalid', password: 'synthetic-test-hash' } });
    await db.user.update({ where: { id: user.id }, data: { billingQuotaVersion: null } });
    const parallel = await Promise.all(Array.from({ length: 8 }, () => billing.checkout(checkoutRequest())));
    assert.ok(parallel.every(response => [200, 409].includes(response.status)), 'Parallel requests either acquire the lease or receive a conflict');
    assert.ok(parallel.some(response => response.status === 200));
    assert.equal(state.creates, 1, 'Parallel checkout creates only one external session');
    assert.ok((await db.user.findUnique({ where: { id: user.id } })).billingQuotaVersion > 0, 'Legacy null counters are initialized before acquiring the lease');
    const firstState = await db.billingCheckoutState.findUnique({ where: { userId: user.id } });
    await db.user.update({ where: { id: user.id }, data: { billingQuotaVersion: { unset: true } } });
    const reused = await billing.checkout(checkoutRequest());
    assert.equal(reused.status, 200); assert.equal(state.creates, 1);
    assert.ok((await db.user.findUnique({ where: { id: user.id } })).billingQuotaVersion > 0, 'Legacy omitted counters are initialized before acquiring the lease');
    assert.equal((await db.billingCheckoutState.findUnique({ where: { userId: user.id } })).idempotencyKey, firstState.idempotencyKey);

    const customer = (await db.subscription.findUnique({ where: { userId: user.id } })).stripeCustomerId;
    state.sessions.get(firstState.stripeCheckoutSessionId).status = 'expired';
    state.failCreateAfterAcceptance = true;
    assert.equal((await billing.checkout(checkoutRequest())).status, 503);
    const ambiguous = await db.billingCheckoutState.findUnique({ where: { userId: user.id } });
    assert.ok(ambiguous.checkoutParams && !ambiguous.stripeCheckoutSessionId);
    assert.equal((await billing.checkout(checkoutRequest())).status, 200);
    assert.equal(state.creates, 2, 'An ambiguous response is recovered using the same Stripe key');
    assert.equal((await db.billingCheckoutState.findUnique({ where: { userId: user.id } })).idempotencyKey, ambiguous.idempotencyKey);

    const subscription = stripeSubscription('sub_real_mongo_fake', customer, user.id);
    state.subscriptions.set(subscription.id, subscription);
    await db.subscription.update({ where: { userId: user.id }, data: { stripeSubscriptionId: subscription.id, status: 'active' } });
    const lease = await billing.acquireBillingLease(user.id);
    assert.equal((await billing.checkout(checkoutRequest())).status, 409);
    await assert.rejects(billing.withUserBillingCancellation(user.id, async () => { throw new Error('Must not delete while leased'); }), error => error.code === 'BILLING_BUSY');
    await billing.releaseBillingLease(user.id, lease.leaseToken);
    state.failCancel = true;
    let deleted = false;
    await assert.rejects(billing.withUserBillingCancellation(user.id, async () => { deleted = true; await db.user.delete({ where: { id: user.id } }); }), error => error.code === 'BILLING_CANCELLATION_FAILED');
    assert.equal(deleted, false); assert.ok(await db.user.findUnique({ where: { id: user.id } }));
    state.failCancel = false;
    await billing.withUserBillingCancellation(user.id, async () => {
      assert.equal((await billing.checkout(checkoutRequest())).status, 409, 'Deletion keeps the shared billing lease until the local delete completes');
      deleted = true; await db.user.delete({ where: { id: user.id } });
    });
    assert.equal(subscription.status, 'canceled'); assert.equal(deleted, true);
    assert.equal(await db.user.findUnique({ where: { id: user.id } }), null);
    console.log('[integration] PASS billing: concurrent Checkout, reuse, ambiguous retry, cancellation fencing and Stripe failure preservation');
  } finally {
    if (user) await db.user.deleteMany({ where: { id: user.id } });
  }
}

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStripeDouble, loadBillingModules, checkoutRequest, stripeSubscription } = require('../billing-fixtures.cjs');
const userId = '111111111111111111111111';
const clone = value => value ? structuredClone(value) : value;
const users = new Map(), subscriptions = new Map(), checkouts = new Map();
let transaction = Promise.resolve();
const db = {
  user: {
    findUnique: async ({ where }) => clone(users.get(where.id)),
    update: async ({ where }) => { if (!users.has(where.id)) throw Object.assign(new Error('Missing user'), { code: 'P2025' }); return clone(users.get(where.id)); },
    delete: async ({ where }) => { users.delete(where.id); subscriptions.delete(where.id); checkouts.delete(where.id); },
  },
  subscription: {
    findUnique: async ({ where }) => clone([...subscriptions.values()].find(s => Object.entries(where).every(([k, v]) => s[k] === v))),
    upsert: async ({ where, create, update }) => {
      const current = subscriptions.get(where.userId), saved = current ? { ...current, ...update } : { id: 'subscription-record', ...create };
      subscriptions.set(where.userId, saved); return clone(saved);
    },
  },
  billingCheckoutState: {
    findUnique: async ({ where }) => clone(checkouts.get(where.userId)),
    create: async ({ data }) => { const record = { id: 'checkout-state', ...data }; checkouts.set(data.userId, record); return clone(record); },
    update: async ({ where, data }) => { const record = { ...checkouts.get(where.userId), ...data }; checkouts.set(where.userId, record); return clone(record); },
    updateMany: async ({ where, data }) => {
      const record = checkouts.get(where.userId);
      if (!record || record.leaseToken !== where.leaseToken || (where.leaseExpiresAt && !(record.leaseExpiresAt > where.leaseExpiresAt.gt))) return { count: 0 };
      Object.assign(record, data); return { count: 1 };
    },
  },
  $transaction: work => { const pending = transaction.then(() => work(db)); transaction = pending.catch(() => undefined); return pending; },
};
const { stripe, state } = createStripeDouble();
const billing = loadBillingModules(db, stripe, async () => clone(users.get(userId)));
function reset() {
  users.clear(); subscriptions.clear(); checkouts.clear(); state.sessions.clear(); state.subscriptions.clear();
  state.failCancel = false; state.failCreateAfterAcceptance = false; state.onCreate = null; state.onExpire = null; state.event = null;
  users.set(userId, { id: userId, email: 'billing@example.invalid' });
}
const webhookRequest = (signature = 'valid-test-signature') => new Request('https://app.example.invalid/api/webhooks/stripe', {
  method: 'POST', headers: { 'stripe-signature': signature }, body: '{}',
});
const event = (type, object, created = 20) => ({ type, id: 'evt_' + created, created, data: { object } });

test('Checkout persists exact payload and reuses it after an ambiguous Stripe response', async () => {
  reset();
  let key, payload;
  state.onCreate = async () => {
    const persisted = checkouts.get(userId);
    assert.ok(persisted.checkoutParams && persisted.idempotencyKey);
    key ??= persisted.idempotencyKey; payload ??= clone(persisted.checkoutParams);
    assert.equal(persisted.idempotencyKey, key); assert.deepEqual(persisted.checkoutParams, payload);
  };
  const initialCreates = state.creates;
  state.failCreateAfterAcceptance = true;
  assert.equal((await billing.checkout(checkoutRequest())).status, 503);
  assert.equal((await billing.checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates, initialCreates + 1);
  assert.equal((await billing.checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates, initialCreates + 1);
});

test('live renewable Stripe state prevents another paid checkout even when the local state is inactive', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    reset();
    subscriptions.set(userId, { userId, stripeCustomerId: 'cus_existing', status: 'inactive' });
    state.subscriptions.set('sub_existing', stripeSubscription('sub_existing', 'cus_existing', userId, status));
    const before = state.creates;
    const response = await billing.checkout(checkoutRequest());
    assert.equal(response.status, 409, status); assert.equal((await response.json()).code, 'SUBSCRIPTION_EXISTS');
    assert.equal(state.creates, before);
  }
});

test('a plan change expires the previous open session before creating its replacement', async () => {
  reset();
  assert.equal((await billing.checkout(checkoutRequest('monthly'))).status, 200);
  const original = clone(checkouts.get(userId));
  assert.equal((await billing.checkout(checkoutRequest('yearly'))).status, 200);
  assert.equal(state.sessions.get(original.stripeCheckoutSessionId).status, 'expired');
  assert.notEqual(checkouts.get(userId).idempotencyKey, original.idempotencyKey);
  assert.equal(checkouts.get(userId).plan, 'yearly');
});

test('legacy open payment tabs are closed; a tab completing during expiration blocks replacement', async () => {
  reset();
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_legacy', status: 'inactive' });
  state.sessions.set('cs_legacy', { id: 'cs_legacy', customer: 'cus_legacy', status: 'open', url: 'https://checkout.example.invalid/legacy' });
  state.onExpire = async session => { session.status = 'complete'; };
  const before = state.creates;
  assert.equal((await billing.checkout(checkoutRequest())).status, 409);
  assert.equal(state.creates, before);
});

test('delayed failure webhooks use current Stripe state and cannot downgrade a successful renewal', async () => {
  reset(); process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-test-webhook-secret';
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_current', stripeSubscriptionId: 'sub_current', status: 'past_due' });
  const latest = stripeSubscription('sub_current', 'cus_current', userId, 'active');
  state.subscriptions.set(latest.id, latest);
  state.event = event('invoice.payment_failed', { subscription: latest.id, customer: 'cus_current' }, 30);
  assert.equal((await billing.webhook(webhookRequest())).status, 200);
  assert.equal(subscriptions.get(userId).status, 'active');
  const savedEnd = subscriptions.get(userId).currentPeriodEnd;
  state.event = event('customer.subscription.updated', { ...latest, status: 'past_due', current_period_end: 1 }, 10);
  assert.equal((await billing.webhook(webhookRequest())).status, 200);
  assert.equal(subscriptions.get(userId).status, 'active');
  assert.equal(subscriptions.get(userId).currentPeriodEnd.getTime(), savedEnd.getTime());
  assert.equal(subscriptions.get(userId).stripeEventCreatedAt, 30);
});

test('newer payloads use item period end and nested invoice subscription; duplicate deliveries are harmless', async () => {
  reset(); process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-test-webhook-secret';
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_nested', stripeSubscriptionId: 'sub_nested', status: 'inactive' });
  const latest = stripeSubscription('sub_nested', 'cus_nested', userId);
  const expectedEnd = latest.current_period_end;
  delete latest.current_period_end; latest.items.data[0].current_period_end = expectedEnd;
  state.subscriptions.set(latest.id, latest);
  state.event = event('invoice.paid', { customer: latest.customer, parent: { subscription_details: { subscription: latest.id } } });
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await billing.webhook(webhookRequest())).status, 200);
  assert.equal(subscriptions.get(userId).currentPeriodEnd.getTime(), expectedEnd * 1000);
  assert.equal(subscriptions.get(userId).status, 'active');
});

test('an old subscription cancellation cannot overwrite its active replacement', async () => {
  reset(); process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-test-webhook-secret';
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_current', stripeSubscriptionId: 'sub_new', status: 'active' });
  const old = stripeSubscription('sub_old', 'cus_current', userId, 'canceled');
  state.subscriptions.set(old.id, old); state.subscriptions.set('sub_new', stripeSubscription('sub_new', 'cus_current', userId));
  state.event = event('customer.subscription.deleted', old);
  assert.equal((await billing.webhook(webhookRequest())).status, 200);
  assert.equal(subscriptions.get(userId).stripeSubscriptionId, 'sub_new');
  assert.equal(subscriptions.get(userId).status, 'active');
});

test('a webhook never acknowledges a busy billing lease and an invalid signature has no side effects', async () => {
  reset(); process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-test-webhook-secret';
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_current', stripeSubscriptionId: 'sub_current', status: 'active' });
  const latest = stripeSubscription('sub_current', 'cus_current', userId); state.subscriptions.set(latest.id, latest);
  state.event = event('customer.subscription.updated', latest);
  const lease = await billing.acquireBillingLease(userId);
  assert.equal((await billing.webhook(webhookRequest())).status, 503);
  assert.equal((await billing.webhook(webhookRequest('wrong-signature'))).status, 400);
  assert.equal(subscriptions.get(userId).stripeEventCreatedAt, undefined);
  await billing.releaseBillingLease(userId, lease.leaseToken);
});

test('account removal cancels every renewable subscription and retains the user after cancellation failure', async () => {
  reset();
  subscriptions.set(userId, { userId, stripeCustomerId: 'cus_multi', stripeSubscriptionId: 'sub_one', status: 'active' });
  state.subscriptions.set('sub_one', stripeSubscription('sub_one', 'cus_multi', userId));
  state.subscriptions.set('sub_two', stripeSubscription('sub_two', 'cus_multi', userId, 'past_due'));
  state.failCancel = true;
  await assert.rejects(billing.withUserBillingCancellation(userId, async () => db.user.delete({ where: { id: userId } })), error => error.code === 'BILLING_CANCELLATION_FAILED');
  assert.ok(users.has(userId));
  state.failCancel = false;
  await billing.withUserBillingCancellation(userId, async () => {
    assert.equal((await billing.checkout(checkoutRequest())).status, 409);
    await db.user.delete({ where: { id: userId } });
  });
  assert.equal(state.subscriptions.get('sub_one').status, 'canceled'); assert.equal(state.subscriptions.get('sub_two').status, 'canceled');
  assert.equal(users.has(userId), false);
});

test('a terminated subscription permits a new purchase after its old checkout completed', async () => {
  reset();
  assert.equal((await billing.checkout(checkoutRequest())).status, 200);
  const stored = checkouts.get(userId), oldSession = state.sessions.get(stored.stripeCheckoutSessionId);
  oldSession.status = 'complete'; oldSession.subscription = 'sub_terminated';
  const ended = stripeSubscription('sub_terminated', oldSession.customer, userId, 'canceled');
  state.subscriptions.set(ended.id, ended);
  subscriptions.set(userId, { userId, stripeCustomerId: oldSession.customer, stripeSubscriptionId: ended.id, status: 'canceled' });
  const before = state.creates;
  assert.equal((await billing.checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates, before + 1);
  assert.notEqual(checkouts.get(userId).stripeCheckoutSessionId, oldSession.id);
});

test('account removal resolves references from a completed checkout when the local subscription is missing', async () => {
  reset();
  const lease = await billing.acquireBillingLease(userId);
  await billing.updateBillingLease(userId, lease.leaseToken, { stripeCheckoutSessionId: 'cs_completed_legacy' });
  await billing.releaseBillingLease(userId, lease.leaseToken);
  state.sessions.set('cs_completed_legacy', { id: 'cs_completed_legacy', status: 'complete', customer: 'cus_legacy', subscription: 'sub_legacy' });
  state.subscriptions.set('sub_legacy', stripeSubscription('sub_legacy', 'cus_legacy', userId));
  await billing.withUserBillingCancellation(userId, async () => db.user.delete({ where: { id: userId } }));
  assert.equal(state.subscriptions.get('sub_legacy').status, 'canceled');
  assert.equal(users.has(userId), false);
});

test('account removal resolves a legacy customer from its subscription and cancels all of that customer subscriptions', async () => {
  reset();
  subscriptions.set(userId, { userId, stripeSubscriptionId: 'sub_legacy_one', status: 'active' });
  state.subscriptions.set('sub_legacy_one', stripeSubscription('sub_legacy_one', 'cus_legacy', userId));
  state.subscriptions.set('sub_legacy_two', stripeSubscription('sub_legacy_two', 'cus_legacy', userId));
  await billing.withUserBillingCancellation(userId, async () => db.user.delete({ where: { id: userId } }));
  assert.equal(state.subscriptions.get('sub_legacy_one').status, 'canceled');
  assert.equal(state.subscriptions.get('sub_legacy_two').status, 'canceled');
});

test('a process losing its lease after Stripe accepts the checkout cannot save, but a retry recovers the same session', async () => {
  reset();
  state.onCreate = async () => { checkouts.get(userId).leaseExpiresAt = new Date(0); state.onCreate = null; };
  const before = state.creates;
  assert.equal((await billing.checkout(checkoutRequest())).status, 409);
  assert.equal((await billing.checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates, before + 1);
});

test('an expired lease owner cannot refresh or release a new owner lease', async () => {
  reset();
  const old = await billing.acquireBillingLease(userId);
  checkouts.get(userId).leaseExpiresAt = new Date(0);
  const latest = await billing.acquireBillingLease(userId);
  await billing.releaseBillingLease(userId, old.leaseToken);
  assert.equal(checkouts.get(userId).leaseToken, latest.leaseToken);
  await assert.rejects(billing.refreshBillingLease(userId, old.leaseToken), error => error.code === 'BILLING_BUSY');
  assert.equal(checkouts.get(userId).leaseToken, latest.leaseToken);
  await billing.releaseBillingLease(userId, latest.leaseToken);
});

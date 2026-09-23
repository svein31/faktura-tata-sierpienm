require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS_LABELS,
  isSubscriptionStatusActive,
  getPlanDetails,
} = require('../../src/lib/subscription-plans.ts');

const {
  getPriceIdForPlan,
  resolvePlanFromPriceId,
  resolvePlanFromStripeSubscription,
} = require('../../src/lib/stripe.ts');

const { normalizeStripeStatus } = require('../../src/lib/subscription.ts');
const migration014 = require('../migrations/014-stripe-subscriptions.mjs');

test('subscription plans metadata and status helpers', () => {
  assert.equal(SUBSCRIPTION_PLANS.length, 2);
  const monthly = SUBSCRIPTION_PLANS.find(p => p.id === 'monthly');
  const yearly = SUBSCRIPTION_PLANS.find(p => p.id === 'yearly');

  assert.equal(monthly?.amountPln, 7);
  assert.equal(monthly?.period, 'miesiąc');
  assert.equal(yearly?.amountPln, 59);
  assert.equal(yearly?.period, 'rok');

  assert.equal(isSubscriptionStatusActive('active'), true);
  assert.equal(isSubscriptionStatusActive('trialing'), true);
  assert.equal(isSubscriptionStatusActive('past_due'), false);
  assert.equal(isSubscriptionStatusActive('canceled'), false);
  assert.equal(isSubscriptionStatusActive('inactive'), false);
  assert.equal(isSubscriptionStatusActive(null), false);

  assert.equal(getPlanDetails('monthly')?.amountPln, 7);
  assert.equal(getPlanDetails('yearly')?.amountPln, 59);
  assert.equal(getPlanDetails('unknown'), null);
});

test('stripe price id resolution and plan detection', () => {
  process.env.STRIPE_PRICE_ID_MONTHLY = 'price_monthly_123';
  process.env.STRIPE_PRICE_ID_YEARLY = 'price_yearly_456';

  assert.equal(getPriceIdForPlan('monthly'), 'price_monthly_123');
  assert.equal(getPriceIdForPlan('yearly'), 'price_yearly_456');

  assert.equal(resolvePlanFromPriceId('price_monthly_123'), 'monthly');
  assert.equal(resolvePlanFromPriceId('price_yearly_456'), 'yearly');
  assert.equal(resolvePlanFromPriceId('price_unknown'), null);

  // Resolution from Stripe subscription item interval
  const fakeSubMonthly = {
    items: {
      data: [{ price: { id: 'price_other', recurring: { interval: 'month' } } }],
    },
  };
  assert.equal(resolvePlanFromStripeSubscription(fakeSubMonthly), 'monthly');

  const fakeSubYearly = {
    items: {
      data: [{ price: { id: 'price_other', recurring: { interval: 'year' } } }],
    },
  };
  assert.equal(resolvePlanFromStripeSubscription(fakeSubYearly), 'yearly');

  // Fallback to metadata
  const fakeSubMeta = {
    items: { data: [] },
    metadata: { plan: 'yearly' },
  };
  assert.equal(resolvePlanFromStripeSubscription(fakeSubMeta), 'yearly');
});

test('stripe status normalization', () => {
  assert.equal(normalizeStripeStatus('active'), 'active');
  assert.equal(normalizeStripeStatus('trialing'), 'trialing');
  assert.equal(normalizeStripeStatus('past_due'), 'past_due');
  assert.equal(normalizeStripeStatus('canceled'), 'canceled');
  assert.equal(normalizeStripeStatus('unpaid'), 'unpaid');
  assert.equal(normalizeStripeStatus('incomplete'), 'inactive');
  assert.equal(normalizeStripeStatus('incomplete_expired'), 'inactive');
});

test('migration 014-stripe-subscriptions plan, up, down', async () => {
  const createdIndexes = [];
  const droppedIndexes = [];

  const mockDb = {
    collection(name) {
      assert.equal(name, 'Subscription');
      return {
        listIndexes() {
          return {
            toArray: async () => [],
          };
        },
        async createIndex(spec, opts) {
          createdIndexes.push({ spec, opts });
        },
        async dropIndex(indexName) {
          droppedIndexes.push(indexName);
        },
      };
    },
  };

  const plan = await migration014.plan(mockDb);
  assert.equal(plan.addCustomerIndex, true);
  assert.equal(plan.addSubIndex, true);

  await migration014.up(mockDb, plan);
  assert.equal(createdIndexes.length, 2);
  assert.equal(createdIndexes[0].opts.name, 'Subscription_stripeCustomerId_key');
  assert.equal(createdIndexes[0].opts.unique, true);
  assert.equal(createdIndexes[0].opts.sparse, true);
  assert.equal(createdIndexes[1].opts.name, 'Subscription_stripeSubscriptionId_key');

  await migration014.down(mockDb, plan);
  assert.equal(droppedIndexes.length, 2);
  assert.deepEqual(droppedIndexes, [
    'Subscription_stripeCustomerId_key',
    'Subscription_stripeSubscriptionId_key',
  ]);
});

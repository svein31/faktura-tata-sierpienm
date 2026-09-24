const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');

const {
  normalizeStripeStatus,
  hasActivePro,
  syncStripeSubscription,
} = require('../../src/lib/subscription.ts');
const {
  resolvePlanFromStripeSubscription,
  resolvePlanFromPriceId,
  DEFAULT_STRIPE_PRICES,
} = require('../../src/lib/stripe.ts');
const { SUBSCRIPTION_PLANS, getPlanDetails } = require('../../src/lib/subscription-plans.ts');
const { FREE_INVOICE_LIMIT } = require('../../src/lib/invoice-quota.ts');
const { TERMS_OF_SERVICE } = require('../../src/lib/legal/content.ts');
const { prisma } = require('../../src/lib/db.ts');

test('Billing & Subscription Lifecycle (Checklist Item 8)', async (t) => {
  await t.test('prices and limits match between config, quota, and legal terms', () => {
    // Check 1: Monthly plan is 7 PLN brutto
    const monthly = getPlanDetails('monthly');
    assert.ok(monthly);
    assert.equal(monthly.amountPln, 7);

    // Check 2: Yearly plan is 59 PLN brutto
    const yearly = getPlanDetails('yearly');
    assert.ok(yearly);
    assert.equal(yearly.amountPln, 59);

    // Check 3: Free limit is 5 invoices/month
    assert.equal(FREE_INVOICE_LIMIT, 5);

    // Check 4: Terms §5 matches exactly 7,00 zł, 59,00 zł and 5 invoices
    const sec5 = TERMS_OF_SERVICE.sections.find((s) => s.title.includes('§ 5'));
    assert.ok(sec5);
    assert.ok(sec5.content.includes('7,00 zł brutto'));
    assert.ok(sec5.content.includes('59,00 zł brutto'));
    assert.ok(sec5.content.includes('5 faktur'));
  });

  await t.test('plan resolution from Stripe subscription items and recurring interval', () => {
    const monthlySub = {
      id: 'sub_test_monthly_123',
      items: {
        data: [{ price: { id: DEFAULT_STRIPE_PRICES.monthly, recurring: { interval: 'month' } } }],
      },
    };
    assert.equal(resolvePlanFromStripeSubscription(monthlySub), 'monthly');

    const yearlySub = {
      id: 'sub_test_yearly_123',
      items: {
        data: [{ price: { id: DEFAULT_STRIPE_PRICES.yearly, recurring: { interval: 'year' } } }],
      },
    };
    assert.equal(resolvePlanFromStripeSubscription(yearlySub), 'yearly');

    // Fallback to recurring interval when unknown price ID is used
    const fallbackMonthlySub = {
      id: 'sub_custom_1',
      items: {
        data: [{ price: { id: 'price_custom_month', recurring: { interval: 'month' } } }],
      },
    };
    assert.equal(resolvePlanFromStripeSubscription(fallbackMonthlySub), 'monthly');
  });

  await t.test('status normalization covers all Stripe subscription states', () => {
    assert.equal(normalizeStripeStatus('active'), 'active');
    assert.equal(normalizeStripeStatus('trialing'), 'trialing');
    assert.equal(normalizeStripeStatus('past_due'), 'past_due');
    assert.equal(normalizeStripeStatus('canceled'), 'canceled');
    assert.equal(normalizeStripeStatus('unpaid'), 'unpaid');
    assert.equal(normalizeStripeStatus('incomplete'), 'inactive');
    assert.equal(normalizeStripeStatus('paused'), 'inactive');
  });

  await t.test('hasActivePro logic honors active dates, past_due and cancellation', async () => {
    const origFindUnique = prisma.subscription.findUnique;
    try {
      // Case A: Active subscription with future expiration -> true
      prisma.subscription.findUnique = async () => ({
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
      });
      assert.equal(await hasActivePro('user_active_1'), true);

      // Case B: Active status but expired period -> false
      prisma.subscription.findUnique = async () => ({
        status: 'active',
        currentPeriodEnd: new Date(Date.now() - 3600000),
      });
      assert.equal(await hasActivePro('user_expired_1'), false);

      // Case C: Past due (payment failed) -> false
      prisma.subscription.findUnique = async () => ({
        status: 'past_due',
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
      });
      assert.equal(await hasActivePro('user_past_due_1'), false);

      // Case D: Canceled -> false
      prisma.subscription.findUnique = async () => ({
        status: 'canceled',
        currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
      });
      assert.equal(await hasActivePro('user_canceled_1'), false);

      // Case E: Inactive / no subscription -> false
      prisma.subscription.findUnique = async () => null;
      assert.equal(await hasActivePro('user_none'), false);
    } finally {
      prisma.subscription.findUnique = origFindUnique;
    }
  });

  await t.test('syncStripeSubscription updates DB record on checkout, renewal and cancellation', async () => {
    const origUpsert = prisma.subscription.upsert;
    let savedData = null;

    try {
      prisma.subscription.upsert = async (args) => {
        savedData = args;
        return {
          id: 'sub_record_1',
          ...args.create,
        };
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const futurePeriodEndSec = nowSec + 30 * 86400;

      // 1. checkout.session.completed activation
      const mockStripeSub = {
        id: 'sub_activated_123',
        customer: 'cus_customer_123',
        status: 'active',
        current_period_end: futurePeriodEndSec,
        cancel_at_period_end: false,
        metadata: { userId: 'user_buyer_1' },
        items: {
          data: [{ price: { id: DEFAULT_STRIPE_PRICES.monthly, recurring: { interval: 'month' } } }],
        },
      };

      const activated = await syncStripeSubscription(mockStripeSub, 'user_buyer_1');
      assert.ok(activated);
      assert.equal(savedData.where.userId, 'user_buyer_1');
      assert.equal(savedData.create.plan, 'monthly');
      assert.equal(savedData.create.status, 'active');
      assert.equal(savedData.create.stripeSubscriptionId, 'sub_activated_123');
      assert.equal(savedData.create.stripeCustomerId, 'cus_customer_123');

      // 2. Renewal: subscription updated with extended period
      const renewalPeriodEndSec = futurePeriodEndSec + 30 * 86400;
      mockStripeSub.current_period_end = renewalPeriodEndSec;
      await syncStripeSubscription(mockStripeSub, 'user_buyer_1');
      assert.equal(savedData.update.status, 'active');
      assert.equal(savedData.update.currentPeriodEnd.getTime(), renewalPeriodEndSec * 1000);

      // 3. Cancellation at period end: cancel_at_period_end set to true
      mockStripeSub.cancel_at_period_end = true;
      await syncStripeSubscription(mockStripeSub, 'user_buyer_1');
      assert.equal(savedData.update.cancelAtPeriodEnd, true);

      // 4. Immediate cancellation / expiration: status canceled
      mockStripeSub.status = 'canceled';
      await syncStripeSubscription(mockStripeSub, 'user_buyer_1');
      assert.equal(savedData.update.status, 'canceled');
    } finally {
      prisma.subscription.upsert = origUpsert;
    }
  });
});

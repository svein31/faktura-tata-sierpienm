const Module = require('node:module');
require('./register-ts.cjs');

function createStripeDouble() {
  const sessions = new Map(), subscriptions = new Map(), idempotency = new Map();
  const state = { sessions, subscriptions, creates: 0, customerCreates: 0, failCreateAfterAcceptance: false, failCancel: false, onCreate: null, onExpire: null, event: null };
  const copy = value => value ? structuredClone(value) : value;
  const stripe = {
    customers: { create: async (_params, options) => {
      if (!idempotency.has(options.idempotencyKey)) { state.customerCreates++; idempotency.set(options.idempotencyKey, { id: 'cus_fake_' + state.customerCreates }); }
      return copy(idempotency.get(options.idempotencyKey));
    } },
    checkout: { sessions: {
      create: async (params, options) => {
        if (state.onCreate) await state.onCreate();
        if (!idempotency.has(options.idempotencyKey)) {
          state.creates++;
          const session = { id: 'cs_fake_' + state.creates, customer: params.customer, status: 'open', mode: 'subscription', url: 'https://checkout.example.invalid/' + state.creates, expires_at: params.expires_at };
          sessions.set(session.id, session); idempotency.set(options.idempotencyKey, session);
          if (state.failCreateAfterAcceptance) { state.failCreateAfterAcceptance = false; throw new Error('Connection interrupted after Stripe accepted the request'); }
        }
        return copy(idempotency.get(options.idempotencyKey));
      },
      retrieve: async id => { if (!sessions.has(id)) throw new Error('Missing test checkout'); return copy(sessions.get(id)); },
      list: async params => ({ data: [...sessions.values()].filter(s => s.customer === params.customer && s.status === 'open').map(copy), has_more: false }),
      expire: async id => { const session = sessions.get(id); if (state.onExpire) await state.onExpire(session); if (session.status === 'complete') throw new Error('Checkout has completed'); session.status = 'expired'; return copy(session); },
    } },
    subscriptions: {
      retrieve: async id => { if (!subscriptions.has(id)) throw new Error('Missing test subscription'); return copy(subscriptions.get(id)); },
      list: async params => ({ data: [...subscriptions.values()].filter(s => s.customer === params.customer).map(copy), has_more: false }),
      cancel: async id => { if (state.failCancel) throw new Error('Stripe unavailable'); subscriptions.get(id).status = 'canceled'; return copy(subscriptions.get(id)); },
    },
    webhooks: { constructEvent: (_raw, signature) => { if (signature !== 'valid-test-signature') throw new Error('Bad signature'); return copy(state.event); } },
  };
  return { stripe, state };
}

function loadBillingModules(db, stripe, getUser) {
  const stripeHelpers = require('../src/lib/stripe.ts');
  const originalLoad = Module._load;
  Module._load = function(request, parent, main) {
    if (request === '@/lib/db' || (request === './db' && parent?.filename.includes('/src/lib/'))) return { prisma: db };
    if (request === '@/lib/auth') return { getSessionUser: getUser };
    if (request === '@/lib/stripe' || (request === './stripe' && parent?.filename.includes('/src/lib/'))) return { ...stripeHelpers, getStripe: () => stripe };
    return originalLoad.call(this, request, parent, main);
  };
  try {
    return {
      checkout: require('../src/app/api/subscription/checkout/route.ts').POST,
      webhook: require('../src/app/api/webhooks/stripe/route.ts').POST,
      ...require('../src/lib/billing-lease.ts'),
      ...require('../src/lib/billing-cancellation.ts'),
      ...require('../src/lib/subscription.ts'),
    };
  } finally { Module._load = originalLoad; }
}

const checkoutRequest = (plan = 'monthly') => new Request('https://app.example.invalid/api/subscription/checkout', {
  method: 'POST', headers: { 'content-type': 'application/json', host: 'app.example.invalid' }, body: JSON.stringify({ plan }),
});
const stripeSubscription = (id, customer, userId, status = 'active') => ({
  id, customer, status, metadata: { userId }, current_period_end: Math.floor(Date.now() / 1000) + 86400,
  cancel_at_period_end: false, items: { data: [{ price: { id: 'price_test', recurring: { interval: 'month' } } }] },
});

module.exports = { createStripeDouble, loadBillingModules, checkoutRequest, stripeSubscription };

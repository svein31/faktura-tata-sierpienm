const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');

const { OPERATOR_CONFIG, SUBPROCESSORS } = require('../../src/lib/legal/config.ts');
const { TERMS_OF_SERVICE, PRIVACY_POLICY } = require('../../src/lib/legal/content.ts');
const { SUBSCRIPTION_PLANS } = require('../../src/lib/subscription-plans.ts');
const { FREE_INVOICE_LIMIT } = require('../../src/lib/invoice-quota.ts');

test('Legal & Offer Compliance (Checklist Item 6)', async (t) => {
  await t.test('operator address has official postal code 04-998 Warszawa and Ogórkowa 63S', () => {
    assert.equal(OPERATOR_CONFIG.addressStreet, 'ul. Ogórkowa 63S');
    assert.equal(OPERATOR_CONFIG.addressPostal, '04-998');
    assert.equal(OPERATOR_CONFIG.addressCity, 'Warszawa');
    assert.equal(OPERATOR_CONFIG.isConfigured, true);
  });

  await t.test('subprocessors list contains Stripe with category payments', () => {
    const stripe = SUBPROCESSORS.find((s) => s.id === 'stripe-payments' || s.name.toLowerCase().includes('stripe'));
    assert.ok(stripe, 'Stripe must be listed in SUBPROCESSORS');
    assert.equal(stripe.category, 'payments');
    assert.ok(stripe.privacyPolicyUrl.includes('stripe.com'));
  });

  await t.test('terms of service §5 accurately reflects Free limit and Pro pricing synchronized with codebase', () => {
    const sec5 = TERMS_OF_SERVICE.sections.find((s) => s.title.includes('§ 5'));
    assert.ok(sec5, 'Section 5 must exist');

    // Free limit check
    assert.ok(sec5.content.includes(`${FREE_INVOICE_LIMIT}`), 'Terms must mention the 5 invoice free limit');
    assert.ok(sec5.content.includes('Plan Free'), 'Terms must define Plan Free');

    // Pro plans check
    const monthlyPlan = SUBSCRIPTION_PLANS.find((p) => p.id === 'monthly');
    const yearlyPlan = SUBSCRIPTION_PLANS.find((p) => p.id === 'yearly');
    assert.ok(sec5.content.includes(`${monthlyPlan.amountPln},00 zł brutto`), 'Terms must match monthly price');
    assert.ok(sec5.content.includes(`${yearlyPlan.amountPln},00 zł brutto`), 'Terms must match yearly price');

    // UOKiK transparency requirements: auto-renewal, 1-click cancel, 14 days withdrawal
    assert.ok(sec5.content.includes('odnawia się w sposób automatyczny'), 'Auto-renewal must be explicitly stated');
    assert.ok(sec5.content.includes('1-Click Cancel') || sec5.content.includes('Łatwa rezygnacja'), '1-click cancel must be documented');
    assert.ok(sec5.content.includes('odstąpić od umowy'), 'Consumer 14-day right of withdrawal must be stated');
  });

  await t.test('privacy policy retains backups for 30 days and includes Stripe', () => {
    const sec3 = PRIVACY_POLICY.sections.find((s) => s.title.includes('3. Zróżnicowane okresy'));
    assert.ok(sec3, 'Section 3 must exist');
    assert.ok(sec3.content.includes('30 dni'), 'Backup retention must be specified as 30 days');
    assert.ok(!sec3.content.includes('30-60 dni'), 'Ambiguous 30-60 days retention must be resolved');

    const sec4 = PRIVACY_POLICY.sections.find((s) => s.title.includes('4. Odbiorcy danych'));
    assert.ok(sec4, 'Section 4 must exist');
    assert.ok(sec4.content.toLowerCase().includes('stripe'), 'Section 4 must list Stripe');

    const sec5 = PRIVACY_POLICY.sections.find((s) => s.title.includes('5. Transfery danych'));
    assert.ok(sec5, 'Section 5 must exist');
    assert.ok(sec5.content.toLowerCase().includes('stripe'), 'Section 5 must list Stripe');
  });
});

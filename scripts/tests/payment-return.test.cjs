require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentReturnMessage } = require('../../src/components/subscription/payment-return.ts');

test('a checkout return URL cannot confirm payment or activate a Free account', () => {
  for (const access of [null, { isPro: false, accessSource: 'stripe' }]) {
    const checking = paymentReturnMessage('success', access, false);
    assert.equal(checking.type, 'pending');
    assert.doesNotMatch(checking.text, /zakończona sukcesem|została aktywowana/);
    const exhausted = paymentReturnMessage('success', access, true);
    assert.equal(exhausted.type, 'warning');
    assert.match(exhausted.text, /nie została jeszcze potwierdzona/);
  }
});

test('payment return confirms only server-reported Pro access, including granted access', () => {
  assert.deepEqual(paymentReturnMessage('success', { isPro: true, accessSource: 'stripe' }, false), {
    type: 'success', text: 'Serwer potwierdził aktywny plan Pro.',
  });
  assert.match(paymentReturnMessage('success', { isPro: true, accessSource: 'complimentary' }, true).text, /przyznany dostęp/);
});

test('a canceled checkout return does not assert that no charge occurred', () => {
  const message = paymentReturnMessage('cancel', { isPro: true, accessSource: 'stripe' }, false);
  assert.equal(message.type, 'warning');
  assert.doesNotMatch(message.text, /nie zostały pobrane|nie pobrano|brak obciążenia/);
  assert.match(message.text, /historię płatności/);
  assert.equal(paymentReturnMessage(null, null, false), null);
  assert.equal(paymentReturnMessage('forged', { isPro: true, accessSource: 'stripe' }, false), null);
});

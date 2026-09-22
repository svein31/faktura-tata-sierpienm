require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { reviewSteps, assertReviewDecision } = require('../../src/lib/cost-review.ts');
const a = '111111111111111111111111', b = '222222222222222222222222';
test('cost approval requires distinct valid assignees and a bounded sequence', () => {
  assert.equal(reviewSteps([{ userId: a }, { userId: b }]).length, 2);
  for (const value of [[], [{ userId: 'invalid' }], [{ userId: a }, { userId: a }], Array(6).fill({ userId: a })]) assert.throws(() => reviewSteps(value));
});
test('cost decisions reject stale versions, completed reviews and out-of-order actors', () => {
  const review = { status: 'pending', currentStep: 0, version: 3, steps: [{ userId: a }, { userId: b }] };
  assert.throws(() => assertReviewDecision(review, a, 2), e => e.status === 409);
  assert.throws(() => assertReviewDecision(review, b, 3), e => e.status === 403);
  assert.throws(() => assertReviewDecision({ ...review, status: 'approved' }, a, 3), e => e.status === 409);
  assert.equal(assertReviewDecision(review, a, 3).length, 2);
});

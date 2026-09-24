const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');

const emails = ['one@example.com', 'two@example.com'];
const users = emails.map(email => ({ _id: new ObjectId(), email }));

function fakeDb(subscriptions = []) {
  const grants = [];
  const db = {
    client: { startSession: () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) },
    collection(name) {
      if (name === 'User') return { find: () => ({ toArray: async () => users }) };
      if (name === '_complimentaryProGrants') return { insertOne: async doc => grants.push(doc) };
      return {
        find: () => ({ toArray: async () => [...subscriptions] }),
        insertOne: async doc => subscriptions.push(doc),
        updateOne: async (query, update) => Object.assign(subscriptions.find(sub => String(sub._id) === String(query._id)), update.$set),
      };
    },
  };
  return { db, subscriptions, grants };
}

test('dry-run never grants access; apply is idempotent and has no Stripe identifiers', async () => {
  const { grantComplimentaryPro } = await import('../ops/grant-complimentary-pro.mjs');
  const { db, subscriptions, grants } = fakeDb();
  const preview = await grantComplimentaryPro(db, emails);
  assert.equal(preview.length, 2);
  assert.equal(subscriptions.length, 0);
  await grantComplimentaryPro(db, emails, { apply: true });
  assert.equal(subscriptions.length, 2);
  assert.equal(grants.length, 2);
  assert.ok(subscriptions.every(sub => sub.plan === 'yearly' && sub.status === 'active' && sub.accessSource === 'complimentary' && !sub.stripeCustomerId));
  await grantComplimentaryPro(db, emails, { apply: true });
  assert.equal(subscriptions.length, 2);
  assert.equal(grants.length, 2);
});

test('a Stripe-linked account prevents grants to both accounts', async () => {
  const { grantComplimentaryPro } = await import('../ops/grant-complimentary-pro.mjs');
  const { db, subscriptions, grants } = fakeDb([{ _id: new ObjectId(), userId: users[0]._id, stripeCustomerId: 'cus_existing' }]);
  await assert.rejects(() => grantComplimentaryPro(db, emails, { apply: true }), /Stripe/);
  assert.equal(subscriptions.length, 1);
  assert.equal(grants.length, 0);
});

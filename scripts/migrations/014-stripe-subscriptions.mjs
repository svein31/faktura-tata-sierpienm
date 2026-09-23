export const id = '014-stripe-subscriptions';
const collectionName = 'Subscription';
const customerIndexName = 'Subscription_stripeCustomerId_key';
const subscriptionIndexName = 'Subscription_stripeSubscriptionId_key';

export async function plan(db) {
  let indexes = [];
  try {
    indexes = await db.collection(collectionName).listIndexes().toArray();
  } catch (error) {
    if (error.code !== 26) throw error;
  }
  const hasCustomerIndex = indexes.some(idx => idx.name === customerIndexName || idx.key?.stripeCustomerId === 1);
  const hasSubIndex = indexes.some(idx => idx.name === subscriptionIndexName || idx.key?.stripeSubscriptionId === 1);

  return {
    addCustomerIndex: !hasCustomerIndex,
    addSubIndex: !hasSubIndex,
  };
}

export async function up(db, checkpoint) {
  const collection = db.collection(collectionName);
  if (checkpoint.addCustomerIndex) {
    await collection.createIndex(
      { stripeCustomerId: 1 },
      { unique: true, sparse: true, name: customerIndexName }
    );
  }
  if (checkpoint.addSubIndex) {
    await collection.createIndex(
      { stripeSubscriptionId: 1 },
      { unique: true, sparse: true, name: subscriptionIndexName }
    );
  }
}

export async function down(db, checkpoint) {
  const collection = db.collection(collectionName);
  if (checkpoint.addCustomerIndex) {
    try { await collection.dropIndex(customerIndexName); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
  if (checkpoint.addSubIndex) {
    try { await collection.dropIndex(subscriptionIndexName); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

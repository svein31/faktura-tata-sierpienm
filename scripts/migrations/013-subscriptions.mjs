export const id = '013-subscriptions';
const collectionName = 'Subscription';
const indexName = 'Subscription_userId_key';

export async function plan(db) {
  let indexes = [];
  try { indexes = await db.collection(collectionName).listIndexes().toArray(); }
  catch (error) { if (error.code !== 26) throw error; }
  return { addIndex: !indexes.some(index => index.name === indexName || (index.unique && index.key?.userId === 1)) };
}

export async function up(db, checkpoint) {
  if (checkpoint.addIndex) await db.collection(collectionName).createIndex({ userId: 1 }, { unique: true, name: indexName });
}

export async function down(db, checkpoint) {
  if (!checkpoint.addIndex) return;
  try { await db.collection(collectionName).dropIndex(indexName); }
  catch (error) { if (![26, 27].includes(error.code)) throw error; }
}

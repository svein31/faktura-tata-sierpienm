export const id = '015-auth-rate-limit';
const collectionName = 'AuthRateLimit';
const indexName = 'AuthRateLimit_expiresAt_ttl';

export async function plan(db) {
  let indexes = [];
  try { indexes = await db.collection(collectionName).listIndexes().toArray(); }
  catch (error) { if (error.code !== 26) throw error; }
  const existing = indexes.find(index => index.name === indexName || index.key?.expiresAt === 1);
  if (existing && existing.expireAfterSeconds !== 0) throw new Error('AuthRateLimit has an incompatible expiresAt index.');
  return { addTtlIndex: !existing };
}
export async function up(db, checkpoint) {
  if (checkpoint.addTtlIndex) await db.collection(collectionName).createIndex(
    { expiresAt: 1 }, { expireAfterSeconds: 0, name: indexName }
  );
}
export async function down(db, checkpoint) {
  if (!checkpoint.addTtlIndex) return;
  try { await db.collection(collectionName).dropIndex(indexName); }
  catch (error) { if (![26, 27].includes(error.code)) throw error; }
}

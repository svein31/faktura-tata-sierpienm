export const id = '002-user-mfa';
export async function plan(db) {
  let indexes = [];
  try { indexes = await db.collection('UserMfa').listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
  return { createIndex: !indexes.some(index => index.unique && index.key.userId === 1 && Object.keys(index.key).length === 1) };
}
export async function up(db, checkpoint) {
  if (checkpoint.createIndex) await db.collection('UserMfa').createIndex({ userId: 1 }, { unique: true, name: 'UserMfa_userId_key' });
}
export async function down(db, checkpoint) {
  if (await db.collection('UserMfa').countDocuments({ enabledAt: { $type: 'date' } })) throw new Error('Disable MFA through authenticated account settings before rolling back MFA support. Active protection must not be bypassed.');
  if (checkpoint.createIndex) {
    try { await db.collection('UserMfa').dropIndex('UserMfa_userId_key'); } catch (e) { if (![26, 27].includes(e.code)) throw e; }
  }
  // Keep encrypted records, recovery hashes and session metadata; never destroy account data.
}

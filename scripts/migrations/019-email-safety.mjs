export const id = '019-email-safety';
const definitions = [
  { collection: 'EmailVerificationToken', key: { tokenHash: 1 }, name: 'EmailVerificationToken_tokenHash_key', unique: true },
  { collection: 'EmailVerificationToken', key: { userId: 1, createdAt: 1 }, name: 'EmailVerificationToken_userId_createdAt_idx' },
  { collection: 'EmailVerificationToken', key: { expiresAt: 1 }, name: 'EmailVerificationToken_expiresAt_ttl', expireAfterSeconds: 0 },
  { collection: 'ManualEmailDelivery', key: { userId: 1, keyHash: 1 }, name: 'ManualEmailDelivery_userId_keyHash_key', unique: true },
  { collection: 'ManualEmailDelivery', key: { userId: 1, targetHash: 1, status: 1 }, name: 'ManualEmailDelivery_userId_targetHash_status_idx' },
  { collection: 'ManualEmailDelivery', key: { status: 1, leaseUntil: 1 }, name: 'ManualEmailDelivery_status_leaseUntil_idx' },
  { collection: 'ManualEmailDelivery', key: { invoiceId: 1, status: 1 }, name: 'ManualEmailDelivery_invoiceId_status_idx' },
];
export async function plan(db) {
  const indexes = [];
  for (const definition of definitions) {
    let existing = [];
    try { existing = await db.collection(definition.collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    const match = existing.find(index => JSON.stringify(index.key) === JSON.stringify(definition.key));
    if (match && (Boolean(match.unique) !== Boolean(definition.unique) || match.expireAfterSeconds !== definition.expireAfterSeconds)) throw new Error(`Incompatible index in ${definition.collection}`);
    if (!match) indexes.push(definition);
  }
  return { indexes };
}
export async function up(db, checkpoint) {
  for (const { collection, key, name, unique, expireAfterSeconds } of checkpoint.indexes) {
    await db.collection(collection).createIndex(key, { name, ...(unique ? { unique: true } : {}), ...(expireAfterSeconds !== undefined ? { expireAfterSeconds } : {}) });
  }
}
export async function down(db, checkpoint) {
  // Leave pending proof and delivery fences intact; no user is retroactively forced to verify.
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

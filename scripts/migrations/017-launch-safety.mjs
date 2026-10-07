export const id = '017-launch-safety';
const definitions = [
  { collection: 'BillingCheckoutState', key: { userId: 1 }, name: 'BillingCheckoutState_userId_key', unique: true },
  { collection: 'Invoice', key: { autoKsefEmailStatus: 1, autoKsefEmailNextAttemptAt: 1 }, name: 'Invoice_autoKsefEmailStatus_autoKsefEmailNextAttemptAt_idx' },
];

export async function plan(db) {
  const indexes = [];
  for (const definition of definitions) {
    let existing = [];
    try { existing = await db.collection(definition.collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    if (!existing.some(index => JSON.stringify(index.key) === JSON.stringify(definition.key) && Boolean(index.unique) === Boolean(definition.unique))) indexes.push(definition);
  }
  return { indexes };
}

export async function up(db, checkpoint) {
  for (const { collection, key, name, unique } of checkpoint.indexes) {
    await db.collection(collection).createIndex(key, { name, ...(unique ? { unique: true } : {}) });
  }
}

export async function down(db, checkpoint) {
  // Rollback removes only indexes added here and preserves pending Checkout and mail records.
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

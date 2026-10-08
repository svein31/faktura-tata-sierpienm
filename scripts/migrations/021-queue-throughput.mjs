export const id = '021-queue-throughput';
const definitions = [
  { collection: 'KsefQueueTask', key: { status: 1, createdAt: 1 }, name: 'KsefQueueTask_status_createdAt_idx' },
  { collection: 'KsefQueueTask', key: { status: 1, lockedUntil: 1 }, name: 'KsefQueueTask_status_lockedUntil_idx' },
  { collection: 'Invoice', key: { ksefStatus: 1, updatedAt: 1 }, name: 'Invoice_ksefStatus_updatedAt_idx' },
  { collection: 'Invoice', key: { autoKsefEmailStatus: 1, autoKsefEmailLockedUntil: 1 }, name: 'Invoice_autoKsefEmailStatus_autoKsefEmailLockedUntil_idx' },
  { collection: 'Invoice', key: { autoSendEmailOnKsef: 1, autoKsefEmailStatus: 1, updatedAt: 1 }, name: 'Invoice_autoSendEmailOnKsef_autoKsefEmailStatus_updatedAt_idx' },
];
export async function plan(db) {
  const indexes = [];
  for (const definition of definitions) {
    let existing = [];
    try { existing = await db.collection(definition.collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    if (!existing.some(index => JSON.stringify(index.key) === JSON.stringify(definition.key))) indexes.push(definition);
  }
  return { indexes };
}
export async function up(db, checkpoint) {
  for (const { collection, key, name } of checkpoint.indexes) await db.collection(collection).createIndex(key, { name });
}
export async function down(db, checkpoint) {
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

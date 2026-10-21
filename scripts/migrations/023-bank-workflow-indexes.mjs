export const id = '023-bank-workflow-indexes';
const definitions = [
  { collection: 'BankTransaction', key: { accountId: 1, matchStatus: 1, _id: -1 }, name: 'BankTransaction_accountId_matchStatus_id_idx' },
  { collection: 'BankTransaction', key: { connectionId: 1, matchStatus: 1, _id: -1 }, name: 'BankTransaction_connectionId_matchStatus_id_idx' },
  { collection: 'BankConnection', key: { companyId: 1 }, name: 'BankConnection_companyId_idx' },
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

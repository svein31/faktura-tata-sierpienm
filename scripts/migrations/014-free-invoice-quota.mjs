export const id = '014-free-invoice-quota';
const definitions = [
  [{ sellerCompanyId: 1, issuedAt: 1 }, 'Invoice_company_issuedAt'],
  [{ userId: 1, issuedAt: 1 }, 'Invoice_user_issuedAt'],
];

export async function plan(db) {
  let existing = [];
  try { existing = await db.collection('Invoice').listIndexes().toArray(); }
  catch (error) { if (error.code !== 26) throw error; }
  return { indexes: definitions.filter(([key]) => !existing.some(index => JSON.stringify(index.key) === JSON.stringify(key))) };
}
export async function up(db, checkpoint) {
  for (const [key, name] of checkpoint.indexes) await db.collection('Invoice').createIndex(key, { name });
}
export async function down(db, checkpoint) {
  for (const [, name] of checkpoint.indexes) {
    try { await db.collection('Invoice').dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

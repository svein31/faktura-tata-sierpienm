export const id = '012-invoice-search';
const definitions = [
  ['Invoice', { sellerCompanyId: 1, issueDate: -1, _id: -1 }, 'Invoice_company_date_page'],
  ['Invoice', { userId: 1, sellerCompanyId: 1, issueDate: -1, _id: -1 }, 'Invoice_unassigned_date_page'],
];
export async function plan(db) {
  const indexes = [];
  for (const [collection, key, name] of definitions) {
    let existing = [];
    try { existing = await db.collection(collection).listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
    if (!existing.some(i => JSON.stringify(i.key) === JSON.stringify(key))) indexes.push({ collection, key, name });
  }
  return { indexes };
}
export async function up(db, checkpoint) { for (const i of checkpoint.indexes) await db.collection(i.collection).createIndex(i.key, { name: i.name }); }
export async function down(db, checkpoint) { for (const i of checkpoint.indexes) { try { await db.collection(i.collection).dropIndex(i.name); } catch (e) { if (![26,27].includes(e.code)) throw e; } } }

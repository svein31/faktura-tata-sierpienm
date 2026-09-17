export const id = '003-recurring-occurrences';
const definitions = [
  { name: 'RecurringOccurrence_templateId_scheduledDate_key', key: { templateId: 1, scheduledDate: 1 } },
  { name: 'RecurringOccurrence_invoiceId_key', key: { invoiceId: 1 } },
];
export async function plan(db) {
  let indexes = [];
  try { indexes = await db.collection('RecurringOccurrence').listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
  return { indexes: definitions.filter(definition => !indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(definition.key))) };
}
export async function up(db, checkpoint) { for (const index of checkpoint.indexes) await db.collection('RecurringOccurrence').createIndex(index.key, { name: index.name, unique: true }); }
export async function down(db, checkpoint) {
  for (const index of checkpoint.indexes) {
    try { await db.collection('RecurringOccurrence').dropIndex(index.name); } catch (e) { if (![26,27].includes(e.code)) throw e; }
  }
}

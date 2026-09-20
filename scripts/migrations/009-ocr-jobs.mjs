export const id = '009-ocr-jobs';
const definitions = [
  { status: 1, nextAttemptAt: 1 },
  { companyId: 1, updatedAt: 1 },
];
export async function plan(db) {
  let existing = [];
  try { existing = await db.collection('OcrJob').listIndexes().toArray(); }
  catch (error) { if (error.code !== 26) throw error; }
  return { indexes: definitions.filter(key => !existing.some(index => JSON.stringify(index.key) === JSON.stringify(key))).map(key => ({ key, name: 'OcrJob_' + Object.keys(key).join('_') + '_idx' })) };
}
export async function up(db, checkpoint) {
  for (const { key, name } of checkpoint.indexes) await db.collection('OcrJob').createIndex(key, { name });
}
export async function down(db, checkpoint) {
  // Preserve originals, human review, extracted fields and all job state.
  for (const { name } of checkpoint.indexes) {
    try { await db.collection('OcrJob').dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

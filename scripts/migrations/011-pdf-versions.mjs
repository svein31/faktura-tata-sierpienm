export const id = '011-pdf-versions';
const definitions = [
  ['PdfTemplateVersion', { companyId: 1, version: 1 }, 'PdfTemplateVersion_companyId_version_key', true],
  ['InvoicePrintVersion', { invoiceId: 1, createdAt: 1 }, 'InvoicePrintVersion_invoiceId_createdAt_idx', false],
];
export async function plan(db) {
  const indexes = [];
  for (const [collection, key, name, unique] of definitions) {
    let existing = [];
    try { existing = await db.collection(collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    if (!existing.some(index => JSON.stringify(index.key) === JSON.stringify(key) && Boolean(index.unique) === unique)) indexes.push({ collection, key, name, unique });
  }
  return { indexes };
}
export async function up(db, checkpoint) {
  for (const { collection, key, name, unique } of checkpoint.indexes) await db.collection(collection).createIndex(key, { name, unique });
}
export async function down(db, checkpoint) {
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

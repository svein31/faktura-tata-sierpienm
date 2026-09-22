export const id = '010-projects';
const definitions = [
  ['Project', { companyId: 1, _id: 1 }, 'Project_companyId_id_idx'],
  ['ProjectEntry', { projectId: 1, _id: 1 }, 'ProjectEntry_projectId_id_idx'],
  ['ProjectEntry', { companyId: 1, sourceId: 1 }, 'ProjectEntry_companyId_sourceId_idx'],
  ['ProjectSourceClaim', { entryId: 1 }, 'ProjectSourceClaim_entryId_idx'],
];
export async function plan(db) {
  const indexes = [];
  for (const [collection, key, name] of definitions) {
    let existing = [];
    try { existing = await db.collection(collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    if (!existing.some(index => JSON.stringify(index.key) === JSON.stringify(key))) indexes.push({ collection, key, name });
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

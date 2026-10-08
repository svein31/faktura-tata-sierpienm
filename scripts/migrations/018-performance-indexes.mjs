export const id = '018-performance-indexes';
export const definitions = [
  { collection: 'Invoice', key: { sellerCompanyId: 1, number: 1 }, name: 'Invoice_sellerCompanyId_number_idx' },
  { collection: 'Invoice', key: { sellerCompanyId: 1, createdAt: -1 }, name: 'Invoice_sellerCompanyId_createdAt_idx' },
  { collection: 'Invoice', key: { userId: 1, sellerCompanyId: 1, createdAt: -1 }, name: 'Invoice_userId_sellerCompanyId_createdAt_idx' },
  { collection: 'Invoice', key: { sellerCompanyId: 1, contractorId: 1 }, name: 'Invoice_sellerCompanyId_contractorId_idx' },
  { collection: 'Notification', key: { userId: 1, createdAt: -1 }, name: 'Notification_userId_createdAt_idx' },
  { collection: 'Contractor', key: { companyId: 1, createdAt: -1 }, name: 'Contractor_companyId_createdAt_idx' },
  { collection: 'Contractor', key: { userId: 1, createdAt: -1 }, name: 'Contractor_userId_createdAt_idx' },
  { collection: 'Product', key: { companyId: 1, createdAt: -1 }, name: 'Product_companyId_createdAt_idx' },
  { collection: 'Product', key: { userId: 1, createdAt: -1 }, name: 'Product_userId_createdAt_idx' },
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
  // Additive and non-unique: legacy duplicate invoice numbers never prevent deployment.
  for (const { collection, key, name } of checkpoint.indexes) await db.collection(collection).createIndex(key, { name });
}

export async function down(db, checkpoint) {
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

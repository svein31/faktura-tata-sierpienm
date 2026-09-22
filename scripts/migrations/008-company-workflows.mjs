// Add query indexes without changing historical ownership or removing workflow history.
export const id = '008-company-workflows';
const definitions = [
  ['WorkspaceCommand', { companyId: 1, createdAt: 1 }, 'WorkspaceCommand_companyId_createdAt_idx'],
  ['CostReview', { companyId: 1, status: 1, createdAt: 1 }, 'CostReview_companyId_status_createdAt_idx'],
  ['CostReviewEvent', { reviewId: 1, createdAt: 1 }, 'CostReviewEvent_reviewId_createdAt_idx'],
  ['AccountingWorkspace', { companyId: 1, month: 1 }, 'AccountingWorkspace_companyId_month_idx'],
  ['AccountingPeriod', { companyId: 1, month: 1 }, 'AccountingPeriod_companyId_month_idx'],
  ['AccountingPeriodEvent', { periodId: 1, _id: 1 }, 'AccountingPeriodEvent_periodId_id_idx'],
  ['AccountingPeriodEvent', { companyId: 1, createdAt: 1 }, 'AccountingPeriodEvent_companyId_createdAt_idx'],
];
export async function plan(db) {
  const indexes = [];
  for (const [collection, key, name] of definitions) {
    let current = [];
    try { current = await db.collection(collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    if (!current.some(index => JSON.stringify(index.key) === JSON.stringify(key))) indexes.push({ collection, key, name });
  }
  return { indexes };
}
export async function up(db, checkpoint) {
  for (const index of checkpoint.indexes) await db.collection(index.collection).createIndex(index.key, { name: index.name });
}
export async function down(db, checkpoint) {
  // Reverting indexes must never delete closed periods, approvals, events or command receipts.
  for (const index of checkpoint.indexes) {
    try { await db.collection(index.collection).dropIndex(index.name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}

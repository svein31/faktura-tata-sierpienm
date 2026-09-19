// Only launched by integration-test.mjs with its disposable replica-set URL.
require('./register-ts.cjs');
const assert = require('node:assert/strict');
const { prisma } = require('../src/lib/db.ts');
const { applyStockDocument, applyStockDocumentInTransaction, cancelStockDocument } = require('../src/lib/warehouse/stock-engine.ts');
const { openStocktaking, saveStocktakingCounts, closeStocktaking } = require('../src/lib/warehouse/stocktaking.ts');

async function run() {
  assert.equal(process.env.WAREHOUSE_ISOLATED_TEST, 'true');
  assert.match(process.env.DATABASE_URL || '', /^mongodb:\/\/127\.0\.0\.1:/);
  const user = await prisma.user.create({ data: { email: 'warehouse-engine@example.test', password: 'unused-test-account' } });
  const a = await prisma.warehouse.create({ data: { userId: user.id, code: 'ENGINE-A', name: 'A' } });
  const b = await prisma.warehouse.create({ data: { userId: user.id, code: 'ENGINE-B', name: 'B' } });
  const line = { sku: 'SKU-1', name: 'Towar', unit: 'szt.', quantity: 1, unitPriceNet: 10, valueNet: 10 };
  const params = { userId: user.id, warehouseId: a.id, type: 'PZ', issueDate: '2026-09-19', lines: [line] };
  const quantity = async id => (await prisma.stockItem.findFirst({ where: { warehouseId: id, sku: line.sku } }))?.quantity ?? 0;
  const snapshot = async () => JSON.stringify({
    items: await prisma.stockItem.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
    docs: await prisma.stockDocument.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
    moves: await prisma.stockMovement.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
    audit: await prisma.auditLog.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }),
  });
  await applyStockDocument(params);
  const concurrent = await Promise.allSettled([1, 2].map(() => applyStockDocument({ ...params, type: 'WZ' })));
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1, 'Only one request can release the last unit');
  assert.equal(await quantity(a.id), 0);
  assert.equal(await prisma.stockMovement.count({ where: { userId: user.id } }), 2);
  const issued = concurrent.find(r => r.status === 'fulfilled').value.document;
  const cancel = await Promise.allSettled([1, 2].map(() => cancelStockDocument(user.id, issued.id, 'Test')));
  assert.equal(cancel.filter(r => r.status === 'fulfilled').length, 1, 'Cancellation reverses the stock exactly once');
  assert.equal(await quantity(a.id), 1);

  const beforeFailure = await snapshot();
  // Fail after real writes: the rollback must include stock, document, movement and audit.
  await assert.rejects(prisma.$transaction(async tx => {
    await applyStockDocumentInTransaction(params, tx);
    throw new Error('injected-rollback');
  }), /injected-rollback/);
  assert.equal(await snapshot(), beforeFailure);

  const brokenAudit = tx => new Proxy(tx, { get(target, key) {
    if (key === 'auditLog') return { create: async () => { throw new Error('injected-audit-failure'); } };
    return target[key];
  } });
  await assert.rejects(prisma.$transaction(tx => applyStockDocumentInTransaction(params, brokenAudit(tx))), /injected-audit-failure/);
  assert.equal(await snapshot(), beforeFailure, 'Audit failure must roll back business data');

  const transfer = await applyStockDocument({ ...params, type: 'MM', targetWarehouseId: b.id });
  assert.equal(await quantity(a.id), 0); assert.equal(await quantity(b.id), 1);
  assert.ok(transfer.document.pairedDocumentId);
  await cancelStockDocument(user.id, transfer.document.id, 'Reverse both');
  assert.equal(await quantity(a.id), 1); assert.equal(await quantity(b.id), 0);
  assert.equal((await prisma.stockDocument.findUnique({ where: { id: transfer.document.pairedDocumentId } })).status, 'cancelled');

  const frozen = await snapshot();
  await assert.rejects(prisma.$transaction(tx => applyStockDocumentInTransaction({ ...params, type: 'MM', targetWarehouseId: b.id }, brokenAudit(tx))), /injected-audit-failure/);
  assert.equal(await snapshot(), frozen, 'Both halves of transfer roll back together');
  await assert.rejects(applyStockDocument({ ...params, lines: [{ ...line, unitPriceNet: NaN }] }), /cen/);
  await assert.rejects(applyStockDocument({ ...params, issueDate: '2026-02-30' }), /dat/);

  const inventories = await Promise.allSettled([1, 2].map(() => openStocktaking(user.id, a.id, '2026-09-19')));
  assert.equal(inventories.filter(r => r.status === 'fulfilled').length, 1, 'Only one active stocktaking per warehouse');
  const inventory = inventories.find(r => r.status === 'fulfilled').value;
  await assert.rejects(applyStockDocument(params), /remanentu/);
  await saveStocktakingCounts(user.id, inventory.id, [{ sku: line.sku, countedQuantity: 3 }]);
  const closings = await Promise.allSettled([1, 2].map(() => closeStocktaking(user.id, inventory.id)));
  assert.equal(closings.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await quantity(a.id), 3);
  assert.equal(await prisma.stockDocument.count({ where: { sourceType: 'stocktaking', sourceId: inventory.id } }), 1);
  await applyStockDocument(params); assert.equal(await quantity(a.id), 4);
  console.log('PASS: warehouse engine concurrency, atomic rollback, audit failure, MM pairs and stocktaking freeze/close');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

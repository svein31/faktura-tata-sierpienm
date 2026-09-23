// Only launched by integration-test.mjs with its disposable replica-set URL.
require('./register-ts.cjs');
const assert = require('node:assert/strict');
const { prisma } = require('../src/lib/db.ts');
const { applyStockDocument, applyStockDocumentInTransaction, cancelStockDocument } = require('../src/lib/warehouse/stock-engine.ts');
const { openStocktaking, saveStocktakingCounts, closeStocktaking, closeStocktakingInTransaction } = require('../src/lib/warehouse/stocktaking.ts');

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
  const large = await prisma.warehouse.create({data:{userId:user.id,code:'LARGE-COUNT',name:'Large count'}});
  const countRows=Array.from({length:201},(_,index)=>({userId:user.id,warehouseId:large.id,sku:`LARGE-${String(index).padStart(3,'0')}`,name:`Large item ${index}`,unit:'szt.',quantity:1,avgPurchasePrice:10,lastPurchasePrice:10,valueNet:10}));
  await prisma.stockItem.createMany({data:countRows});
  const largeInventory=await openStocktaking(user.id,large.id,'2026-09-19');
  await saveStocktakingCounts(user.id,largeInventory.id,countRows.slice(0,200).map(row=>({sku:row.sku,countedQuantity:0})));
  await saveStocktakingCounts(user.id,largeInventory.id,countRows.slice(200).map(row=>({sku:row.sku,countedQuantity:0})));
  let audits=0;
  await assert.rejects(prisma.$transaction(tx=>closeStocktakingInTransaction(user.id,largeInventory.id,{},new Proxy(tx,{get(target,key){
    if(key==='auditLog')return {create:async args=>{if(++audits===2)throw new Error('second-batch-failure');return target.auditLog.create(args);}};
    return target[key];
  }})),{timeout:30000}),/second-batch-failure/);
  assert.equal(await prisma.stockDocument.count({where:{warehouseId:large.id}}),0,'Failure in the second adjustment rolls back the first document');
  assert.equal(await prisma.stockItem.count({where:{warehouseId:large.id,quantity:1}}),201);
  assert.equal((await prisma.stocktaking.findUnique({where:{id:largeInventory.id}})).status,'counting');
  const closedLarge=await closeStocktaking(user.id,largeInventory.id);
  assert.equal(closedLarge.documents.length,2);
  assert.equal(await prisma.stockItem.count({where:{warehouseId:large.id,quantity:0}}),201);
  assert.ok((await prisma.stockDocument.findMany({where:{warehouseId:large.id}})).every(doc=>doc.lines.length<=200));
  const valued = await prisma.warehouse.create({ data: { userId: user.id, code: 'VALUES', name: 'Valuation' } });
  const valuedParams = { ...params, warehouseId: valued.id };
  const oldReceipt = await applyStockDocument({ ...valuedParams, lines: [{ ...line, quantity: 10, unitPriceNet: 10, valueNet: 100 }] });
  await applyStockDocument({ ...valuedParams, lines: [{ ...line, quantity: 10, unitPriceNet: 30, valueNet: 300 }] });
  await cancelStockDocument(user.id, oldReceipt.document.id, 'Historical value');
  let valuedItem = await prisma.stockItem.findFirstOrThrow({ where: { warehouseId: valued.id } });
  assert.equal(valuedItem.quantity, 10); assert.equal(valuedItem.valueNet, 300); assert.equal(valuedItem.avgPurchasePrice, 30);
  await prisma.stockItem.update({ where: { id: valuedItem.id }, data: { reserved: 9 } });
  await assert.rejects(applyStockDocument({ ...valuedParams, type: 'WZ', lines: [{ ...line, quantity: 2, valueNet: 20 }] }), /rezerw/);
  await prisma.stockItem.update({ where: { id: valuedItem.id }, data: { reserved: 0 } });
  const historicalOut = await applyStockDocument({ ...valuedParams, type: 'WZ', lines: [{ ...line, quantity: 2, valueNet: 20 }] });
  await applyStockDocument({ ...valuedParams, lines: [{ ...line, quantity: 2, unitPriceNet: 80, valueNet: 160 }] });
  await cancelStockDocument(user.id, historicalOut.document.id, 'Restore historical issue');
  valuedItem = await prisma.stockItem.findFirstOrThrow({ where: { warehouseId: valued.id } });
  assert.equal(valuedItem.quantity, 12); assert.equal(valuedItem.valueNet, 460);
  console.log('PASS: historical receipt/issue value reversal after price changes and reserved stock protection');
  console.log('PASS: 201-position stocktaking batches and second-batch atomic rollback');
  console.log('PASS: warehouse engine concurrency, atomic rollback, audit failure, MM pairs and stocktaking freeze/close');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

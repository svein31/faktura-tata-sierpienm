require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { projectSummary } = require('../../src/lib/project-summary.ts');
const { projectEntryId, timeFields } = require('../../src/lib/projects.ts');
test('project margins separate currencies and count either material purchases or warehouse consumption', () => {
  const rows = [
    {category:'revenue',currency:'PLN',amount:1000},
    {category:'cost',currency:'PLN',amount:100},
    {category:'cost',currency:'PLN',amount:400,materialPurchase:true},
    {category:'materials',currency:'PLN',amount:250},
    {category:'time',currency:'PLN',amount:200,minutes:120},
    {category:'cost',currency:'EUR',amount:20},
    {category:'revenue',currency:'PLN',amount:-50},
  ];
  const documents = projectSummary(rows, 'documents'), consumption = projectSummary(rows, 'consumption');
  assert.equal(documents.find(r=>r.currency==='PLN').profit, 250);
  assert.equal(consumption.find(r=>r.currency==='PLN').profit, 400);
  assert.equal(consumption.find(r=>r.currency==='PLN').minutes, 120);
  assert.equal(documents.find(r=>r.currency==='EUR').profit, -20);
  assert.equal(documents.find(r=>r.currency==='EUR').marginPercent, null);
  assert.throws(()=>projectSummary([{category:'cost',currency:'PLN',amount:NaN}],'documents'));
});
test('project source identity and time validation preserve assignment and cost boundaries', () => {
  assert.equal(projectEntryId('a','invoice','x'), projectEntryId('a','invoice','x'));
  assert.notEqual(projectEntryId('a','invoice','x'), projectEntryId('b','invoice','x'));
  assert.notEqual(projectEntryId('a','invoice','x'), projectEntryId('a','expense','x'));
  const row={workDate:'2026-09-20',description:'Pomiar',currency:'PLN',minutes:90,hourlyCost:100};
  assert.deepEqual(timeFields(row),row);
  for(const patch of [{minutes:0},{minutes:1441},{minutes:1.5},{hourlyCost:Infinity},{hourlyCost:-1},{workDate:'2026-02-30'},{currency:''}]) assert.throws(()=>timeFields({...row,...patch}));
});

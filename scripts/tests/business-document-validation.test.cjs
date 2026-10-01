require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {parseExpenseBody,parseOrderBody,expensePaymentFields,orderMinutes}=require('../../src/lib/business-document-validation.ts');
const expense={contractorName:'Supplier',issueDate:'2026-09-30',totalNet:100,totalVat:23,totalGross:123,currency:'PLN'};
test('manual expenses reject invalid dates, amounts, currencies and statuses before persistence',()=>{
  for(const patch of [{issueDate:'2026-02-30'},{totalGross:'bad'},{totalNet:-1},{totalVat:-1},{totalGross:200},{currency:'invalid'},{paymentStatus:'other'},{workflowStatus:'other'},{paymentStatus:'paid',paidAt:'bad'}])
    assert.throws(()=>parseExpenseBody({...expense,...patch}),e=>e.status===400,JSON.stringify(patch));
  assert.equal(parseExpenseBody(expense).totalGross,123);
  assert.equal(parseExpenseBody({...expense,totalNet:123,totalVat:0}).totalVat,0);
  assert.equal(parseExpenseBody({...expense,currency:'GBP'}).currency,'GBP');
});
test('partial expense edits retain monetary consistency and paid timestamps',()=>{
  const original={...expense,paymentStatus:'paid',paidAt:new Date('2026-09-30T12:00:00Z')};
  assert.throws(()=>parseExpenseBody({totalGross:500},original),e=>e.status===400);
  assert.equal(parseExpenseBody({description:'Note'},original).paidAt.getTime(),original.paidAt.getTime());
  assert.equal(expensePaymentFields({paymentStatus:'unpaid'},original).paidAt,null);
});
test('orders preserve explicit zero and reject invalid time, rates, stages and status',()=>{
  const original={title:'Test',number:'ZL/1',totalNet:100,totalGross:123,currency:'PLN',status:'in_progress',trackedMinutes:60,stages:[]};
  const zero=parseOrderBody({totalAmount:0},original);assert.equal(zero.totalGross,0);assert.equal(zero.totalNet,0);
  for(const patch of [{totalGross:-1},{status:'other'},{hourlyRate:-1},{trackedMinutes:0.5},{trackedHours:-1},{currency:'invalid'},{stages:[{id:'1',name:'Bad',amount:-1,status:'pending'}]}])
    assert.throws(()=>parseOrderBody(patch,original),e=>e.status===400,JSON.stringify(patch));
  assert.equal(orderMinutes(30),30);assert.equal(parseOrderBody({trackedHours:0.5},original).trackedMinutes,30);
});

test('whole-minute time survives hours conversion without accepting fractional minutes',()=>{
  const {orderHoursToMinutes}=require('../../src/lib/business-document-validation.ts');
  for(const minutes of [1,31,62,123,124,125,9999]) {
    assert.equal(orderHoursToMinutes(minutes/60),minutes);
    assert.equal(parseOrderBody({trackedHours:minutes/60}).trackedMinutes,minutes);
  }
  assert.throws(()=>orderHoursToMinutes(1.5/60),e=>e.status===400);
});
test('paid dates reject normalized impossible calendar dates',()=>{
  for(const paidAt of ['2026-02-30','2026-02-30T12:00:00Z'])
    assert.throws(()=>expensePaymentFields({paymentStatus:'paid',paidAt}),e=>e.status===400);
  assert.equal(expensePaymentFields({paymentStatus:'paid',paidAt:'2026-02-28T12:00:00Z'}).paidAt.toISOString(),'2026-02-28T12:00:00.000Z');
});

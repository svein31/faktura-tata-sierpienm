require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { contractorHistory } = require('../../src/lib/crm.ts');
const invoice = (overrides = {}) => ({ id: '1', contractorId: 'c', sellerCompanyId: 'a', issueDate: '2026-01-01', type: 'sale', currency: 'PLN', status: 'issued', lines: [{quantity: 1, netPrice: 100, vatRate: '23'}], ...overrides });
test('CRM separates companies, currencies, receivables and payables without mutating data', () => {
  const data = [invoice({paidAmount: 23}), invoice({id:'2',currency:'EUR'}), invoice({id:'3',type:'purchase',paidAmount:3}), invoice({id:'4',sellerCompanyId:'b'}), invoice({id:'5',isProforma:true}), invoice({id:'6',documentStatus:'cancelled'}), invoice({id:'7',status:'draft'}), invoice({id:'8',paymentStatus:'paid'}), invoice({id:'9',lines:[{quantity:-1,netPrice:10,vatRate:'23'}]})];
  const before = JSON.stringify(data), result = contractorHistory(data,'c','a');
  assert.equal(result.history.length,8);
  assert.deepEqual(result.balances.find(b => b.currency === 'PLN'), {currency:'PLN',receivable:87.7,payable:120});
  assert.deepEqual(result.balances.find(b => b.currency === 'EUR'), {currency:'EUR',receivable:123,payable:0});
  assert.equal(JSON.stringify(data),before);
});

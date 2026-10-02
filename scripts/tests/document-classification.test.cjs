const assert=require('node:assert/strict');
const {test}=require('node:test');
require('../register-ts.cjs');
const {effectiveDocumentStatus,isAccountingInvoice}=require('../../src/lib/accountant-summary.ts');
test('legacy stale drafts require persisted issuance evidence; cancellation wins',()=>{
 const base={currency:'PLN',type:'sale',status:'issued',documentStatus:'draft'};
 assert.equal(isAccountingInvoice(base),false);
 assert.equal(effectiveDocumentStatus({...base,issuedAt:'2026-10-02T12:00:00Z'}),'issued');
 assert.equal(isAccountingInvoice({...base,issuedAt:new Date()}),true);
 assert.equal(isAccountingInvoice({...base,status:'draft',issuedAt:new Date()}),false);
 assert.equal(isAccountingInvoice({...base,status:'paid',documentStatus:'cancelled',issuedAt:new Date()}),false);
 assert.equal(isAccountingInvoice({...base,status:'cancelled',documentStatus:'issued',issuedAt:new Date()}),false);
 assert.equal(isAccountingInvoice({...base,isProforma:true,issuedAt:new Date()}),false);
});

require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {parseInvoiceBody}=require('../../src/lib/parsers.ts');
const opts={contractorOwnedBy:async()=>true,companyOwnedBy:async()=>true};
const body={number:'TEST/1',type:'sale',status:'draft',contractorId:'a'.repeat(24),sellerCompanyId:'b'.repeat(24),currency:'PLN',language:'PL',paymentMethod:'transfer',issueDate:'2026-09-30',saleDate:'2026-09-30',dueDate:'2026-10-14',lines:[{id:'1',name:'Fractional',quantity:0.004,unit:'kg',netPrice:1000,vatRate:'23'}]};
test('fractional invoice quantities remain nonzero and retain six decimal places',async()=>{
  const parsed=await parseInvoiceBody(body,opts);assert.equal(parsed.lines[0].quantity,0.004);assert.equal(parsed.totalNet,4);assert.equal(parsed.totalVat,0.92);
  await assert.rejects(parseInvoiceBody({...body,lines:[{...body.lines[0],quantity:0.0000001}]},opts),e=>e.status===400);
});
test('invoice price rounding uses half-up and excessive rows/amounts are rejected',async()=>{
  const parsed=await parseInvoiceBody({...body,lines:[{...body.lines[0],quantity:1,netPrice:1.005}]},opts);
  assert.equal(parsed.lines[0].netPrice,1.01);assert.equal(parsed.totalGross,1.24);
  for(const lines of [Array.from({length:201},()=>body.lines[0]),[{...body.lines[0],quantity:1e100}],[{...body.lines[0],quantity:1e9,netPrice:1e9}]])
    await assert.rejects(parseInvoiceBody({...body,lines},opts),e=>e.status===400);
});

test('every VAT option available in the invoice and product UI is accepted by the parser',async()=>{
  const {VAT_RATES}=require('../../src/lib/format.ts');
  const {parseProductBody}=require('../../src/lib/parsers.ts');
  for(const vatRate of VAT_RATES) {
    const parsed=await parseInvoiceBody({...body,lines:[{...body.lines[0],quantity:1,netPrice:100,vatRate}]},opts);
    assert.equal(parsed.lines[0].vatRate,vatRate);
    assert.equal(parseProductBody({name:'VAT test',netPrice:100,vatRate}).vatRate,vatRate);
  }
});
test('offer amounts use the same price and quantity precision as invoice conversion',async()=>{
  const {offerAmounts}=require('../../src/lib/offer-validation.ts');
  const input=[{...body.lines[0],quantity:10,netPrice:1.005}];
  const offer=offerAmounts(input),invoice=await parseInvoiceBody({...body,lines:offer.lines},opts);
  assert.equal(offer.lines[0].netPrice,1.01);assert.equal(offer.totalGross,invoice.totalGross);
  assert.equal(offer.totalNet,10.1);
  assert.throws(()=>offerAmounts([{...input[0],quantity:1e-7}]),e=>e.status===400);
});

require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { moneyCents, bankBalance, allocationAmount, parseBankAmount } = require('../../src/lib/banking/allocation.ts');
const { summarizeInvoiceSuggestions } = require('../../src/lib/invoice-suggestions.ts');
const { reconcile } = require('../../src/lib/banking/reconciliation.ts');

test('bank allocations use integer cents and reject unsupported monetary input', () => {
  assert.equal(moneyCents(123.45),12345);
  for (const amount of [NaN,Infinity,-Infinity,1.001,Number.MAX_SAFE_INTEGER]) assert.throws(()=>moneyCents(amount));
  assert.equal(parseBankAmount(' 123,45 '),123.45);
  assert.equal(parseBankAmount('0.01'),.01);
  for (const amount of ['1e3','-1','1,234','1.2.3','1 000,00','Infinity','']) assert.equal(parseBankAmount(amount),null);
});
test('legacy transaction balances are explicit and no historical money is fabricated', () => {
  assert.deepEqual(bankBalance({amount:150,matchStatus:'unmatched'}),{total:150,allocated:0,available:150});
  assert.deepEqual(bankBalance({amount:-150,matchStatus:'manual'}),{total:150,allocated:150,available:0});
  assert.deepEqual(bankBalance({amount:150,allocatedAmount:100,matchStatus:'partially_matched'}),{total:150,allocated:100,available:50});
  assert.deepEqual(bankBalance({amount:150,allocatedAmount:100,matchStatus:'ignored'}),{total:150,allocated:100,available:50});
  assert.throws(()=>bankBalance({amount:150,allocatedAmount:151,matchStatus:'partially_matched'}));
  assert.throws(()=>bankBalance({amount:150,allocatedAmount:-1,matchStatus:'unmatched'}));
});
test('a partial allocation cannot exceed either the bank funds or document balance', () => {
  assert.equal(allocationAmount(150,100,100),100);
  assert.equal(allocationAmount(50,80,25),25);
  assert.equal(allocationAmount(50,80,undefined),50,'legacy callers retain their full-transfer behavior');
  for (const value of [0,-1,51,1.001,'25',null]) assert.throws(()=>allocationAmount(50,80,value));
  assert.throws(()=>allocationAmount(150,100,undefined),'overpayments require an explicit smaller allocation');
  assert.throws(()=>allocationAmount(50,40,50));
  assert.throws(()=>allocationAmount(150,100,50,true),'expenses retain their full-balance rule');
  assert.equal(allocationAmount(150,100,100,true),100);
});
const line = {id:'original',name:'Konsultacja',quantity:7,unit:'godz.',netPrice:120,vatRate:'23'};
const history = (patch={}) => ({contractorId:'customer-a',currency:'PLN',lines:[line],number:'FV/RECENT',paymentMethod:'transfer',paymentTermDays:10,...patch});
test('suggestions preserve price/rate/unit while counting a line once per invoice', () => {
  const rows=[history({lines:[line,line]}),history({number:'FV/OLDER'})],before=structuredClone(rows);
  const result=summarizeInvoiceSuggestions(rows,'PLN','customer-a');
  assert.deepEqual(result.lines,[{name:'Konsultacja',unit:'godz.',netPrice:120,vatRate:'23',uses:2}]);
  assert.deepEqual(result.terms,{method:'transfer',days:10,sourceNumber:'FV/RECENT'});
  assert.equal(result.uses.get('customer-a'),2);assert.deepEqual(rows,before);
});
test('suggestions never mix currencies or another selected buyer into line defaults', () => {
  const rows=[history({contractorId:'customer-b',lines:[{...line,name:'Other buyer'}]}),history({currency:'EUR',lines:[{...line,name:'Euro service'}]}),history()];
  assert.deepEqual(summarizeInvoiceSuggestions(rows,'PLN','customer-a').lines.map(x=>x.name),['Konsultacja']);
  assert.deepEqual(summarizeInvoiceSuggestions(rows,'EUR','customer-a').lines.map(x=>x.name),['Euro service']);
  assert.equal(summarizeInvoiceSuggestions(rows,'USD','missing').terms,null);
  assert.deepEqual(summarizeInvoiceSuggestions(rows,'USD').lines,[]);
});
test('invalid historical lines and unsupported legacy discounts do not become suggestions', () => {
  const rows=[history({lines:[null,{...line,name:''},{...line,netPrice:Infinity},{...line,netPrice:'120'},{...line,netPrice:-1},{...line,vatRate:'INVALID'},{...line,discount:10}]})];
  assert.deepEqual(summarizeInvoiceSuggestions(rows,'PLN').lines,[]);
  assert.equal(summarizeInvoiceSuggestions([history({paymentMethod:'unknown'})],'PLN','customer-a').terms,null);
  assert.equal(summarizeInvoiceSuggestions([history({paymentTermDays:-1})],'PLN','customer-a').terms,null);
  assert.equal(summarizeInvoiceSuggestions([history({paymentTermDays:0})],'PLN','customer-a').terms.days,0);
});
test('the bounded suggestion list ranks observed use and does not combine different prices', () => {
  const rows=Array.from({length:8},(_,index)=>history({lines:[{...line,name:'Service '+index},line]}));
  const result=summarizeInvoiceSuggestions(rows,'PLN');assert.equal(result.lines.length,5);assert.equal(result.lines[0].name,line.name);assert.equal(result.lines[0].uses,8);
  const prices=summarizeInvoiceSuggestions([history(),history({lines:[{...line,netPrice:240}]})],'PLN');assert.equal(prices.lines.length,2);
});
const candidate={id:'a',kind:'invoice',number:'FV/1',type:'sale',currency:'PLN',totalGross:100,paidAmount:0,contractorNip:'5260301706',documentRevision:'1'};
const transaction={date:'2026-10-21',amount:150,currency:'PLN',title:'Zapłata FV/1',senderName:'',raw:''};
test('a number-matched overpayment is a proposal and cannot silently become a payment', () => {
  const row=reconcile([transaction],[candidate])[0];assert.equal(row.matchedInvoiceId,undefined);assert.ok(row.candidates[0].signals.includes('overpayment'));
  assert.equal(reconcile([{...transaction,amount:50}],[candidate])[0].matchedInvoiceId,'a');
});
test('a strong overpayment identity cannot be displaced by a weaker NIP/amount match', () => {
  const row=reconcile([{...transaction,title:'FV/1 NIP 5260301706'}],[candidate,{...candidate,id:'b',number:'FV/2',totalGross:150}])[0];
  assert.equal(row.candidates[0].id,'a');assert.equal(row.matchedInvoiceId,undefined);
});
test('review-mode previews reserve proposed payments and leave the excess for manual review', () => {
  const rows=reconcile([{...transaction,amount:75},{...transaction,amount:75}],[candidate],true);
  assert.equal(rows[0].matchedInvoiceId,'a');assert.equal(rows[0].matchedDocumentRevision,'1');assert.equal(rows[1].matchedInvoiceId,undefined);
  assert.ok(rows[1].candidates[0].signals.includes('overpayment'));
  assert.equal(reconcile([{...transaction,amount:75},{...transaction,amount:75}],[candidate])[1].matchedInvoiceId,'a','legacy import still validates/rolls back the whole conflicting batch');
});
test('reversal, currency, direction and ambiguous identifiers remain excluded from automatic matching', () => {
  for(const tx of [{...transaction,reversal:true},{...transaction,currency:'EUR'},{...transaction,amount:-100}])assert.equal(reconcile([tx],[candidate])[0].matchedInvoiceId,undefined);
  const row=reconcile([{...transaction,amount:100}],[candidate,{...candidate,id:'b'}])[0];assert.equal(row.ambiguous,true);assert.equal(row.matchedInvoiceId,undefined);
});

const test=require('node:test');
const assert=require('node:assert/strict');
require('../register-ts.cjs');
const {invoiceSelectionTotals:sum}=require('../../src/lib/invoice-selection-totals.ts');
const {normalizeInvoiceColumns:columns,DEFAULT_INVOICE_COLUMNS:defaults,invoiceColumnsKey:key}=require('../../src/lib/invoice-columns.ts');
const line={id:'line',name:'Usługa',quantity:1,netPrice:100,vatRate:'23',unit:'szt.'};
const invoice=(id,patch={})=>({id,currency:'PLN',status:'issued',lines:[line],...patch});

test('selected totals keep currencies separate and preserve negative correction amounts',()=>{
 const result=sum([invoice('a'),invoice('b',{isCorrection:true,totalNet:-20,totalVat:-4.6,totalGross:-24.6}),invoice('c',{currency:'EUR',totalNet:8,totalVat:0,totalGross:8}),invoice('d',{currency:'USD',totalNet:15,totalVat:3,totalGross:18})],['a','b','c','d']);
 assert.deepEqual(result.map(x=>[x.currency,x.net,x.vat,x.gross]),[['PLN',80,18.4,98.4],['EUR',8,0,8],['USD',15,3,18]]);
});
test('persisted zero amounts win over line fallbacks without changing input data',()=>{
 const rows=[invoice('a',{totalNet:0,totalVat:0,totalGross:0})],snapshot=JSON.stringify(rows);
 assert.equal(sum(rows,['a'])[0].gross,0);assert.equal(JSON.stringify(rows),snapshot);
});
test('unknown IDs, duplicate selection and duplicate rows cannot inflate totals',()=>{
 const a=invoice('a');assert.equal(sum([a,a,invoice('b')],['a','a','foreign'])[0].gross,123);assert.deepEqual(sum([a],['foreign']),[]);
});
test('line fallback uses correction settlement values, not after-correction unit prices',()=>{
 const row=invoice('c',{isCorrection:true,lines:[{...line,quantity:2,netPrice:500,settlementNet:-25,settlementVat:-5.75}]});
 assert.deepEqual(sum([row],['c']).map(x=>[x.net,x.vat,x.gross]),[[-25,-5.75,-30.75]]);
});
test('summary identifies drafts and proformas and sums decimal cents consistently',()=>{
 const rows=Array.from({length:10},(_,i)=>invoice(String(i),{status:i===0?'draft':'issued',isProforma:i===1,totalNet:.1,totalVat:.02,totalGross:.12}));
 const result=sum(rows,rows.map(x=>x.id))[0];assert.equal(result.count,10);assert.equal(result.net,1);assert.equal(result.vat,.2);assert.equal(result.gross,1.2);assert.equal(result.drafts,1);assert.equal(result.proformas,1);
});
test('column preferences whitelist and deduplicate values while allowing all optional columns off',()=>{
 assert.deepEqual(columns(['currency','gross','currency','unsafe']),['gross','currency']);assert.deepEqual(columns([]),[]);
 for(const value of [null,'gross',{},['unsafe']])assert.deepEqual(columns(value),defaults);
 assert.equal(columns(['document','actions']).includes('document'),false);
});
test('column persistence is isolated by user, company and unassigned scope',()=>{
 assert.notEqual(key('alice','a'),key('bob','a'));assert.notEqual(key('alice','a'),key('alice','b'));
 assert.notEqual(key('alice','a'),key('alice',null));assert.notEqual(key('a:b','c'),key('a','b:c'));assert.equal(key('',null),'');
});

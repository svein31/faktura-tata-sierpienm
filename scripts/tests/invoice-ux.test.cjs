const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { ksefPresentation } = require('../../src/lib/ksef/presentation.ts');
const { invoiceSearchParams, invoiceSearchPipeline } = require('../../src/lib/invoice-search.ts');
const { normalizeInvoiceView, invoiceViewKey, DEFAULT_INVOICE_VIEW } = require('../../src/lib/invoice-view.ts');
const invoice={id:'a',number:'FV/1',type:'sale',status:'issued',createdAt:'2026-10-19T10:00:00Z'};
for(const [patch,label] of [
  [{},'Zapisana'],[{ksefStatus:'queued'},'W kolejce'],[{referenceNumber:'submission-ref'},'Wysłana'],
  [{ksefStatus:'verify_needed'},'Weryfikacja wyniku'],[{ksefStatus:'accepted'},'Weryfikacja wyniku'],
  [{ksef:{status:'ACTIVE',number:''}},'Weryfikacja wyniku'],
  [{ksefNumber:'5260301706-20261019-000000000001-AA'},'Przyjęta'],
  [{ksefStatus:'rejected'},'Odrzucona'],[{ksef:{status:'REJECTED'}},'Odrzucona'],
  [{isProforma:true},'Nie dotyczy KSeF'],
])test(`KSeF presentation: ${label} / ${JSON.stringify(patch)}`,()=>assert.equal(ksefPresentation({...invoice,...patch}).label,label));
test('submission references never imply acceptance or downloadable UPO',()=>{
 const value=ksefPresentation({...invoice,referenceNumber:'transport',sentAt:'2026-10-19T10:01:00Z'});
 assert.equal(value.accepted,false);assert.equal(value.hasUpo,false);
 assert.equal(value.steps.find(s=>s.id==='accepted').state,'pending');
 assert.equal(value.steps.find(s=>s.id==='accepted').timestamp,undefined);
});
test('accepted-without-UPO and demo confirmation remain distinct',()=>{
 const a=ksefPresentation({...invoice,ksefNumber:'accepted',sentAt:'2026-10-19T10:01:00Z'});
 assert.equal(a.steps.find(s=>s.id==='upo').state,'current');
 assert.equal(a.steps.find(s=>s.id==='accepted').timestamp,undefined);
 const demo=ksefPresentation({...invoice,ksef:{number:'DEMO',status:'ACTIVE',environment:'demo'},hasUpo:true});
 assert.equal(demo.simulated,true);assert.equal(demo.steps.at(-1).label,'Potwierdzenie demo');
});
test('rejection shows the actual message rather than inventing a reason',()=>{
 const value=ksefPresentation({...invoice,ksefStatus:'rejected',ksef:{processingDescription:'Brak uprawnienia do wystawienia',status:'REJECTED'}});
 assert.equal(value.rejectionMessage,'Brak uprawnienia do wystawienia');
 assert.match(ksefPresentation({...invoice,ksefStatus:'verify_needed'}).detail,/nie wysyłaj ponownie/);
});
test('sort defaults preserve existing descending order and bound allowed inputs',()=>{
 assert.equal(invoiceSearchParams(new URLSearchParams()).sort,'date_desc');
 assert.throws(()=>invoiceSearchParams(new URLSearchParams('sort=amount')));
 for(const [sort,direction] of [['date_desc',-1],['date_asc',1]]) {
  const pipeline=invoiceSearchPipeline({},invoiceSearchParams(new URLSearchParams({sort})));
  const facet=pipeline.find(x=>x.$facet).$facet;
  assert.deepEqual(facet.rows.find(x=>x.$sort).$sort,{issueDate:direction,_id:direction});
 }
});
test('remembered views are bounded, validated and scoped to owner and company',()=>{
 assert.notEqual(invoiceViewKey('alice','one'),invoiceViewKey('bob','one'));
 assert.notEqual(invoiceViewKey('alice','one'),invoiceViewKey('alice','two'));
 assert.equal(invoiceViewKey('',null),'');
 assert.deepEqual(normalizeInvoiceView(null),DEFAULT_INVOICE_VIEW);
 const view=normalizeInvoiceView({search:'x'.repeat(1000),statusFilter:'nonsense',typeFilter:'purchase',sortOrder:'date_asc',density:'compact',approvalFilter:{bad:true}});
 assert.equal(view.search.length,150);assert.equal(view.statusFilter,'all');assert.equal(view.typeFilter,'purchase');
 assert.equal(view.sortOrder,'date_asc');assert.equal(view.density,'compact');assert.equal(view.approvalFilter,'all');
});
test('DTO preserves reference-less rejection context without inventing a send time',()=>{
 const {ksefInfoFrom}=require('../../src/lib/dto.ts');
 const value=ksefInfoFrom({status:'REJECTED',environment:'production',processingCode:450,processingDescription:'Odrzucono'});
 assert.equal(value.processingDescription,'Odrzucono');assert.equal(value.sentAt,'');assert.equal(value.number,'');
 assert.equal(ksefPresentation({...invoice,ksef:value,ksefStatus:'rejected'}).rejectionMessage,'Odrzucono');
 assert.equal(ksefInfoFrom({processingDescription:'Unknown untyped metadata'}),undefined);
});
test('presentation never labels an unrecorded legacy environment as demo',()=>{
 const {ksefInfoFrom}=require('../../src/lib/dto.ts');
 const metadata=ksefInfoFrom({number:'actual-number',status:'ACTIVE'});
 assert.equal(metadata.environment,'demo','retain existing compatibility default for transport consumers');
 assert.equal(metadata.environmentRecorded,false);
 assert.equal(ksefPresentation({...invoice,ksef:metadata}).simulated,false);
 assert.equal(ksefPresentation({...invoice,ksef:metadata}).environment,undefined);
});
test('UI never offers a duplicate submission for a legacy uncertain acceptance',()=>{
 const {isKsefUiPending}=require('../../src/lib/ksef/presentation.ts');
 assert.equal(isKsefUiPending({...invoice,ksefStatus:'accepted',ksef:{status:'ACTIVE',number:''}}),true);
 assert.equal(isKsefUiPending({...invoice,ksefStatus:'rejected'}),false);
});

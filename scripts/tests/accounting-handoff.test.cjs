require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {readAccountingHandoff}=require('../../src/lib/accounting-handoff.ts');
const {appendAccountingCostSources}=require('../../src/lib/accounting-package-sources.ts');
test('month preparation separates advisory payment/source warnings and deduplicates KSeF expenses',async()=>{
 const doc={id:'a',number:'FV',type:'sale',status:'issued',documentStatus:'issued',currency:'PLN',paymentStatus:'unpaid'};
 const tx={invoice:{findMany:async()=>[doc,{...doc,id:'paid',status:'paid'},{...doc,id:'draft',documentStatus:'draft'},{...doc,id:'cancelled',documentStatus:'cancelled'},{...doc,id:'proforma',isProforma:true},{...doc,id:'purchase',type:'purchase',paymentStatus:'paid',ksefNumber:'KSEF-1'}]},expense:{findMany:async()=>[{id:'duplicate',number:'DUP',paymentStatus:'unpaid',ksefRefNumber:'KSEF-1'},{id:'cost',number:'COST',paymentStatus:'unpaid'}]},accountingWorkspace:{findUnique:async()=>({items:[{id:'missing',title:'Brak paragonu',kind:'missing',done:false},{id:'done',kind:'missing',done:true}]})},expenseScan:{findMany:async args=>{assert.equal(args.where.companyId,'company');assert.equal(args.where.createdAt.gte.toISOString(),'2026-10-01T00:00:00.000Z');assert.equal(args.where.createdAt.lt.toISOString(),'2026-11-01T00:00:00.000Z');return [{id:'scan',fileName:'pending.pdf'}];},count:async()=>12}};
 const result=await readAccountingHandoff(tx,'company','2026-10');assert.equal(result.unsettled.count,2);assert.equal(result.sources.count,1);assert.equal(result.missing.count,1);assert.equal(result.inbox.count,12);assert.equal(result.canClose,undefined);assert.equal(result.missing.items[0].href,'/accountant?month=2026-10#monthly-tasks');
});
test('package includes only linked company scans with a clean verdict and matching bytes',async()=>{
 const bytes=Buffer.from('%PDF-1.4 synthetic'),hash=createHash('sha256').update(bytes).digest('hex');
 const metadata=[{id:'clean',expenseId:'expense',sizeBytes:bytes.length,safetyStatus:'clean'},{id:'quarantine',expenseId:'blocked',sizeBytes:10,safetyStatus:'quarantined'}];
 const db={expenseScan:{findMany:async args=>{assert.equal(args.where.companyId,'company');return metadata;},findFirst:async args=>{assert.equal(args.where.companyId,'company');return {imageData:'data:application/pdf;base64,'+bytes.toString('base64'),sha256:hash,sizeBytes:bytes.length,mimeType:'application/pdf',expenseId:'expense'};}}};
 const files=[];const count=await appendAccountingCostSources(db,'company',[{id:'expense',number:'FV/1',scanId:'clean'},{id:'blocked',number:'FV/2',scanId:'quarantine'},{id:'missing',number:'FV/3',attachmentUrl:'https://example.invalid/never-fetch'}],files);
 assert.equal(count,1);assert.equal(files[0].name,'koszty/clean.pdf');assert.deepEqual(files[0].data,bytes);assert.match(files[1].data,/kwarantanna/);assert.match(files[1].data,/Zewnętrzne adresy nie są pobierane/);
 db.expenseScan.findFirst=async()=>({imageData:'data:application/pdf;base64,'+bytes.toString('base64'),sha256:'bad',sizeBytes:bytes.length,mimeType:'application/pdf',expenseId:'expense'});
 const broken=[];assert.equal(await appendAccountingCostSources(db,'company',[{id:'expense',number:'FV/1',scanId:'clean'}],broken),0);assert.match(broken[0].data,/integralności/);
});
test('oversized source batches fail before loading binary originals',async()=>{
 const db={expenseScan:{findMany:async()=>[{id:'a',sizeBytes:20_000_001,safetyStatus:'clean'}],findFirst:async()=>assert.fail('must not load original')}};
 await assert.rejects(appendAccountingCostSources(db,'company',[],[]),e=>e.status===413);
});

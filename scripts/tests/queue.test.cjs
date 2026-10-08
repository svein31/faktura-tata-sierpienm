require('../register-ts.cjs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const original = Module._load;
let mocked = {};
Module._load = function(request, parent, main) { return Object.hasOwn(mocked, request) ? mocked[request] : original.call(this,request,parent,main); };
function setup(status = 'PROCESSING', token = 'own-token') {
  for (const key of Object.keys(require.cache)) if (/[\\/]src[\\/]/.test(key)) delete require.cache[key];
  const writes = [], lookups = [];
  let sends = 0;
  const invoice = {id:'123456789012345678901234',userId:'owner',sellerCompanyId:'company',sellerCompany:{nip:'5260301706'},type:'sale',referenceNumber:'element',ksefStatus:'sending',ksef:{sessionReferenceNumber:'session'}};
  const task = {id:'task',userId:'actor',invoiceId:invoice.id,invoice,attempts:0,maxAttempts:5,environment:'test'};
  const db = {
    ksefQueueTask: {findMany:async q=>q.where.status==='processing'?[]:[task],updateMany:async()=>({count:1}),update:async q=>{writes.push(q.data);return q.data;}},
    invoice:{findMany:async()=>[],update:async q=>{writes.push(q.data);return q.data;}},
    ksefSession:{findFirst:async q=>{lookups.push(q.where);return token?{accessToken:token}:null;}},
    $transaction:async x=>Array.isArray(x)?Promise.all(x):x(db),
  };
  mocked = {
    '@/lib/db':{prisma:db},
    '@/lib/auth':{getSessionUser:async()=>({id:'actor'})},
    '@/lib/permissions':{requireCompanyAccess:async()=>({ok:true})},
    '@/lib/dto':{},
    '@/lib/email/auto-send': {processKsefAutoEmails: async()=>({checked:0,accepted:0}),triggerAutoEmailOnKsef:async()=>false},
    '@/lib/ksef/index':{KsefClient:class {async getInvoiceStatus(){return {status};} async sendInvoiceEncrypted(){sends++;throw new Error('must never resend');}}},
  };
  return {writes,lookups,sends:()=>sends};
}
const request=()=>new Request('http://localhost/api/ksef/queue/process',{method:'POST'});
test('pending KSeF status only polls with actor/NIP scope and never resends',async()=>{
  const state=setup(); const route=require('../../src/app/api/ksef/queue/process/route.ts');
  const res=await route.POST(request()); assert.equal(res.status,200); assert.equal(state.sends(),0);
  assert.equal(state.lookups[0].userId,'actor'); assert.equal(state.lookups[0].nip,'5260301706');
  assert.ok(state.writes.some(w=>w.status==='queued' && w.nextAttemptAt));
});
test('missing KSeF session requires reconciliation instead of resending',async()=>{
  const state=setup('PROCESSING',null); const route=require('../../src/app/api/ksef/queue/process/route.ts');
  assert.equal((await route.POST(request())).status,200); assert.equal(state.sends(),0);
  assert.ok(state.writes.some(w=>w.status==='verify_needed'));
});
test('worker rechecks permission after enqueue',async()=>{
  const state=setup(); mocked['@/lib/permissions']={requireCompanyAccess:async()=>({ok:false,error:'revoked',status:403})};
  const route=require('../../src/app/api/ksef/queue/process/route.ts');
  assert.equal((await route.POST(request())).status,200); assert.equal(state.sends(),0); assert.equal(state.lookups.length,0);
  assert.ok(state.writes.some(w=>w.status==='failed' && w.errorDetails==='revoked'));
});

test('worker automatically verifies a known ambiguous reference without enqueueing another send',async()=>{
  const state=setup();
  const db=mocked['@/lib/db'].prisma;
  const invoice={id:'123456789012345678901234',userId:'actor',sellerCompanyId:'company',updatedAt:new Date(0),referenceNumber:'existing-reference',ksefStatus:'verify_needed',ksefSession:null};
  let confirmations=0;
  db.invoice.findMany=async()=>[invoice];
  db.invoice.updateMany=async()=>({count:1});
  db.ksefQueueTask.findFirst=async()=>({userId:'actor'});
  const previousFind=db.ksefQueueTask.findMany;
  db.ksefQueueTask.findMany=async query=>query.where.status==='queued'?[]:previousFind(query);
  mocked['@/lib/ksef/reconcile-status']={reconcileKsefInvoice:async(document,actor)=>{assert.equal(document.referenceNumber,'existing-reference');assert.equal(actor.id,'actor');confirmations++;}};
  const route=require('../../src/app/api/ksef/queue/process/route.ts');
  assert.equal((await route.POST(request())).status,200);
  assert.equal(confirmations,1);assert.equal(state.sends(),0);assert.equal(state.writes.length,0);
});
test('worker does not reuse revoked sender access when verifying an old transmission',async()=>{
  const state=setup();const db=mocked['@/lib/db'].prisma;
  db.invoice.findMany=async()=>[{id:'invoice',userId:'owner',sellerCompanyId:'company',updatedAt:new Date(0),referenceNumber:'existing'}];
  db.invoice.updateMany=async()=>({count:1});db.ksefQueueTask.findFirst=async()=>({userId:'revoked-actor'});
  db.ksefQueueTask.findMany=async()=>[];
  mocked['@/lib/permissions']={requireCompanyAccess:async()=>({ok:false,error:'revoked',status:403})};
  mocked['@/lib/ksef/reconcile-status']={reconcileKsefInvoice:async()=>{throw new Error('Revoked sender must not verify');}};
  const route=require('../../src/app/api/ksef/queue/process/route.ts');
  assert.equal((await route.POST(request())).status,200);assert.equal(state.sends(),0);
});
test('email outbox runs even when the KSeF queue is empty and keeps the authenticated user scope', async()=>{
  setup(); const db = mocked['@/lib/db'].prisma;
  db.ksefQueueTask.findMany = async()=>[];
  const calls = [];
  mocked['@/lib/email/auto-send'] = { processKsefAutoEmails: async (userId,options) => { calls.push({userId,options}); return {checked:1,accepted:1}; } };
  const route=require('../../src/app/api/ksef/queue/process/route.ts');
  const response = await route.POST(request()), body = await response.json();
  assert.equal(response.status,200); assert.equal(calls.length,2); assert.ok(calls.every(call=>call.userId==='actor'));
  assert.equal(calls[0].options.maintenanceOnly,true);assert.equal(calls[1].options.skipMaintenance,true);
  assert.equal(calls[0].options.deadlineAtMs,calls[1].options.deadlineAtMs);
  assert.equal(body.processedCount,0); assert.deepEqual(body.autoEmail,{checked:1,accepted:1});
});
test('a slow status check stops starting new tasks and preserves an email reserve', async()=>{
  const state=setup(); const db=mocked['@/lib/db'].prisma;
  const actualNow=Date.now;let clock=actualNow();Date.now=()=>clock;
  const first={id:'first',userId:'actor',invoiceId:'123456789012345678901234',invoice:{id:'123456789012345678901234',userId:'actor',sellerCompanyId:'company',sellerCompany:{nip:'5260301706'},type:'sale',referenceNumber:'reference',ksef:{sessionReferenceNumber:'session'}},attempts:0,maxAttempts:5,environment:'test'};
  const second={...first,id:'second'};const claimed=[];const deadlines=[];const mail=[];
  db.ksefQueueTask.findMany=async q=>q.where.status==='processing'?[]:[first,second];
  db.ksefQueueTask.updateMany=async q=>{claimed.push(q.where.id);return {count:1};};
  mocked['@/lib/ksef/index']={KsefClient:class{constructor(options){deadlines.push(options.deadlineAtMs);}async getInvoiceStatus(){clock+=14_000;return {status:'PROCESSING'};}}};
  mocked['@/lib/email/auto-send']={processKsefAutoEmails:async(_scope,options)=>{mail.push({clock,options});return {checked:0,accepted:0};}};
  try {
    const route=require('../../src/app/api/ksef/queue/process/route.ts');
    const body=await (await route.POST(request())).json();
    assert.deepEqual(claimed,['first'],'Second task remains queued and unclaimed');
    assert.equal(body.processedCount,1);assert.equal(body.deferredTasks,1);
    assert.equal(deadlines[0],mail[0].options.deadlineAtMs-6_000);
    assert.equal(mail[1].options.deadlineAtMs-mail[1].clock,6_000,'SMTP retains its budget after a slow MF call');
    assert.equal(state.sends(),0);
  } finally {Date.now=actualNow;}
});
test('expired request budget does not claim a KSeF job or submit a document',async()=>{
  setup();const actualNow=Date.now;let clock=actualNow();Date.now=()=>clock;
  let claims=0;const db=mocked['@/lib/db'].prisma;
  db.ksefQueueTask.updateMany=async()=>{claims++;return {count:1};};
  mocked['@/lib/email/auto-send']={processKsefAutoEmails:async(_scope,options)=>{if(options.maintenanceOnly)clock+=21_000;return {checked:0,accepted:0};}};
  try {
    const body=await (await require('../../src/app/api/ksef/queue/process/route.ts').POST(request())).json();
    assert.equal(claims,0);assert.equal(body.processedCount,0);assert.equal(body.budgetExhausted,true);
  }finally{Date.now=actualNow;}
});
test('a valid actor/NIP/environment MF session is reused without repeated authentication',async()=>{
  const state=setup();const db=mocked['@/lib/db'].prisma;
  const invoice={id:'123456789012345678901234',userId:'owner',sellerCompanyId:'company',sellerCompany:{nip:'5260301706',ksefToken:'synthetic-token'},type:'sale',referenceNumber:null,ksefStatus:'queued',ksefXml:'<Faktura>synthetic</Faktura>',version:1};
  const task={id:'task',userId:'actor',invoiceId:invoice.id,invoice,attempts:0,maxAttempts:5,environment:'test'};
  db.ksefQueueTask.findMany=async q=>q.where.status==='processing'?[]:[task];
  db.ksefSession.upsert=async()=>{throw new Error('Valid session should not authenticate again');};
  const submissions=[];let claims=0;
  mocked['@/lib/ksef/transmission-claim']={claimKsefTransmission:async(_tx,input)=>{claims++;assert.equal(input.userId,'actor');}};
  mocked['@/lib/ksef/index']={validateFa3Xml:()=>({ok:true}),KsefClient:class{
    async loginWithKsefToken(){throw new Error('Valid scoped session should avoid authentication');}
    async openOnlineSession(token){assert.equal(token,'own-token');return{referenceNumber:'online-session',symmetricKey:Buffer.alloc(32),iv:Buffer.alloc(16)};}
    async sendInvoiceEncrypted(...args){submissions.push(args);return{elementReferenceNumber:'new-reference'};}
  }};
  const body=await (await require('../../src/app/api/ksef/queue/process/route.ts').POST(request())).json();
  assert.equal(body.processedCount,1);assert.equal(claims,1);assert.equal(submissions.length,1);
  assert.equal(submissions[0][0],'own-token');assert.equal(submissions[0][1],'online-session');
  assert.equal(state.lookups[0].userId,'actor');assert.equal(state.lookups[0].nip,'5260301706');assert.equal(state.lookups[0].environment,'test');
  assert.ok(state.lookups[0].validUntil.gt.getTime()>Date.now()+50_000);
});

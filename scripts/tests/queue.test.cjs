require('../register-ts.cjs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const original = Module._load;
let mocked = {};
Module._load = function(request, parent, main) { return Object.hasOwn(mocked, request) ? mocked[request] : original.call(this,request,parent,main); };
function setup(status = 'PROCESSING', token = 'own-token') {
  for (const key of Object.keys(require.cache)) if (key.includes('/src/')) delete require.cache[key];
  const writes = [], lookups = [];
  let sends = 0;
  const invoice = {id:'123456789012345678901234',userId:'owner',sellerCompanyId:'company',sellerCompany:{nip:'5260301706'},type:'sale',referenceNumber:'element',ksefStatus:'sending',ksef:{sessionReferenceNumber:'session'}};
  const task = {id:'task',userId:'actor',invoiceId:invoice.id,invoice,attempts:0,maxAttempts:5,environment:'test'};
  const db = {
    ksefQueueTask: {findMany:async q=>q.where.status==='processing'?[]:[task],updateMany:async()=>({count:1}),update:async q=>{writes.push(q.data);return q.data;}},
    invoice:{update:async q=>{writes.push(q.data);return q.data;}},
    ksefSession:{findFirst:async q=>{lookups.push(q.where);return token?{accessToken:token}:null;}},
    $transaction:async x=>Array.isArray(x)?Promise.all(x):x(db),
  };
  mocked = {
    '@/lib/db':{prisma:db},
    '@/lib/auth':{getSessionUser:async()=>({id:'actor'})},
    '@/lib/permissions':{requireCompanyAccess:async()=>({ok:true})},
    '@/lib/dto':{},
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

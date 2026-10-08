require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
test('KSeF request deadline is shared across calls and never starts an expired request',async()=>{
  const clientPath=require.resolve('../../src/lib/ksef/client.ts');delete require.cache[clientPath];
  const {KsefClient}=require(clientPath);const previousFetch=global.fetch;
  let calls=0;
  global.fetch=async()=>{calls++;return Response.json({ok:true});};
  try{
    const client=new KsefClient({environment:'test',deadlineAtMs:Date.now()-1});
    await assert.rejects(client.request('/synthetic'),error=>error.errorCode==='WORKER_DEADLINE');
    assert.equal(calls,0);
    const next=new KsefClient({environment:'test',timeoutMs:5_000,deadlineAtMs:Date.now()+20});
    global.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));
    const started=Date.now();await assert.rejects(next.request('/synthetic'),error=>error.errorCode==='TIMEOUT');
    assert.ok(Date.now()-started<500,'Total deadline overrides a long per-request timeout');
  }finally{global.fetch=previousFetch;delete require.cache[clientPath];}
});
test('operator queue metrics require a secret and never return document details',async()=>{
  const routePath=require.resolve('../../src/app/api/ops/queue-health/route.ts');delete require.cache[routePath];
  const oldSecret=process.env.CRON_SECRET,oldFallback=process.env.KSEF_QUEUE_SECRET;
  let reads=0;
  Module._load=function(request,parent,main){if(request==='@/lib/ksef/queue-health')return{getQueueHealth:async()=>{reads++;return{ok:true,ksef:{due:61},email:{due:2}};}};return original.call(this,request,parent,main);};
  const {GET}=require(routePath);Module._load=original;
  try{
    delete process.env.CRON_SECRET;delete process.env.KSEF_QUEUE_SECRET;
    assert.equal((await GET(new Request('http://localhost/api/ops/queue-health'))).status,503);
    process.env.CRON_SECRET='synthetic-queue-secret';
    assert.equal((await GET(new Request('http://localhost/api/ops/queue-health'))).status,401);
    assert.equal(reads,0);
    const response=await GET(new Request('http://localhost/api/ops/queue-health',{headers:{authorization:'Bearer synthetic-queue-secret'}}));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,1);
    assert.deepEqual(await response.json(),{ok:true,ksef:{due:61},email:{due:2}});
  }finally{
    if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
    if(oldFallback===undefined)delete process.env.KSEF_QUEUE_SECRET;else process.env.KSEF_QUEUE_SECRET=oldFallback;
    Module._load=original;delete require.cache[routePath];
  }
});

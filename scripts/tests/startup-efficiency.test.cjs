require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { dataLoadPolicy, bootstrapUrl, createSingleFlight } = require('../../src/lib/data-load-policy.ts');
const { createAppStore } = require('../../src/lib/store.ts');
const { privateEtag, privateResponse } = require('../../src/lib/server/private-response.ts');
const fixture = (id='a') => ({company:{id,userId:'owner',isDefault:true},companies:[{id,userId:'owner',isDefault:true},{id:'b',userId:'owner'}],ksef:null,contractors:[],products:[],invoices:[],notifications:[],notificationPrefs:{browserEnabled:false,soundEnabled:false},dataMode:'shell'});

test('route policy keeps first views free of catalogs and scopes legacy consumers without truncating finance',()=>{
  for(const path of ['/dashboard','/invoices','/invoices/'+'a'.repeat(24)]) assert.deepEqual(dataLoadPolicy(path,'a'),{mode:'shell',companyId:undefined});
  assert.deepEqual(dataLoadPolicy('/invoices/new','b'),{mode:'list',companyId:'b'});
  assert.deepEqual(dataLoadPolicy('/finances','a'),{mode:'full',companyId:'a'});
  assert.deepEqual(dataLoadPolicy('/settings/companies','a'),{mode:'full',companyId:undefined});
  assert.equal(bootstrapUrl('shell','a'),'/api/data?mode=shell');
  assert.equal(bootstrapUrl('list','a'),'/api/data?invoiceMode=list&companyId=a');
  assert.equal(bootstrapUrl('full'),'/api/data');
});

test('concurrent reads share only pending work and retry normally after failures',async()=>{
  const reads=createSingleFlight();let resolve,calls=0;
  const load=()=>{calls++;return new Promise(done=>resolve=done);};
  const first=reads.run('a',load),second=reads.run('a',load);
  assert.equal(first,second);assert.equal(calls,1);resolve('ok');assert.equal(await first,'ok');
  await assert.rejects(reads.run('a',async()=>{throw Error('offline');}),/offline/);
  assert.equal(await reads.run('a',async()=> 'fresh'),'fresh');
  const old=reads.run('a',load);reads.clear();const current=reads.run('a',async()=> 'after reset');resolve('obsolete');
  assert.equal(await old,'obsolete');assert.equal(await current,'after reset');
});

test('one store coalesces overlapping refreshes while another actor has an independent request',async()=>{
  const previous=global.fetch,requests=[];global.fetch=()=>new Promise(resolve=>requests.push(resolve));
  try {
    const a=createAppStore(fixture()),b=createAppStore(fixture('b'));
    const first=a.getState().revalidate(),second=a.getState().revalidate(),other=b.getState().revalidate();
    assert.equal(requests.length,2);
    requests[0](Response.json(fixture()));requests[1](Response.json(fixture('b')));
    await Promise.all([first,second,other]);assert.equal(a.getState().selectedCompanyId,'a');assert.equal(b.getState().selectedCompanyId,'b');
    const fresh=a.getState().revalidate();assert.equal(requests.length,3);requests[2](Response.json(fixture()));await fresh;
  } finally {global.fetch=previous;}
});

test('company change fences a late catalog and clears the old scoped data before another screen can use it',async()=>{
  const previous=global.fetch;let finish;global.fetch=()=>new Promise(resolve=>finish=resolve);
  try {
    const a=createAppStore({...fixture(),dataMode:'list',dataCompanyId:'a',contractors:[{id:'private-a'}]});
    const request=a.getState().bootstrap('list','a');a.getState().setSelectedCompanyId('b');
    assert.deepEqual(a.getState().contractors,[]);
    finish(Response.json({...fixture(),contractors:[{id:'late-a'}]}));await request;
    assert.equal(a.getState().selectedCompanyId,'b');assert.deepEqual(a.getState().contractors,[]);
  } finally {global.fetch=previous;}
});

test('access failures remove private catalog data instead of retaining a revoked refresh',async()=>{
  const previous=global.fetch;
  try {
    for(const status of [401,403]) {
      const a=createAppStore({...fixture(),contractors:[{id:'private'}],products:[{id:'private'}],invoices:[{id:'private'}]});
      global.fetch=async()=>Response.json({error:'Denied'},{status});await a.getState().revalidate();
      assert.deepEqual(a.getState().contractors,[]);assert.deepEqual(a.getState().products,[]);assert.deepEqual(a.getState().invoices,[]);
      if(status===401)assert.equal(a.getState().authError,true);else assert.equal(a.getState().company,null);
    }
  } finally {global.fetch=previous;}
});

test('a rapid A to B to A starts a fresh authorised read rather than joining an obsolete request',async()=>{
  const previous=global.fetch,requests=[];global.fetch=()=>new Promise(resolve=>requests.push(resolve));
  try {
    const a=createAppStore(fixture());
    const old=a.getState().bootstrap('list','a');a.getState().setSelectedCompanyId('b');a.getState().setSelectedCompanyId('a');
    const current=a.getState().bootstrap('list','a');assert.equal(requests.length,2);
    requests[0](Response.json({...fixture(),contractors:[{id:'obsolete'}]}));await old;assert.deepEqual(a.getState().contractors,[]);
    requests[1](Response.json({...fixture(),contractors:[{id:'current'}]}));await current;assert.equal(a.getState().contractors[0].id,'current');
  } finally {global.fetch=previous;}
});

test('company-list refresh uses the shell without replacing a loaded editor catalog',async()=>{
  const previous=global.fetch;const urls=[];
  try {
    const a=createAppStore({...fixture(),dataMode:'list',dataCompanyId:'a',contractors:[{id:'editor-row'}]});
    global.fetch=async url=>{urls.push(url);return Response.json(fixture());};
    await a.getState().fetchCompanies();assert.deepEqual(urls,['/api/data?mode=shell']);assert.equal(a.getState().contractors[0].id,'editor-row');
  } finally {global.fetch=previous;}
});

test('an editor saves the opened detail version after catalog refresh without loading all invoices or bypassing purchase policy',async()=>{
  const previous=global.fetch,requests=[];
  try {
    const a=createAppStore(fixture()),id='c'.repeat(24);
    a.getState().setDraft({id,type:'sale',sellerCompanyId:'a',version:7,number:'OPEN/DETAIL',lines:[{name:'Original'}]},false);
    global.fetch=async(url,options)=>{
      requests.push({url,options});
      return options.method==='PUT'?Response.json({invoice:{id,version:8}}):Response.json(fixture());
    };
    await a.getState().bootstrap('list','a');assert.deepEqual(a.getState().invoices,[]);
    await a.getState().updateInvoice(id,{notes:'Changed explicitly'});
    assert.equal(requests.length,2);assert.equal(requests[1].options.method,'PUT');
    const payload=JSON.parse(requests[1].options.body);assert.equal(payload.version,7);assert.equal(payload.number,'OPEN/DETAIL');assert.equal(payload.notes,'Changed explicitly');
    a.getState().setDraft({id,type:'purchase'},false);
    await assert.rejects(a.getState().updateInvoice(id,{notes:'Blocked'}));assert.equal(requests.length,2);
    a.getState().setDraft(null,true);await assert.rejects(a.getState().updateInvoice(id,{notes:'Missing'}),/Nie znaleziono/);assert.equal(requests.length,2);
  } finally {global.fetch=previous;}
});

test('private validators omit unchanged bodies but never introduce public caching',async()=>{
  const data={invoices:[{id:'a',paidAmount:0}],contractors:[{id:'c',name:'Actual buyer'}]},tag=privateEtag(data);
  const request=new Request('http://localhost/api/invoices/search',{headers:{'If-None-Match':tag}});
  const unchanged=privateResponse(request,data);assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
  assert.equal(unchanged.headers.get('cache-control'),'no-store');assert.equal(unchanged.headers.get('vary'),'Cookie');
  assert.equal(privateResponse(request,{...data,invoices:[{id:'a',paidAmount:5}]}).status,200);
  assert.equal(privateResponse(request,{...data,contractors:[{id:'c',name:'Renamed buyer'}]}).status,200);
});

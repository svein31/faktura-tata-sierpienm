const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(fetcher) {
  const listeners = new Map(), stores = new Map();
  const key = request => typeof request === 'string' ? request : request.url;
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return {
      async add(url) { data.set(url, new Response('generic offline', {headers:{'content-type':'text/html'}})); },
      async match(request) { return data.get(key(request))?.clone(); },
      async put(request, response) { data.set(key(request), response); },
      async keys() { return [...data.keys()].map(url=>({url})); },
      async delete(request) { return data.delete(key(request)); },
    };
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'),'utf8'), {
    URL, Response, Promise,
    self: {location:{origin:'https://app.example'},addEventListener:(name,callback)=>listeners.set(name,callback),skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches: {open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},
    fetch: fetcher,
  });
  return {
    stores,
    async request(url, options={}) {
      const pending=[];let handled=false,response;
      const request={url:'https://app.example'+url,method:'GET',mode:'cors',cache:'default',headers:new Headers(),...options};
      listeners.get('fetch')({request,respondWith:promise=>{handled=true;response=promise;},waitUntil:promise=>pending.push(promise)});
      if (!handled) return {handled};
      response=await response;await Promise.all(pending);return {handled,response};
    },
    async install() { const pending=[];listeners.get('install')({waitUntil:p=>pending.push(p)});await Promise.all(pending); },
  };
}
const asset = () => new Response('public build code', {headers:{'cache-control':'public, max-age=31536000, immutable','content-type':'application/javascript'}});

test('hashed build assets are cached once; API, documents and private HTML are never cached', async () => {
  let calls=0;const runtime=worker(async()=>{calls++;return asset();});
  const url='/_next/static/chunks/page-123456789abc.js';
  assert.equal((await runtime.request(url)).handled,true);
  assert.equal((await runtime.request(url)).handled,true);
  assert.equal(calls,1);
  for (const forbidden of ['/api/invoices','/invoices/secret','/api/invoices/id/pdf','/invoice.pdf','/_next/static/chunks/page.js','/_next/static/chunks/page-123456789abc.js?token=secret']) {
    assert.equal((await runtime.request(forbidden)).handled,false,forbidden);
  }
  assert.equal((await runtime.request(url,{method:'POST'})).handled,false);
  assert.equal((await runtime.request(url,{headers:new Headers({authorization:'Bearer secret'})})).handled,false);
  assert.equal((await runtime.request(url,{cache:'no-store'})).handled,false);
  assert.equal(runtime.stores.get('fakturaprosto-static-v1').size,1);
});

test('immutable URL cannot make private, HTML, JSON or unsuccessful responses cacheable', async () => {
  for (const response of [
    new Response('private',{headers:{'cache-control':'private, immutable','content-type':'application/javascript'}}),
    new Response('html',{headers:{'cache-control':'public, immutable','content-type':'text/html'}}),
    new Response('json',{headers:{'cache-control':'public, immutable','content-type':'application/json'}}),
    new Response('failed',{status:500,headers:{'cache-control':'public, immutable','content-type':'application/javascript'}}),
  ]) {
    const runtime=worker(async()=>response.clone());
    await runtime.request('/_next/static/chunks/page-123456789abc.js');
    assert.equal(runtime.stores.get('fakturaprosto-static-v1').size,0);
  }
});

test('parallel assets remain bounded to 80 entries and private navigation gets only generic offline fallback', async () => {
  const runtime=worker(async request=>{
    if(request.mode==='navigate') throw new Error('offline');
    return asset();
  });
  await runtime.install();
  await Promise.all(Array.from({length:96},(_,index)=>runtime.request('/_next/static/chunks/page-'+index.toString(16).padStart(8,'0')+'.js')));
  assert.equal(runtime.stores.get('fakturaprosto-static-v1').size,80);
  const offline=await runtime.request('/invoices/private-id',{mode:'navigate'});
  assert.equal(await offline.response.text(),'generic offline');
  assert.deepEqual([...runtime.stores.get('fakturaprosto-offline-v1').keys()],['/offline.html']);
  assert.ok(![...runtime.stores.get('fakturaprosto-static-v1').keys()].some(key=>key.includes('private-id')));
  runtime.stores.get('fakturaprosto-offline-v1').clear();
  const evicted = await runtime.request('/invoices/private-id',{mode:'navigate'});
  assert.equal(evicted.response.status,503);
  assert.equal(await evicted.response.text(),'Brak połączenia');
});

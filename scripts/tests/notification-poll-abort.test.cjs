require('../register-ts.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAppStore}=require('../../src/lib/store.ts');

test('a notification response completing after cancellation cannot overwrite the store',async t=>{
 const store=createAppStore(), controller=new AbortController();
 const original=[{id:'existing',title:'Existing',read:false}];store.setState({notifications:original});
 let finish;const reading=new Promise(resolve=>finish=resolve);
 t.mock.method(globalThis,'fetch',async(_url,options)=>{assert.equal(options.signal,controller.signal);return {status:200,ok:true,json:()=>reading};});
 const pending=store.getState().fetchNotifications(controller.signal);
 await new Promise(resolve=>setImmediate(resolve));controller.abort();finish({notifications:[{id:'late',read:false}],unread:1});
 await pending;assert.deepEqual(store.getState().notifications,original);
});
test('a cancelled old-session 401 cannot mark the current store as unauthenticated',async t=>{
 const store=createAppStore(), controller=new AbortController();let finish;
 t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>finish=resolve));
 const pending=store.getState().fetchNotifications(controller.signal);controller.abort();finish({status:401,ok:false});
 await pending;assert.equal(store.getState().authError,false);
});

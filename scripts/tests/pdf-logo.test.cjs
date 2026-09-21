require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
test('remote PDF logos pin public DNS, reject redirects and bound image bodies',async()=>{
 const Module=require('node:module'),{EventEmitter}=require('node:events'),original=Module._load;
 let addresses=['8.8.8.8'],status=200,mime='image/png',size=10,requests=0,pinned;
 Module._load=function(name,...rest){
  if(name==='node:dns/promises')return {resolve4:async()=>addresses};
  if(name==='node:https')return {request:(_url,options,callback)=>{
   requests++;options.lookup('example.com',{},(error,address)=>{assert.equal(error,null);pinned=address;});
   const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close');};
   req.end=()=>{
    const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':mime};
    let destroyed=false;res.destroy=error=>{destroyed=true;if(error)res.emit('error',error);};
    callback(res);if(!destroyed){res.emit('data',Buffer.alloc(size));if(!destroyed)res.emit('end');}
    req.emit('close');
   };return req;
  }};
  return original.call(this,name,...rest);
 };
 let remoteLogo;try{remoteLogo=require('../../src/lib/pdf/remote-logo.ts').remoteLogo;}finally{Module._load=original;}
 assert.equal((await remoteLogo('https://example.com/logo')).bytes.length,10);assert.equal(pinned,'8.8.8.8');
 status=302;await assert.rejects(remoteLogo('https://example.com/logo'),/przekierowania/);
 status=200;mime='text/html';await assert.rejects(remoteLogo('https://example.com/logo'),/PNG/);
 mime='image/png';size=2*1024*1024+1;await assert.rejects(remoteLogo('https://example.com/logo'),/2 MB/);
 addresses=['8.8.8.8','127.0.0.1'];const before=requests;await assert.rejects(remoteLogo('https://example.com/logo'),/publicznego/);assert.equal(requests,before);
 await assert.rejects(remoteLogo('http://example.com/logo'));
});

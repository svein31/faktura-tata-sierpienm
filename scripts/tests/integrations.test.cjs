require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {publicIpv4,webhookUrl,sealWebhook,openWebhook,webhookSignature}=require('../../src/lib/integration-security.ts');
test('webhook rejects local, metadata, shared and special IPv4 ranges and non-HTTPS destinations',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','172.16.0.1','192.168.1.1','0.0.0.0','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1','203.0.113.1']) assert.equal(publicIpv4(ip),false,ip);
 assert.equal(publicIpv4('8.8.8.8'),true);
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com:8443/','file:///tmp/test']) assert.throws(()=>webhookUrl(url));
 assert.equal(webhookUrl('https://example.com/event').hostname,'example.com');
});
test('webhook secrets bind to company and signatures bind to exact timestamp and payload',()=>{
 process.env.WEBHOOK_ENCRYPTION_KEY='ab'.repeat(32);
 const sealed=sealWebhook('secret','company');assert.equal(openWebhook(sealed,'company'),'secret');assert.throws(()=>openWebhook(sealed,'other'));
 assert.notEqual(webhookSignature('secret','123','{}'),webhookSignature('secret','124','{}'));
 assert.notEqual(webhookSignature('secret','123','{}'),webhookSignature('secret','123','{ }'));
});
test('HTTPS transport pins validated DNS and never follows redirects',async()=>{
 const Module=require('node:module'),{EventEmitter}=require('node:events'),original=Module._load;
 let addresses=['8.8.8.8'],status=204,requests=0,pinned;
 Module._load=function(name,...rest){
  if(name==='node:dns/promises')return {resolve4:async()=>addresses};
  if(name==='node:https')return {request:(_url,options,callback)=>{
   requests++;options.lookup('example.com',{},(error,address)=>{assert.equal(error,null);pinned=address;});
   const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close');};
   req.end=()=>{callback({statusCode:status,destroy(){}});req.emit('close');};return req;
  }};
  return original.call(this,name,...rest);
 };
 let send;try{send=require('../../src/lib/webhook-transport.ts').sendWebhook;}finally{Module._load=original;}
 await send('https://example.com/events','{}',{});assert.equal(pinned,'8.8.8.8');
 status=302;await assert.rejects(send('https://example.com/events','{}',{}),/HTTP 302/);assert.equal(requests,2);
 addresses=['8.8.8.8','127.0.0.1'];await assert.rejects(send('https://example.com/events','{}',{}),/publicznego/);assert.equal(requests,2);
});

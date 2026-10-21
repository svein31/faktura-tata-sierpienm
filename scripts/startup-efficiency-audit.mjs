import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';

/** All financial/catalog writes target the isolated runner's synthetic database. */
export async function auditStartupEfficiency(base,db) {
  assert.equal(new URL(base).hostname,'127.0.0.1');let checks=0;
  const actor=async name=>{
    const user=await db.user.create({data:{name,email:`startup-${name}@example.invalid`,password:'unusable-test-password'}}),token=randomBytes(32).toString('base64url');
    const session=await db.session.create({data:{userId:user.id,sessionToken:'sha256:'+createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)}});
    return {...user,cookie:'auth_session='+token,session};
  };
  const owner=await actor('owner'),member=await actor('member'),stranger=await actor('stranger');
  const a=await db.companyProfile.create({data:{userId:owner.id,nip:'5260301706',companyName:'Startup company A',isDefault:true}}),b=await db.companyProfile.create({data:{userId:owner.id,nip:'5250001003',companyName:'Startup company B',isDefault:false}});
  const address={street:'Synthetic 1',city:'Warszawa',postal:'00-001',country:'PL'};
  for(const [company,count] of [[a,35],[b,5]]) {
    await db.contractor.createMany({data:Array.from({length:count},(_,i)=>({userId:owner.id,companyId:company.id,name:`Startup ${company.id} buyer ${i}`,nip:'5250001003',address}))});
    await db.product.createMany({data:Array.from({length:count},(_,i)=>({userId:owner.id,companyId:company.id,name:`Startup ${company.id} product ${i}`,sku:`SKU-${i}`,unit:'szt.',netPrice:i+1,vatRate:'23'}))});
  }
  const contact=await db.contractor.findFirstOrThrow({where:{companyId:a.id}}),other=await db.contractor.findFirstOrThrow({where:{companyId:b.id}});
  const legacy=await db.contractor.create({data:{userId:stranger.id,name:'Linked legacy buyer',nip:'5250001003',address}});
  const day=new Date().toISOString().slice(0,10),issue=async(company,contact,number)=>db.invoice.create({data:{userId:owner.id,sellerCompanyId:company.id,contractorId:contact.id,number,type:'sale',status:'issued',documentStatus:'issued',issueDate:day,saleDate:day,dueDate:day,currency:'PLN',totalNet:100,totalVat:23,totalGross:123,lines:[{id:'line',name:'Synthetic service',unit:'szt.',quantity:1,netPrice:100,vatRate:'23'}]}});
  const invoice=await issue(a,contact,'STARTUP/A');await issue(a,legacy,'STARTUP/LEGACY');const otherInvoice=await issue(b,other,'STARTUP/B');
  const get=async(path,expected=200,user=owner,tag)=>{
    const response=await fetch(base+path,{headers:{Cookie:user?.cookie||'',...(tag?{'If-None-Match':tag}:{})},signal:AbortSignal.timeout(30000)});
    const text=await response.text();assert.equal(response.status,expected,path+': '+text);checks++;
    assert.ok(response.headers.get('cache-control')?.includes('no-store'));return {response,data:text?JSON.parse(text):null,text};
  };
  const full=(await get('/api/data?invoiceMode=list')).data;
  assert.ok(full.contractors.some(row=>row.id===other.id));assert.ok(full.contractors.some(row=>row.id===legacy.id));
  const shell=(await get('/api/data?mode=shell')).data;
  assert.deepEqual([shell.contractors,shell.products,shell.invoices],[[],[],[]]);assert.equal(shell.companies.length,2);assert.equal(shell.dataMode,'shell');
  const scoped=(await get('/api/data?companyId='+a.id)).data;
  assert.ok(scoped.contractors.every(row=>row.companyId!==b.id));assert.ok(scoped.products.every(row=>row.companyId===a.id));assert.equal(scoped.invoices.length,2);assert.ok(scoped.invoices.every(row=>row.sellerCompanyId===a.id));
  const unassigned=(await get('/api/data?companyId=unassigned')).data;assert.equal(unassigned.invoices.length,0);assert.equal(unassigned.products.length,0);
  await get('/api/data?companyId='+a.id,403,stranger);await get('/api/data?mode=shell',401,null);await get('/api/data?companyId=bad',400);
  const detail=(await get('/api/invoices/'+otherInvoice.id)).data;assert.equal(detail.contractor.id,other.id);assert.equal(detail.contractor.companyId,b.id);
  await get('/api/invoices/'+otherInvoice.id,404,stranger);
  const catalog='/api/catalog/search?companyId='+a.id;
  const first=(await get(catalog)).data;assert.equal(first.contractors.length,30);assert.equal(first.products.length,30);assert.ok(first.contractorCursor);assert.ok(first.productCursor);
  const second=(await get(catalog+'&contractorCursor='+first.contractorCursor+'&productCursor='+first.productCursor)).data;
  assert.equal(second.contractors.length,6);assert.equal(second.products.length,5);assert.equal(new Set([...first.contractors,...second.contractors].map(row=>row.id)).size,36);assert.ok(second.contractors.some(row=>row.id===legacy.id)||first.contractors.some(row=>row.id===legacy.id));
  assert.equal((await get(catalog+'&search=SKU-34')).data.products.length,1);
  await get(catalog+'&productCursor=bad',400);await get(catalog+'&search='+'a'.repeat(151),400);await get(catalog,401,null);await get(catalog,403,stranger);
  const path='/api/invoices/search?companyId='+a.id;
  const list=await get(path),tag=list.response.headers.get('etag');assert.ok(tag);assert.equal(list.data.contractors.length,2);assert.ok(list.data.contractors.every(row=>[contact.id,legacy.id].includes(row.id)));
  assert.equal((await get(path,304,owner,tag)).text,'');await get(path,403,stranger,tag);
  await db.contractor.update({where:{id:contact.id},data:{name:'Renamed actual buyer'}});
  const renamed=await get(path,200,owner,tag);assert.notEqual(renamed.response.headers.get('etag'),tag);assert.ok(renamed.data.contractors.some(row=>row.name==='Renamed actual buyer'));
  await db.invoice.update({where:{id:invoice.id},data:{paidAmount:25,paymentStatus:'partially_paid',version:{increment:1}}});
  const paid=await get(path,200,owner,renamed.response.headers.get('etag'));assert.equal(paid.data.invoices.find(row=>row.id===invoice.id).paidAmount,25);
  const overview='/api/overview?companyId='+a.id+'&months=6',initial=await get(overview),overviewTag=initial.response.headers.get('etag');assert.ok(overviewTag);await get(overview,304,owner,overviewTag);
  await db.bankTransaction.create({data:{userId:owner.id,accountId:a.id,externalId:'startup-pending',bookingDate:day,amount:20,currency:'PLN',direction:'in',description:'Synthetic startup payment'}});
  assert.equal((await get(overview,200,owner,overviewTag)).data.counts.unmatched,1);
  const tiedBuyers=await db.contractor.findMany({where:{companyId:a.id},take:12,orderBy:{id:'asc'}});
  for(const [index,buyer] of tiedBuyers.entries())await issue(a,buyer,'STARTUP/TIED/'+index);
  const stable=await get(overview);assert.equal(stable.data.contractors[0].rows.length,8);
  for(let repeat=0;repeat<3;repeat++)await get(overview,304,owner,stable.response.headers.get('etag'));
  await db.companyMember.create({data:{userId:member.id,companyId:a.id,role:'employee'}});
  const memberList=await get(path,200,member);await get(catalog,200,member);
  await db.companyMember.delete({where:{companyId_userId:{companyId:a.id,userId:member.id}}});
  await get(path,403,member,memberList.response.headers.get('etag'));await get(catalog,403,member);await get('/api/data?companyId='+a.id,403,member);
  await db.session.delete({where:{id:owner.session.id}});await get(path,401,owner,paid.response.headers.get('etag'));await get(overview,401,owner,overviewTag);
  console.log(`[startup-efficiency-audit] PASS ${checks} HTTP checks; shell payload, scoped catalogs, pagination, legacy references, validators, live revocation and current payment/contact updates`);
}

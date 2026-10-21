import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('./register-ts.cjs');
const {catalogWorkbook:spreadsheet}=require('./fixtures/catalog-workbook.cjs');

/** Synthetic, loopback-only import and month-preparation regression. */
export async function auditCatalogAccounting(base,db) {
  assert.equal(new URL(base).hostname,'127.0.0.1');let checks=0;
  const actor=async name=>{
    const user=await db.user.create({data:{name,email:`catalog-${name}-${randomBytes(3).toString('hex')}@example.invalid`,password:'synthetic-unusable-password'}}),token=randomBytes(32).toString('base64url');
    const session=await db.session.create({data:{userId:user.id,sessionToken:'sha256:'+createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000),authenticatedAt:new Date()}});
    return {...user,cookie:'auth_session='+token,session};
  };
  const owner=await actor('owner'),accountant=await actor('accountant'),employee=await actor('employee'),stranger=await actor('stranger');
  const a=await db.companyProfile.create({data:{userId:owner.id,nip:'5260301706',companyName:'Catalog A',isDefault:true}}),b=await db.companyProfile.create({data:{userId:owner.id,nip:'5250001003',companyName:'Catalog B',isDefault:false}});
  await db.companyMember.create({data:{companyId:a.id,userId:accountant.id,role:'accountant',canIssueInvoices:false,canExport:true}});
  await db.companyMember.create({data:{companyId:a.id,userId:employee.id,role:'employee'}});
  const request=async(path,{user=owner,status=200,body,raw,method=body||raw?'POST':'GET'}={})=>{
    const response=await fetch(base+path,{method,headers:{Origin:base,Cookie:user?.cookie||'',...(body?{'Content-Type':'application/json'}:raw?{'Content-Type':'application/octet-stream'}:{})},body:body?JSON.stringify(body):raw,signal:AbortSignal.timeout(30000)});
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,status,path+': '+bytes.toString().slice(0,500));assert.ok(response.headers.get('cache-control')?.includes('no-store'));checks++;
    return {response,bytes,data:response.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes.toString()):null};
  };
  const product=(patch={})=>({name:'Imported service',sku:'IM-1',unit:'godz.',netPrice:'125,50',vatRate:'23%',currency:'PLN',description:'Synthetic service',...patch});
  const importPath='/api/products/import',batch={companyId:a.id,action:'preview',rows:[product(),product({name:'duplicate',sku:'im-1'}),product({sku:'BAD',netPrice:'15junk'})]};
  const preview=(await request(importPath,{body:batch})).data;assert.deepEqual([preview.ready,preview.duplicate,preview.invalid],[1,1,1]);assert.equal(await db.product.count({where:{companyId:a.id}}),0);
  const imported=(await request(importPath,{body:{...batch,action:'import'}})).data;assert.equal(imported.created,1);let saved=await db.product.findFirstOrThrow({where:{companyId:a.id}});assert.equal(saved.netPrice,125.5);assert.equal(saved.vatRate,'23');assert.equal(saved.isStockTracked,false);
  const repeated=(await request(importPath,{body:{...batch,action:'import'}})).data;assert.equal(repeated.created,0);assert.equal(await db.product.count({where:{companyId:a.id}}),1);
  assert.equal((await request(importPath,{body:{...batch,companyId:b.id,action:'import'}})).data.created,1);
  await request(importPath,{status:401,user:null,body:batch});await request(importPath,{status:403,user:stranger,body:batch});await request(importPath,{status:403,user:accountant,body:batch});
  await request(importPath,{status:400,body:{...batch,action:'delete'}});await request(importPath,{status:400,body:{...batch,companyId:'bad'}});await request(importPath,{status:400,body:{...batch,rows:Array(201).fill(product())}});
  assert.equal((await request(importPath,{user:employee,body:{...batch,action:'import',rows:[product({sku:'EMP'})]}})).data.created,1);
  await db.companyMember.update({where:{companyId_userId:{companyId:a.id,userId:employee.id}},data:{canIssueInvoices:false}});
  await request(importPath,{status:403,user:employee,body:{...batch,action:'import',rows:[product({sku:'REVOKED'})]}});
  assert.equal(await db.product.count({where:{companyId:a.id,sku:'REVOKED'}}),0);
  const raceBody={...batch,action:'import',rows:[product({sku:'RACE'})]};
  const race=await Promise.all([0,1].map(async()=>{const r=await fetch(base+importPath,{method:'POST',headers:{Origin:base,Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify(raceBody)});assert.ok([200,409].includes(r.status));checks++;return {status:r.status,data:await r.json()};}));
  assert.ok(race.some(r=>r.status===200&&r.data.created===1));assert.equal(await db.product.count({where:{companyId:a.id,sku:'RACE'}}),1);
  const xlsx=spreadsheet([['Nazwa','SKU','Cena netto','VAT'],['Zażółć','XLSX-1','12,50','8']]),filePath='/api/catalog/import-file?companyId='+a.id;
  const parsed=(await request(filePath,{raw:xlsx})).data;assert.deepEqual(parsed.rows,[['Zażółć','XLSX-1','12,50','8']]);assert.equal(await db.product.count({where:{companyId:a.id,sku:'XLSX-1'}}),0);
  await request(filePath,{raw:xlsx,user:null,status:401});await request(filePath,{raw:xlsx,user:stranger,status:403});await request(filePath,{raw:xlsx,user:accountant,status:403});await request(filePath+'&sheet=99',{raw:xlsx,status:400});await request(filePath,{raw:Buffer.from('not excel'),status:400});await request(filePath,{raw:Buffer.alloc(2_000_001),status:413});
  const contactRows=[{name:'Imported buyer',nip:'5260301706',street:'Test 1',city:'Warszawa',postal:'00-001',email:'buyer@example.invalid',phone:''}];
  assert.equal((await request('/api/contractors/import',{body:{companyId:a.id,action:'preview',rows:contactRows}})).data.ready,1);
  assert.equal(await db.contractor.count({where:{companyId:a.id}}),0);
  assert.equal((await request('/api/contractors/import',{body:{companyId:a.id,action:'import',rows:contactRows}})).data.created,1);
  assert.equal((await request('/api/contractors/import',{body:{companyId:a.id,action:'import',rows:contactRows}})).data.created,0);
  const buyer=await db.contractor.findFirstOrThrow({where:{companyId:a.id}});
  const issued=await db.invoice.create({data:{userId:owner.id,sellerCompanyId:a.id,contractorId:buyer.id,number:'UNSETTLED',type:'sale',status:'issued',documentStatus:'issued',issueDate:'2026-02-01',saleDate:'2026-02-01',dueDate:'2026-02-15',currency:'PLN',totalNet:100,totalVat:23,totalGross:123,paymentStatus:'unpaid',lines:[]}});
  let state=(await request(`/api/accountant/period?companyId=${a.id}&month=2026-02`)).data;assert.equal(state.handoff.unsettled.count,1);assert.equal(state.readiness.canClose,true,'Unpaid invoice is advisory, not a new close blocker');
  await request('/api/accountant/workspace',{user:accountant,body:{companyId:a.id,month:'2026-02',version:0,action:'add',kind:'missing',title:'Missing receipt'}});
  state=(await request(`/api/accountant/period?companyId=${a.id}&month=2026-02`)).data;assert.equal(state.handoff.missing.count,1);assert.equal(state.readiness.canClose,false);
  assert.equal((await request(`/api/accountant/period?companyId=${b.id}&month=2026-02`)).data.handoff.missing.count,0);
  await request(`/api/accountant/period?companyId=${a.id}&month=2026-02`,{user:stranger,status:403});await request(`/api/accountant/period?companyId=${a.id}&month=2026-13`,{status:400});
  const cost=await db.expense.create({data:{userId:owner.id,companyId:a.id,number:'COST/1',contractorName:'Synthetic vendor',issueDate:'2026-01-05',totalNet:10,totalVat:2.3,totalGross:12.3,workflowStatus:'verified'}});
  const bytes=Buffer.from('%PDF-1.4 synthetic clean original'),scan=await db.expenseScan.create({data:{userId:owner.id,companyId:a.id,expenseId:cost.id,fileName:'receipt.pdf',status:'converted',safetyStatus:'clean',mimeType:'application/pdf',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),imageData:'data:application/pdf;base64,'+bytes.toString('base64')}});
  await db.expense.update({where:{id:cost.id},data:{scanId:scan.id}});
  await db.expenseScan.create({data:{userId:owner.id,companyId:a.id,fileName:'January pending.pdf',status:'needs_review',createdAt:new Date('2026-01-15T12:00:00Z')}});
  const packagePath=`/api/accountant/package?companyId=${a.id}&month=2026-01`;
  const pack=await request(packagePath);assert.equal(pack.response.headers.get('content-type'),'application/zip');assert.ok(pack.bytes.includes(Buffer.from('koszty/'+scan.id+'.pdf')));assert.ok(pack.bytes.includes(bytes));assert.ok(pack.bytes.includes(Buffer.from('zawartosc-paczki.csv')));assert.ok(pack.bytes.includes(Buffer.from('przygotowanie-miesiaca.txt')));
  assert.ok(pack.bytes.includes(Buffer.from('jeszcze niezatwierdzone: 1')));assert.equal(pack.bytes.includes(Buffer.from('UNSETTLED')),false);
  await db.expenseScan.update({where:{id:scan.id},data:{safetyStatus:'quarantined'}});
  const blocked=await request(packagePath);assert.equal(blocked.bytes.includes(bytes),false);assert.ok(blocked.bytes.includes(Buffer.from('kwarantanna')));
  await request(packagePath,{user:stranger,status:403});await request(packagePath,{user:null,status:401});await request(packagePath,{user:employee,status:403});
  await db.session.update({where:{id:accountant.session.id},data:{authenticatedAt:null}});await request(packagePath,{user:accountant,status:428});
  await db.companyMember.delete({where:{companyId_userId:{companyId:a.id,userId:accountant.id}}});await request(`/api/accountant/period?companyId=${a.id}&month=2026-02`,{user:accountant,status:403});
  const unchanged=await db.invoice.findUniqueOrThrow({where:{id:issued.id}});assert.equal(unchanged.totalGross,123);assert.equal(unchanged.version,1);assert.equal(unchanged.paymentStatus,'unpaid');
  assert.ok(await db.auditLog.count({where:{companyId:a.id,action:'products_imported'}}));
  console.log(`[catalog-accounting-audit] PASS ${checks} HTTP checks: previews, duplicates, concurrent imports, real Excel, permissions, revocation, tenant isolation, advisory payment status, clean originals and explicit package gaps`);
}

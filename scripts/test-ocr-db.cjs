// Isolated replica set only; never connects to DATABASE_URL from deployment.
const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {MongoMemoryReplSet}=require('mongodb-memory-server');const {PrismaClient}=require('@prisma/client');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const root=path.resolve(__dirname,'..');let db,currentUser,membership;
const original=Module._load;Module._load=function(r,p,m){if(r==='@/lib/db')return {prisma:db};if(r==='@/lib/auth')return {getSessionUser:async()=>currentUser};if(r==='@/lib/permissions')return {getCompanyMembership:async()=>membership};if(r.startsWith('@/'))r=path.join(root,'src',r.slice(2));return original.call(this,r,p,m);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
(async()=>{
 let repl;
 try{
  repl=await MongoMemoryReplSet.create({replSet:{count:1}});const url=repl.getUri('fakturo_ocr_test');
  const env={...process.env,DATABASE_URL:url};
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{cwd:root,env,stdio:'pipe'});
  for(let i=0;i<2;i++)execFileSync(process.execPath,['scripts/migrations/20260915-02-ocr.mjs'],{cwd:root,env,stdio:'pipe'});
  db=new PrismaClient({datasources:{db:{url}}});
  currentUser=await db.user.create({data:{email:'ocr-test@example.invalid',password:'test-only-never-used'}});
  const company=await db.companyProfile.create({data:{userId:currentUser.id,nip:'5260250274',companyName:'Test'}});
  membership={role:'owner',company};
  const data={contractorName:'Test',nip:'5260250274',number:'TEST/0001',issueDate:'2026-09-01',saleDate:null,dueDate:null,totalNet:100,totalVat:23,totalGross:123,currency:'PLN',iban:null,lines:[]};
  const draft=await db.ocrDraft.create({data:{userId:currentUser.id,companyId:company.id,filename:'test.pdf',fileHash:'test',mimeType:'application/pdf',provider:'test',data,warnings:[],expiresAt:new Date(Date.now()+86400000)}});
  const route=require('../src/app/api/expenses/ocr/[id]/confirm/route.ts');
  const request=()=>new Request(`http://localhost/api?companyId=${company.id}`,{method:'POST',body:JSON.stringify(data)});
  const context={params:Promise.resolve({id:draft.id})};
  const first=await route.POST(request(),context);assert.equal(first.status,201,JSON.stringify(await first.json()));
  assert.equal((await route.POST(request(),context)).status,201);
  assert.equal(await db.expense.count(),1);assert.equal(await db.auditLog.count(),1);
  const expense=await db.expense.findFirst();assert.equal(expense.ocrDraftId,draft.id);assert.equal(expense.companyId,company.id);
  await assert.rejects(db.expense.create({data:{userId:currentUser.id,companyId:company.id,number:'OTHER',contractorName:'Test',issueDate:'2026-09-01',ocrDocumentKey:expense.ocrDocumentKey}}),e=>e.code==='P2002');
  const quota=await db.ocrQuota.create({data:{id:'test',companyId:company.id,expiresAt:new Date(Date.now()+86400000)}});
  const reserved=await Promise.all(Array.from({length:40},()=>db.ocrQuota.updateMany({where:{id:quota.id,attempts:{lt:30}},data:{attempts:{increment:1}}})));
  assert.equal(reserved.reduce((n,r)=>n+r.count,0),30);
  membership=null;assert.equal((await route.POST(request(),context)).status,403);
  const indexes=await db.$runCommandRaw({listIndexes:'OcrDraft'});assert.ok(indexes.cursor.firstBatch.some(i=>i.expireAfterSeconds===0));
  await db.user.delete({where:{id:currentUser.id}});assert.equal(await db.ocrDraft.count(),0);assert.equal(await db.ocrQuota.count(),0);
  console.log('PASS: MongoDB migration rerun, TTL, atomic budget, unique deduplication, confirmation, access revocation and cascading deletion.');
 }finally{await db?.$disconnect();await repl?.stop();}
})().catch(e=>{console.error(e);process.exitCode=1});

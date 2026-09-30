import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

export async function fullFeatureAudit(base, db, fixture) {
  assert.equal(new URL(base).hostname, '127.0.0.1', 'The functional audit must use an isolated local application');
  const routes=JSON.parse(await readFile(new URL('./feature-route-inventory.json',import.meta.url),'utf8'));
  const results=[], failures=[];
  async function check(label, method, path, body, cookie, expected) {
    try {
      const response=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),
        headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
      const text=await response.text();
      const ok=expected?expected.includes(response.status):response.status<500;
      const result={label,method,path,status:response.status,ok};
      results.push(result);
      if(!ok){result.detail=text.slice(0,350);failures.push(result);console.log('[feature-audit-failure] '+JSON.stringify(result));}
      let data;try{data=JSON.parse(text);}catch{data=null;}
      return {response,data};
    }catch(error){const result={label,method,path,ok:false,error:error.message};results.push(result);failures.push(result);console.log('[feature-audit-failure] '+JSON.stringify(result));return {data:null};}
  }
  const missing='000000000000000000000001';
  const routePath=route=>route.path.replace('[...nextauth]','session').replace(/\[[^\]]+\]/g,missing);
  for(const route of routes) for(const method of route.methods) {
    const path=routePath(route);
    await check('anonymous route boundary',method,path,['GET','DELETE'].includes(method)?undefined:{},undefined);
  }
  // GETs and invalid identifiers must be safe on every authenticated read route.
  for(const route of routes.filter(route=>route.methods.includes('GET'))) {
    let path=routePath(route);
    if(!path.includes('/auth/'))path+='?companyId='+fixture.companyId+'&month=2026-09&key=favorites';
    await check('authenticated route read', 'GET',path,undefined,fixture.ownerCookie);

  }
  for(const route of routes.filter(route=>route.path.includes('[id]'))) for(const method of route.methods)
    await check('malformed object id',method,route.path.replaceAll('[id]','not-an-object-id'),['GET','DELETE'].includes(method)?undefined:{},fixture.ownerCookie,[400,403,404]);
  const company=await check('create audit company','POST','/api/companies',{companyName:'Functional audit company',nip:'9876543210'},fixture.ownerCookie,[201]);
  const companyId=company.data?.company?.id;
  if(companyId) {
    const expenseBody={companyId,number:'AUDIT/COST',contractorName:'Audit supplier',issueDate:'2026-09-30',currency:'PLN',totalNet:100,totalVat:23,totalGross:123};
    const before=await db.expense.count({where:{companyId}});
    for(const patch of [{totalGross:-1,totalNet:-1,totalVat:0},{totalGross:'not-a-number'},{totalGross:123,totalNet:0,totalVat:0},{workflowStatus:'invalid'},{paymentStatus:'invalid'},{issueDate:'2026-02-30'},{dueDate:'invalid'},{currency:'INVALID'},{paymentStatus:'paid',paidAt:'invalid'}])
      await check('reject invalid expense','POST','/api/expenses',{...expenseBody,...patch},fixture.ownerCookie,[400]);
    if(await db.expense.count({where:{companyId}})!==before)failures.push({label:'Invalid expense requests must not persist records',ok:false});
    const created=await check('create valid expense','POST','/api/expenses',expenseBody,fixture.ownerCookie,[201]);
    if(created.data?.expense?.id) {
      const id=created.data.expense.id;
      await check('reject inconsistent cost update','PUT','/api/expenses/'+id,{totalGross:500},fixture.ownerCookie,[400]);
      await check('reject invalid payment status','PATCH','/api/expenses/'+id,{paymentStatus:'anything'},fixture.ownerCookie,[400]);
      await check('reject invalid paid date','PATCH','/api/expenses/'+id,{paymentStatus:'paid',paidAt:'invalid'},fixture.ownerCookie,[400]);
      await check('protect company with business documents','DELETE','/api/companies/'+companyId,undefined,fixture.ownerCookie,[409]);
      await check('mark cost paid','PATCH','/api/expenses/'+id,{paymentStatus:'paid'},fixture.ownerCookie,[200]);
      await check('read paid cost','GET','/api/expenses/'+id,undefined,fixture.ownerCookie,[200]);
      await check('delete manual cost','DELETE','/api/expenses/'+id,undefined,fixture.ownerCookie,[200]);
    }
    const contractor=await check('create audit contact','POST','/api/contractors',{companyId,name:'Audit customer',nip:'5250001003'},fixture.ownerCookie,[201]);
    const contractorId=contractor.data?.contractor?.id;
    if(contractorId) {
      const orderBody={companyId,contractorId,title:'Audit order',number:'AUDIT/ORDER',currency:'PLN',totalGross:123,totalNet:100,hourlyRate:50,trackedMinutes:0};
      const before=await db.order.count({where:{companyId}});
      for(const patch of [{status:'invalid'},{totalGross:-1},{totalNet:-1},{hourlyRate:-1},{trackedMinutes:-60},{trackedMinutes:1.5},{currency:'INVALID'},{stages:[{id:'bad',name:'Stage',amount:-1,status:'pending'}]}])
        await check('reject invalid order','POST','/api/orders',{...orderBody,...patch},fixture.ownerCookie,[400]);
      if(await db.order.count({where:{companyId}})!==before)failures.push({label:'Invalid order requests must not persist records',ok:false});
      const created=await check('create valid order','POST','/api/orders',orderBody,fixture.ownerCookie,[201]);
      if(created.data?.order?.id) {
        const id=created.data.order.id;
        await check('reject invalid order status','PATCH','/api/orders/'+id,{status:'invalid'},fixture.ownerCookie,[400]);
        await check('reject negative tracked hours','PATCH','/api/orders/'+id,{trackedHours:-1},fixture.ownerCookie,[400]);
        const updated=await check('save zero order amount','PUT','/api/orders/'+id,{totalAmount:0},fixture.ownerCookie,[200]);
        if(updated.data?.order?.totalGross!==0)failures.push({label:'Changing an order amount to zero must preserve zero',ok:false});
        await check('record order time','PATCH','/api/orders/'+id,{trackedHours:1},fixture.ownerCookie,[200]);
        await check('complete order','PATCH','/api/orders/'+id,{status:'completed'},fixture.ownerCookie,[200]);
        await check('delete order','DELETE','/api/orders/'+id,undefined,fixture.ownerCookie,[200]);
      }
    }
  }
  await mkdir('artifacts/functional',{recursive:true});
  const report={createdAt:new Date().toISOString(),routeCount:routes.length,methodCount:routes.reduce((sum,r)=>sum+r.methods.length,0),checks:results.length,failures,results};
  await writeFile('artifacts/functional/http-audit.json',JSON.stringify(report,null,2));
  console.log('[feature-audit-summary] '+JSON.stringify({routes:report.routeCount,methods:report.methodCount,checks:report.checks,failures:failures.length}));
  assert.deepEqual(failures,[],'All route boundaries and financial validation scenarios must pass');
}

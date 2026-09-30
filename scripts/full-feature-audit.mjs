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

      const offerBody={companyId,contractorId,number:'AUDIT/OFFER',title:'Mixed VAT offer',issueDate:'2026-09-30',validUntil:'2027-09-30',currency:'PLN',
        lines:[{id:'a',name:'VAT 23',quantity:1,unit:'szt.',netPrice:100,vatRate:'23'},{id:'b',name:'VAT 8',quantity:1,unit:'szt.',netPrice:100,vatRate:'8'}]};
      const offer=await check('create offer','POST','/api/offers',offerBody,fixture.ownerCookie,[201]);
      if(offer.data?.offer?.id) {
        const id=offer.data.offer.id;
        const sent=await check('share offer','PATCH','/api/offers/'+id,{status:'sent',version:offer.data.offer.version},fixture.ownerCookie,[200]);
        const token=sent.data?.offer?.publicToken;
        if(token) {
          const portal=await check('public offer preview','GET','/api/portal/'+token,undefined,undefined,[200]);
          if(portal.data?.document?.id||portal.data?.document?.userId)failures.push({label:'Public offer must not disclose tenant identifiers',ok:false});
          await check('accept offer','POST','/api/portal/'+token+'/decision',{decision:'accepted',name:'Audit client',version:sent.data.offer.version},undefined,[200]);
          await check('reject stale offer decision','POST','/api/portal/'+token+'/decision',{decision:'rejected',name:'Audit client',version:sent.data.offer.version},undefined,[409]);
        }
        const converted=await check('convert accepted offer to order','POST','/api/offers/'+id+'/convert',{target:'order'},fixture.ownerCookie,[200]);
        await check('reject repeated offer conversion','POST','/api/offers/'+id+'/convert',{target:'order'},fixture.ownerCookie,[409]);
        if(converted.data?.order?.id) {
          const orderId=converted.data.order.id;
          const invoiced=await check('invoice order with mixed VAT','POST','/api/orders/'+orderId+'/convert',undefined,fixture.ownerCookie,[200]);
          if(invoiced.data?.invoice?.id) {
            const invoice=invoiced.data.invoice;
            if(invoice.totalGross!==231)failures.push({label:'Mixed VAT totals must survive offer/order conversion',ok:false});
            const order=await db.order.findUniqueOrThrow({where:{id:orderId}});
            if(order.status!=='billed'||order.billedInvoiceId!==invoice.id)failures.push({label:'Converted order must be shown as billed',ok:false});
            await check('reject duplicate order invoice','POST','/api/orders/'+orderId+'/convert',undefined,fixture.ownerCookie,[409]);
            await check('protect billed order edit','PUT','/api/orders/'+orderId,{totalGross:999},fixture.ownerCookie,[409]);
            await check('protect billed order deletion','DELETE','/api/orders/'+orderId,undefined,fixture.ownerCookie,[409]);
            const token=invoice.shareToken;
            if(token) {
              await check('reject invalid promised payment date','POST','/api/portal/'+token+'/declare-payment',{declaredDate:'2026-02-30'},undefined,[400]);
              await check('declare promised payment','POST','/api/portal/'+token+'/declare-payment',{declaredDate:'2026-10-15',note:'Audit promise'},undefined,[200]);
              const after=await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});
              if(after.declaredPaymentDate!=='2026-10-15'||after.paymentStatus==='paid')failures.push({label:'Payment promise must persist without marking invoice paid',ok:false});
              if(await db.documentComment.count({where:{invoiceId:invoice.id}})!==1)failures.push({label:'Payment promise must have exactly one comment',ok:false});
            }
            await check('owner email history','GET','/api/invoices/'+invoice.id+'/email-history',undefined,fixture.ownerCookie,[200]);
            if(fixture.otherCookie&&fixture.otherUserId) {
              await check('deny outsider email history','GET','/api/invoices/'+invoice.id+'/email-history',undefined,fixture.otherCookie,[404]);
              await db.companyMember.create({data:{companyId,userId:fixture.otherUserId,role:'accountant'}});
              await check('shared team email history','GET','/api/invoices/'+invoice.id+'/email-history',undefined,fixture.otherCookie,[200]);
              await db.companyMember.delete({where:{companyId_userId:{companyId,userId:fixture.otherUserId}}});
              await check('revoked email history','GET','/api/invoices/'+invoice.id+'/email-history',undefined,fixture.otherCookie,[404]);
            }
          }
        }
      }
    }
  }
  const sitemap=await fetch(base+"/sitemap.xml");
  assert.equal(sitemap.status,200);
  const xml=await sitemap.text();
  for(const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url=new URL(match[1]);
    await check("public sitemap page","GET",url.pathname+url.search,undefined,undefined,[200]);
  }
  await mkdir('artifacts/functional',{recursive:true});
  const report={createdAt:new Date().toISOString(),routeCount:routes.length,methodCount:routes.reduce((sum,r)=>sum+r.methods.length,0),checks:results.length,failures,results};
  await writeFile('artifacts/functional/http-audit.json',JSON.stringify(report,null,2));
  console.log('[feature-audit-summary] '+JSON.stringify({routes:report.routeCount,methods:report.methodCount,checks:report.checks,failures:failures.length}));
  assert.deepEqual(failures,[],'All route boundaries and financial validation scenarios must pass');
}

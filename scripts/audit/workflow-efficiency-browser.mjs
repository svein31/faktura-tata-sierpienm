import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

/** Actual form interactions and bank writes on the isolated runner's synthetic tenant. */
export async function auditWorkflowEfficiencyBrowser({ page, context, base, db, companyId, contractorId, out, expect, engine }) {
  const company=await db.companyProfile.findUniqueOrThrow({where:{id:companyId}}), buyer=await db.contractor.findUniqueOrThrow({where:{id:contractorId}});
  const second=await db.companyProfile.create({data:{userId:company.userId,nip:'5250001003',companyName:'Private workflow company B',isDefault:false}});
  const secondBuyer=await db.contractor.create({data:{userId:company.userId,companyId:second.id,name:'Private buyer B',nip:'5260301706',address:{street:'Testowa 2',city:'Kraków',postal:'30-001',country:'PL'},country:'PL',taxIdType:'nip'}});
  const checks=[],errors=[],violations=[];
  const record=name=>{checks.push(name);console.log('[workflow-ui:'+engine+'] PASS',name);};
  const api=async(method,path,data)=>{
    const response=await context.request.fetch(base+path,{method,...(data===undefined?{}:{data}),headers:{Origin:base}}),body=await response.json();
    assert.ok(response.ok(),path+': '+JSON.stringify(body));return body;
  };
  const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const issue=async(number,amount=100,patch={})=>(await api('POST','/api/invoices',{sellerCompanyId:companyId,number,type:'sale',status:'issued',contractorId,issueDate:today,saleDate:today,dueDate:today,currency:'PLN',paymentMethod:'transfer',paymentTermDays:14,language:'PL',lines:[{id:'line',name:'Workflow service',unit:'szt.',quantity:1,netPrice:amount,vatRate:'0'}],...patch})).invoice;
  await issue('UI/PRIVATE/'+engine,333,{sellerCompanyId:second.id,contractorId:secondBuyer.id,lines:[{id:'secret',name:'Private service company B',unit:'szt.',quantity:1,netPrice:333,vatRate:'0'}]});
  const ready=async(p,path)=>{await p.goto(base+path,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');};
  const scan=async(p,name)=>{
    await p.evaluate(()=>document.fonts.ready);
    // Form interactions can leave the page at an arbitrary scroll offset, with
    // a non-focused control half behind the sticky header. Scan the complete
    // layout from a reproducible top position; keyboard checks stay separate.
    await p.evaluate(()=>window.scrollTo(0,0));
    await expect.poll(()=>p.locator('[data-app-dialog="true"]').evaluateAll(nodes=>nodes.every(node=>Number(getComputedStyle(node).opacity)===1))).toBe(true);
    await p.waitForTimeout(200);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no page overflow');
    await p.addScriptTag({path:'/workspace/.cache/faktura-runtime/a11y/node_modules/axe-core/axe.min.js'});
    const result=await p.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return result.violations;});
    if(result.length)violations.push({name,violations:result});
    await p.screenshot({path:`${out}/${engine}-${name}.png`,fullPage:true});
  };
  const submit=async(p,button,path)=>{
    const response=p.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()!=='GET');
    await button.click();const r=await response,body=await r.json();assert.ok(r.ok(),JSON.stringify(body));return body;
  };
  page.on('pageerror',error=>errors.push(error.message));
  const touch=await context.browser().newContext({baseURL:base,storageState:await context.storageState(),viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',extraHTTPHeaders:{Origin:base}});
  await touch.addInitScript(({userId,companyId})=>{
    for(const preference of ['guide-seen','banner-dismissed'])localStorage.setItem(`fakturo_onboarding_v3:${preference}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`,'true');
  },{userId:company.userId,companyId});
  await touch.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const mobile=await touch.newPage();mobile.on('pageerror',error=>errors.push(error.message));
  try {
    for(const [p,width,theme] of [[page,1440,'light'],[mobile,390,'dark']]) {
      await p.setViewportSize({width,height:900});
      await p.addInitScript(theme=>localStorage.setItem('fakturaprosto-theme',theme),theme);
      const suffix=engine+'/'+width;
      await issue('UI/HISTORY/'+suffix,75,{issueDate:tomorrow,saleDate:tomorrow,paymentMethod:'card',paymentTermDays:10,lines:[{id:'history',name:'History service '+suffix,unit:'godz.',quantity:3,netPrice:75,vatRate:'23'}]});
      await ready(p,'/dashboard');
      const chart=p.locator('[data-revenue-chart="lightweight"]');await expect(chart).toBeVisible();
      const points=chart.getByRole('button');await expect(points).toHaveCount(6);await points.last().focus();await expect(chart.getByRole('status')).toContainText('Netto:');
      await p.keyboard.press('Escape');await expect(chart.getByRole('status')).toHaveCount(0);
      await scan(p,'dashboard-'+width);record(width+'px lightweight chart has six keyboard-readable months and no overflow');
      await ready(p,'/invoices/new');
      await p.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).click();await p.getByRole('textbox',{name:'Numer faktury',exact:true}).fill('UI/DRAFT/'+suffix);
      const firstName=p.locator('[data-invoice-field="lines.0.name"]:visible');await firstName.fill('My manually entered service');
      const panel=p.getByRole('region',{name:'Podpowiedzi z ostatnich faktur',exact:true});
      await panel.getByRole('button',{name:buyer.name,exact:true}).click();await expect(p.locator('#invoice-contractorId')).toContainText(buyer.name);
      await panel.getByRole('button',{name:'Zastosuj warunki płatności',exact:true}).click();
      await expect(p.locator('#invoice-paymentMethod')).toContainText('Karta');await expect(p.locator('#invoice-paymentTermDays')).toContainText('10 dni');
      const date=await p.locator('#invoice-issueDate').inputValue();const due=new Date(date+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+10);await expect(p.locator('#invoice-dueDate')).toHaveValue(due.toISOString().slice(0,10));
      await panel.getByRole('button',{name:new RegExp('Dodaj: History service '+suffix)}).click();
      await expect(firstName).toHaveValue('My manually entered service');await expect(p.locator('[data-invoice-field="lines.1.name"]:visible')).toHaveValue('History service '+suffix);
      await expect(p.locator('[data-invoice-field="lines.1.quantity"]:visible')).toHaveValue('1');
      await p.locator('[data-invoice-field="lines.0.netPrice"]:visible').fill('50');
      await scan(p,'suggestions-'+width);
      const saved=(await submit(p,p.getByRole('button',{name:'Zapisz szkic',exact:true}),'/api/invoices')).invoice;
      const stored=await db.invoice.findUniqueOrThrow({where:{id:saved.id}});assert.equal(stored.contractorId,contractorId);assert.equal(stored.paymentMethod,'card');assert.equal(stored.paymentTermDays,10);assert.equal(stored.lines[0].name,'My manually entered service');assert.equal(stored.lines[1].netPrice,75);assert.equal(stored.lines[1].quantity,1);
      record(width+'px suggestions preserve manual entries and persist explicitly chosen buyer, line and custom payment terms');

      const a=await issue('UI/BANK-A/'+suffix,100),b=await issue('UI/BANK-B/'+suffix,50);
      const bank=await db.bankTransaction.create({data:{userId:company.userId,accountId:companyId,externalId:'ui-workflow-bank-'+suffix,bookingDate:today,amount:150,currency:'PLN',direction:'in',description:'Payment '+a.number}});
      const openBank=async()=>{await ready(p,'/finances?transactionId='+bank.id);const dialog=p.getByRole('dialog',{name:'Rozlicz transakcję bankową',exact:true});await expect(dialog).toBeVisible();return dialog;};
      let dialog=await openBank();
      const choose=async(number)=>{await expect(dialog.getByLabel('Dokument',{exact:true})).toBeEnabled();await dialog.getByLabel('Dokument',{exact:true}).click();await p.getByRole('option').filter({hasText:number}).click();};
      await choose(a.number);await expect(dialog.getByLabel('Kwota przypisania (PLN)',{exact:true})).toHaveValue('100.00');
      await dialog.getByLabel('Kwota przypisania (PLN)',{exact:true}).fill('50,00');await expect(dialog.locator('#bank-allocation-summary')).toContainText('100,00');
      await scan(p,'bank-partial-'+width);p.once('dialog',d=>d.accept());await submit(p,dialog.getByRole('button',{name:'Przypisz i zapisz płatność',exact:true}),'/api/banking/transactions');
      assert.equal((await db.invoice.findUniqueOrThrow({where:{id:a.id}})).paidAmount,50);assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:bank.id}})).allocatedAmount,50);
      dialog=await openBank();await choose(a.number);p.once('dialog',d=>d.accept());await submit(p,dialog.getByRole('button',{name:'Przypisz i zapisz płatność',exact:true}),'/api/banking/transactions');
      dialog=await openBank();await choose(b.number);await dialog.getByText('Wcześniejsze przypisania (2)',{exact:true}).click();await scan(p,'bank-remainder-'+width);
      p.once('dialog',d=>d.accept());await submit(p,dialog.getByRole('button',{name:'Przypisz i zapisz płatność',exact:true}),'/api/banking/transactions');
      const allocated=await db.bankTransaction.findUniqueOrThrow({where:{id:bank.id}});assert.equal(allocated.allocatedAmount,150);assert.equal(allocated.allocations.length,3);assert.equal(allocated.matchStatus,'manual');
      for(const invoice of [a,b])assert.equal((await db.invoice.findUniqueOrThrow({where:{id:invoice.id}})).paymentStatus,'paid');
      assert.equal((await db.paymentRecord.aggregate({where:{invoiceId:{in:[a.id,b.id]}},_sum:{amount:true}}))._sum.amount,150);
      record(width+'px one transfer splits into three confirmed allocations across two invoices without overpaying either');

      const c=await issue('UI/IMPORT/'+suffix,75);
      await ready(p,'/finances');await p.getByRole('button',{name:'Importuj wyciąg',exact:true}).click();
      dialog=p.getByRole('dialog',{name:'Import wyciągu bankowego',exact:true});await dialog.getByPlaceholder('Wklej wiersze wyciągu CSV...').fill(`Data;Kwota;Tytuł\n${today};75,00;${c.number}`);
      await submit(p,dialog.getByRole('button',{name:'Dalej: Rozpoznaj transakcje →',exact:true}),'/api/banking/import');
      const approval=dialog.getByRole('checkbox',{name:/Zatwierdź dopasowanie operacji/});await expect(approval).toBeChecked();await approval.uncheck();
      await scan(p,'import-approval-'+width);const imported=await submit(p,dialog.getByRole('button',{name:'Importuj bez rozliczania płatności',exact:true}),'/api/banking/import');assert.equal(imported.appliedCount,0);
      assert.equal((await db.invoice.findUniqueOrThrow({where:{id:c.id}})).paidAmount,0);await expect(p.locator('#pending-bank-transactions').getByRole('button').filter({hasText:c.number})).toBeVisible();
      record(width+'px unchecked import proposal remains unpaid and immediately appears in the manual-reconciliation list');
    }
    await ready(page,'/invoices/new');
    await page.getByRole('button',{name:/Wybierz firmę:/}).click();
    await page.getByRole('menu',{name:'Twoje firmy i zespoły',exact:true}).getByRole('menuitem').filter({hasText:second.companyName}).click();
    const panel=page.getByRole('region',{name:'Podpowiedzi z ostatnich faktur',exact:true});await expect(panel).toContainText('Private service company B');await expect(panel).not.toContainText('History service');
    await expect(page.locator('#invoice-contractorId')).toContainText('wybierz kontrahenta');await scan(page,'company-switch');
    record('Company switch resets the draft and immediately scopes every suggestion to company B');
    assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
    await writeFile(out+'/'+engine+'-workflow-efficiency.json',JSON.stringify({passed:true,checks,errors,violations},null,2));
  } catch(error) {
    await writeFile(out+'/'+engine+'-workflow-failure.json',JSON.stringify({message:error.message,checks,errors,violations},null,2));throw error;
  } finally { await touch.close(); }
}

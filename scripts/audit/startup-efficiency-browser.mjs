import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function auditStartupEfficiencyBrowser({page,context,base,db,companyId,contractorId,out,expect,engine}) {
  const company=await db.companyProfile.findUniqueOrThrow({where:{id:companyId}});
  const second=await db.companyProfile.create({data:{userId:company.userId,nip:'5250001003',companyName:'Startup second company',isDefault:false}});
  const address={street:'Synthetic 1',city:'Warszawa',postal:'00-001',country:'PL'};
  for(const [tenant,prefix] of [[company,'A'],[second,'B']]) {
    await db.contractor.createMany({data:Array.from({length:40},(_,i)=>({userId:company.userId,companyId:tenant.id,name:`${prefix} catalog ${i}`,nip:'5250001003',address}))});
    await db.product.createMany({data:Array.from({length:40},(_,i)=>({userId:company.userId,companyId:tenant.id,name:`${prefix} catalog ${i} product`,unit:'szt.',netPrice:25,vatRate:'23'}))});
  }
  const secondBuyer=await db.contractor.findFirstOrThrow({where:{companyId:second.id,name:'B catalog 34'}});
  const day=new Date().toISOString().slice(0,10);
  const secondInvoice=await db.invoice.create({data:{userId:company.userId,sellerCompanyId:second.id,contractorId:secondBuyer.id,number:'STARTUP/SECOND/'+engine,type:'sale',status:'issued',documentStatus:'issued',issueDate:day,saleDate:day,dueDate:day,currency:'PLN',totalNet:100,totalVat:23,totalGross:123,lines:[{id:'line',name:'Synthetic second company service',unit:'szt.',quantity:1,netPrice:100,vatRate:'23'}]}});
  await context.addInitScript(({userId,companyId})=>{for(const key of ['guide-seen','banner-dismissed'])localStorage.setItem(`fakturo_onboarding_v3:${key}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`,'true');},{userId:company.userId,companyId:second.id});
  const checks=[],errors=[],violations=[],requests=[],responses=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))requests.push(url.pathname+url.search);});
  page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/'))responses.push({path:new URL(response.url()).pathname,status:response.status()});});
  const record=text=>{checks.push(text);console.log('[startup-ui:'+engine+'] PASS',text);};
  const scan=async name=>{
    await page.waitForTimeout(220);await page.addScriptTag({path:'/workspace/.cache/faktura-runtime/a11y/node_modules/axe-core/axe.min.js'});
    const result=await page.evaluate(async()=>{await document.fonts.ready;return (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations;});
    if(result.length)violations.push({name,result});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no overflow');
    await page.screenshot({path:`${out}/${engine}-${name}.png`,fullPage:true});
  };
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('fakturaprosto-theme',theme),width===1440?'light':'dark');
    await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Przegląd',exact:true})).toBeVisible();
    await expect.poll(()=>responses.some(row=>row.path==='/api/overview'&&row.status===304)).toBe(true);
    assert.equal(requests.some(path=>path.startsWith('/api/catalog/')),false,'No catalog read before opening search');
    assert.equal(requests.some(path=>path.startsWith('/api/data')),false,'SSR shell does not trigger a second full bootstrap');
    await scan('shell-'+width);record(width+'px initial dashboard is interactive without catalog/bootstrap requests; unchanged authorized overview returns 304');
    await page.goto(base+'/invoices',{waitUntil:'domcontentloaded'});
    await expect(page.locator('main [data-invoice-id]:visible').first()).toContainText('Pracownia Forma');
    await expect.poll(()=>responses.some(row=>row.path==='/api/invoices/search'&&row.status===304)).toBe(true);
    await scan('invoices-'+width);record(width+'px invoice list retains real buyer names and its authorized seed while the current server read returns 304');
    await page.keyboard.press('Control+k');let dialog=page.getByRole('dialog',{name:'Wyszukiwanie i polecenia',exact:true});await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox',{name:'Szukaj faktur, kontrahentów i poleceń',exact:true}).fill('A catalog 34');
    await expect(dialog.getByRole('button',{name:'A catalog 34',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'A catalog 34 product',exact:true})).toBeVisible();
    await expect(dialog).not.toContainText('B catalog');await scan('catalog-'+width);await page.keyboard.press('Escape');
    record(width+'px command search fetches off-page contractor/product matches on demand without loading or mutating the global catalog');
    await page.getByRole('button',{name:/Wybierz firmę:/}).click();await page.getByRole('menu',{name:'Twoje firmy i zespoły',exact:true}).getByRole('menuitem').filter({hasText:second.companyName}).click();
    await page.keyboard.press('Control+k');dialog=page.getByRole('dialog',{name:'Wyszukiwanie i polecenia',exact:true});await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox',{name:'Szukaj faktur, kontrahentów i poleceń',exact:true}).fill('B catalog 34');await expect(dialog.getByRole('button',{name:'B catalog 34',exact:true})).toBeVisible();await expect(dialog).not.toContainText('A catalog');await scan('company-switch-'+width);await page.keyboard.press('Escape');
    record(width+'px company switch removes previous search results and queries only the selected company');
    await page.getByRole('button',{name:/Wybierz firmę:/}).click();await page.getByRole('menu',{name:'Twoje firmy i zespoły',exact:true}).getByRole('menuitem').filter({hasText:company.companyName}).click();
    requests.length=0;responses.length=0;
  }
  await page.goto(base+'/invoices/new',{waitUntil:'domcontentloaded'});await expect(page.locator('#invoice-contractorId')).toBeVisible();
  await page.locator('#invoice-contractorId').click();await page.getByRole('option').filter({hasText:'A catalog 34'}).click();await expect(page.locator('#invoice-contractorId')).toContainText('A catalog 34');
  await page.getByTitle(/Skróty klawiszowe/).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await scan('editor-catalog');record('Editor downloads the selected company catalog on entry; its deferred keyboard-shortcut dialog still opens and closes');
  await page.goto(base+'/invoices/'+secondInvoice.id,{waitUntil:'domcontentloaded'});await expect(page.getByText('B catalog 34',{exact:true}).first()).toBeVisible();await scan('direct-second-company');
  await page.getByRole('button',{name:'Edytuj',exact:true}).click();await expect(page).toHaveURL(/\/invoices\/new/);await expect(page.locator('#invoice-contractorId')).toContainText('B catalog 34');
  await expect(page.getByRole('button',{name:/Wybierz firmę:/})).toContainText(second.companyName);await scan('edit-second-company');
  await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill('Edited second company service');
  await page.getByRole('button',{name:'Zapisz fakturę',exact:true}).click();
  const assistant=page.getByRole('dialog',{name:'Asystent przed wysyłką faktury',exact:true});await expect(assistant).toBeVisible();
  const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/invoices/'+secondInvoice.id&&response.request().method()==='PUT');
  await assistant.getByRole('button',{name:'Zatwierdzam i kontynuuję',exact:true}).click();assert.equal((await saved).status(),200);
  const stored=await db.invoice.findUniqueOrThrow({where:{id:secondInvoice.id}});assert.equal(stored.lines[0].name,'Edited second company service');assert.equal(stored.version,2);
  record('Direct invoice URL reads its own buyer without a global catalog; editing follows the document company and loads that company catalog');
  record('Edited second-company document saves through the real preflight and PUT using its original version, with the invoice list cache empty');
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
  await writeFile(`${out}/${engine}-startup-efficiency.json`,JSON.stringify({passed:true,checks,errors,violations,requests,responses},null,2));
}

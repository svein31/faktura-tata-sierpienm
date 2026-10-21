import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

export async function auditLaunchPolish({page,context,base,db,companyId,out,expect,engine}) {
  const checks=[],scans=[];
  const record=name=>{checks.push(name);console.log(`[launch-polish:${engine}] PASS ${name}`);};
  const rows=()=>page.locator('.ui-invoice-table tbody tr');
  const region=()=>page.getByRole('region',{name:'Tabela faktur — przewijana lista',exact:true});
  const go=async()=>{await page.goto(base+'/invoices',{waitUntil:'load'});await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');await expect(rows().first()).toBeVisible();};
  const columns=()=>page.getByRole('menu',{name:'Widoczne kolumny faktur',exact:true});
  const openColumns=async()=>{await page.getByRole('button',{name:'Wybierz kolumny tabeli',exact:true}).click();await expect(columns()).toBeVisible();};
  const reset=async()=>{await openColumns();await columns().getByRole('menuitem',{name:'Przywróć domyślne kolumny',exact:true}).click();};
  const axePath=process.env.AXE_SCRIPT_PATH||'/workspace/.cache/faktura-runtime/a11y/node_modules/axe-core/axe.min.js';
  const axe=await readFile(axePath,'utf8');
  const scan=async(label)=>{await page.evaluate(axe);const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));scans.push({label,violations:result.violations,incomplete:result.incomplete.map(x=>({id:x.id,nodes:x.nodes.length}))});assert.deepEqual(result.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[]);};
  try {
    const sale=await db.invoice.findFirst({where:{sellerCompanyId:companyId,type:'sale'},orderBy:{issueDate:'desc'}});
    assert.ok(sale);await db.invoice.update({where:{id:sale.id},data:{paymentStatus:'partially_paid',paidAmount:10,dueDate:'2099-10-25'}});
    await page.setViewportSize({width:1440,height:1000});await go();await reset();
    assert.equal(await region().evaluate(e=>e.scrollWidth-e.clientWidth),0,'default desktop columns must fit without scrolling');
    await expect(rows().first().locator('[data-invoice-column="document"] time')).toBeVisible();
    await expect(page.locator('thead [data-invoice-column="issueDate"]')).toHaveCount(0);
    await expect(page.locator('.ui-invoice-table [data-invoice-column="payment"]').filter({hasText:'Częściowo opłacona'})).toHaveCount(1);
    for(const label of ['Status dokumentu','Waluta faktury','Kolejność faktur','Gęstość tabeli']) {
      const control=page.getByRole('combobox',{name:label,exact:true});
      assert.ok(await control.locator('span').first().evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+' label must fit');
    }
    await page.screenshot({path:`${out}/${engine}-invoices-default.png`,fullPage:true,animations:'disabled'});await scan('desktop-default');
    record('default desktop shows dates, payment and KSeF columns without horizontal scrolling; filter labels fit');
    await openColumns();for(const option of await columns().getByRole('menuitemcheckbox').all())if(await option.getAttribute('aria-checked')==='false')await option.click();await page.keyboard.press('Escape');
    await page.reload();await expect(page.locator('thead [data-invoice-column="issueDate"]')).toBeVisible();
    // At exactly 768px WebKit can use the card layout because its classic
    // scrollbar reduces the CSS media viewport below md. Exercise tables at
    // 800px and above; the independent 390px check covers the card layout.
    for(const width of [800,1024,1280,1440,1920]) {
      await page.setViewportSize({width,height:1000});await region().scrollIntoViewIfNeeded();
      for(const fraction of [0,.5,1]) {
        await region().evaluate((e,f)=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)*f;e.scrollTop=0;},fraction);
        const first=rows().first();const doc=await first.locator('[data-invoice-column="document"]').boundingBox();const payment=await first.locator('[data-invoice-column="payment"]').boundingBox();const actions=await first.locator('[data-invoice-column="actions"]').boundingBox();
        assert.ok(doc.x+doc.width<=payment.x+1&&payment.x+payment.width<=actions.x+1,JSON.stringify({width,fraction,doc,payment,actions}));
        assert.ok(await first.locator('[data-invoice-column="payment"] > span').evaluate(e=>{const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.x>=p.x-1&&b.right<=p.right+1&&e.contains(hit);}),`payment must fit and remain unobscured at ${width}/${fraction}`);
        const actionBoxes=await first.locator('[data-invoice-column="actions"] button').evaluateAll(list=>list.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,right:b.right}}));
        for(let i=1;i<actionBoxes.length;i++)assert.ok(actionBoxes[i-1].right<=actionBoxes[i].x+1,'row actions cannot overlap');
      }
    }
    record('saved/custom column sets keep payment unobscured at three scroll positions and five viewport widths');
    await page.setViewportSize({width:1440,height:1000});await reset();await page.getByRole('button',{name:'Ciemny',exact:true}).first().click();await page.waitForTimeout(500);await scan('desktop-dark');await page.screenshot({path:`${out}/${engine}-invoices-dark.png`,fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Jasny',exact:true}).first().click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await expect(page.locator('main')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await scan('mobile');await page.screenshot({path:`${out}/${engine}-invoices-mobile.png`,fullPage:true,animations:'disabled'});
    record('light/dark desktop and mobile retain accessible statuses and page bounds');
    await page.goto(base+'/',{waitUntil:'load'});const poster=page.locator('#film img');await poster.scrollIntoViewIfNeeded();await expect(poster).toHaveAttribute('src','/media/fakturaprosto-demo-poster.webp');await expect.poll(()=>poster.evaluate(e=>e.complete&&e.naturalWidth===1600&&e.naturalHeight===900)).toBe(true);assert.equal(await page.locator('#film video').count(),0);await page.locator('#film').screenshot({path:`${out}/${engine}-poster.png`,animations:'disabled'});await scan('public-poster');
    const downloaded=[];page.on('request',r=>{if(r.url().endsWith('.mp4'))downloaded.push(r.url())});await page.getByRole('button',{name:/^Odtwórz prezentację/}).click();await expect(page.locator('#film video')).toHaveAttribute('poster','/media/fakturaprosto-demo-poster.webp');await expect.poll(()=>page.locator('#film video').evaluate(e=>e.readyState)).toBeGreaterThanOrEqual(2);assert.ok(downloaded.length>0);
    record('new poster decodes at 1600×900, video stays deferred until play and retains its poster');
    await writeFile(out+`/${engine}-launch-polish.json`,JSON.stringify({engine,checks,scans},null,2));
  } catch(error){const dom=await page.evaluate(()=>{const t=document.querySelector('.ui-invoice-scroll');return {innerWidth,md:matchMedia('(min-width:768px)').matches,table:t?{style:getComputedStyle(t).display,rect:t.getBoundingClientRect().toJSON(),inert:!!t.closest('[inert]'),ariaHidden:!!t.closest('[aria-hidden="true"]')}:null,title:document.title,text:document.body.innerText.slice(-1200)}}).catch(()=>null);await page.screenshot({path:out+`/${engine}-failure.png`,fullPage:true}).catch(()=>{});await writeFile(out+`/${engine}-launch-polish.json`,JSON.stringify({engine,checks,scans,error:error.message,dom},null,2));throw error;}
}

import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function auditInvoicePower({page,context,base,fixture,out,expect,engine}) {
 const checks=[], record=name=>{checks.push(name);console.log(`[invoice-power:${engine}] PASS ${name}`);};
 const go=async()=>{await page.goto(base+'/invoices',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');await expect(page.locator('tbody tr').first()).toBeVisible();};
 const search=()=>page.getByRole('textbox',{name:'Szukaj faktur',exact:true});
 const dialog=()=>page.getByRole('dialog');
 const title=()=>dialog().getByRole('heading',{level:2});
 const next=()=>dialog().getByRole('button',{name:'Następna faktura',exact:true});
 const previous=()=>dialog().getByRole('button',{name:'Poprzednia faktura',exact:true});
 const rows=()=>page.locator('tbody tr');
 const identities=()=>rows().evaluateAll(items=>items.map(item=>item.dataset.invoiceId));
 const open=async index=>{await rows().nth(index).getByRole('button',{name:/^Podgląd faktury/}).click();await expect(dialog()).toHaveCSS('opacity','1');};
 const close=async()=>{await page.keyboard.press('Escape');await expect(dialog()).toHaveCount(0);};
 const read=async(sort='date_desc',cursor='')=>{const response=await context.request.get(`/api/invoices/search?companyId=${fixture.companyId}&sort=${sort}&cursor=${cursor}`);assert.ok(response.ok());return response.json();};
 const choose=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 const company=async name=>{await page.getByRole('button',{name:/^Wybierz firmę:/}).click();await page.getByRole('menuitem').filter({hasText:name}).click();};
 const columns=()=>page.getByRole('menu',{name:'Widoczne kolumny faktur',exact:true});
 const openColumns=async()=>{await page.getByRole('button',{name:'Wybierz kolumny tabeli',exact:true}).click();await expect(columns()).toBeVisible();};
 const column=label=>columns().getByRole('menuitemcheckbox',{name:label,exact:true});
 try {
  await page.setViewportSize({width:1440,height:1000});await go();
  if(await page.getByRole('button',{name:'Wyczyść',exact:true}).count())await page.getByRole('button',{name:'Wyczyść',exact:true}).click();
  await choose('Kolejność faktur','Najnowsze najpierw');
  await openColumns();await column('Waluta').focus();await page.keyboard.press('Space');await expect(column('Waluta')).toHaveAttribute('aria-checked','true');await expect(column('Waluta')).toBeFocused();
  await column('Kontrahent').click();await expect(column('Kontrahent')).toHaveAttribute('aria-checked','false');
  await page.keyboard.press('End');const reset=columns().getByRole('menuitem',{name:'Przywróć domyślne kolumny',exact:true});await expect(reset).toBeFocused();
  const [menuBox,resetBox]=await Promise.all([columns().boundingBox(),reset.boundingBox()]);assert.ok(resetBox.y>=menuBox.y&&resetBox.y+resetBox.height<=menuBox.y+menuBox.height+1,'keyboard scroll brings the reset action into the menu viewport');
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Wybierz kolumny tabeli'})).toBeFocused();
  await expect(page.locator('thead [data-invoice-column="currency"]')).toBeVisible();await expect(page.locator('thead [data-invoice-column="contractor"]')).toHaveCount(0);
  await page.reload();await expect(page.locator('thead [data-invoice-column="currency"]')).toBeVisible();await expect(page.locator('thead [data-invoice-column="contractor"]')).toHaveCount(0);
  await company('Firma B · DEMO');await expect(page.locator('thead [data-invoice-column="currency"]')).toHaveCount(0);await expect(page.locator('thead [data-invoice-column="contractor"]')).toBeVisible();
  await company('Studio Aurora · DEMO');await expect(page.locator('thead [data-invoice-column="currency"]')).toBeVisible();await expect(rows().first()).toBeVisible();
  record('column checkboxes support Space, focus, scrolling and Escape; preferences survive reload and remain company-scoped');

  await page.getByText('Zapisane filtry',{exact:true}).click();await page.getByRole('textbox',{name:'Nazwa widoku',exact:true}).fill('Układ POWER');await page.getByRole('button',{name:'Zapisz filtry',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Zapisane widoki faktur',exact:true})).toContainText('Układ POWER');
  await openColumns();await columns().getByRole('menuitem',{name:'Przywróć domyślne kolumny',exact:true}).click();
  await choose('Zapisane widoki faktur','Zapisane widoki');await choose('Zapisane widoki faktur','Układ POWER');
  await expect(page.locator('thead [data-invoice-column="currency"]')).toBeVisible();await expect(page.locator('thead [data-invoice-column="contractor"]')).toHaveCount(0);
  record('named saved views restore column choices alongside existing filters');

  for(const width of [390,640,768,1024,1280,1440,1920]) {
   await page.setViewportSize({width,height:1000});
   const bar=page.locator('header').filter({has:page.getByRole('button',{name:/^Wybierz firmę:/})});
   const boxes=await bar.evaluate(el=>Array.from(el.children).filter(child=>child.getClientRects().length).map(child=>{const r=child.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)assert.ok(Math.min(boxes[a].right,boxes[b].right)-Math.max(boxes[a].x,boxes[b].x)<=1||Math.min(boxes[a].bottom,boxes[b].bottom)-Math.max(boxes[a].y,boxes[b].y)<=1,JSON.stringify({width,boxes}));
  }
  record('workspace title, company switcher and account controls do not overlap from phone through narrow desktop to widescreen');

  await openColumns();for(const option of await columns().getByRole('menuitemcheckbox').all())if(await option.getAttribute('aria-checked')==='false')await option.click();await page.keyboard.press('Escape');
  const scroll=page.getByRole('region',{name:'Tabela faktur — przewijana lista'});
  for(const width of [1024,1280,1440,1920]) {
   await page.setViewportSize({width,height:1000});await scroll.scrollIntoViewIfNeeded();
   for(const fraction of [0,.5,1]) {
    await scroll.evaluate((element,f)=>{element.scrollLeft=(element.scrollWidth-element.clientWidth)*f;element.scrollTop=0;},fraction);
    const box=await scroll.evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,clientRight:el.getBoundingClientRect().left+el.clientWidth}));
    const first=await rows().first().locator('[data-invoice-column="document"]').boundingBox(), last=await rows().first().locator('[data-invoice-column="actions"]').boundingBox();
    assert.ok(Math.abs(first.x-box.left)<2&&last.x+last.width>=box.clientRight-1&&last.x+last.width<=box.right+1,JSON.stringify({width,fraction,box,first,last}));assert.ok(first.x+first.width<last.x,'pinned columns leave usable space for data');
    const lastAction=await rows().first().getByRole('button',{name:/^Więcej działań/}).boundingBox();assert.ok(lastAction.x+lastAction.width<=box.clientRight+1,'action targets stay clear of the native scrollbar gutter');
   }
   await scroll.evaluate(el=>el.scrollTop=250);const region=await scroll.boundingBox(), heading=await page.locator('thead th').first().boundingBox();assert.ok(Math.abs(region.y-heading.y)<2);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:1440,height:1000});await scroll.evaluate(el=>{el.scrollLeft=250;el.scrollTop=0;});await page.screenshot({path:`${out}/${engine}-pinned-columns.png`});
  record('document and actions remain pinned at both scroll extremes and four desktop widths while headers stay pinned vertically');

  await search().fill('POWER/');await expect(rows()).toHaveCount(4);await page.getByRole('checkbox',{name:'Zaznacz wszystkie widoczne faktury',exact:true}).check();
  const summary=page.getByRole('region',{name:'Podsumowanie zaznaczonych dokumentów',exact:true});await expect(summary).toBeVisible();
  await expect(summary.locator('[data-selection-currency]')).toHaveCount(3);
  await expect(summary.locator('[data-selection-currency="PLN"] dd').last()).toContainText('98,40');await expect(summary.locator('[data-selection-currency="EUR"] dd').last()).toContainText('20,00');await expect(summary.locator('[data-selection-currency="USD"] dd').last()).toContainText('10,00');
  await expect(summary).toContainText('szkice: 1');await expect(summary).toContainText('proformy: 1');
  await page.getByRole('checkbox',{name:'Zaznacz fakturę POWER/CORRECTION',exact:true}).uncheck();assert.equal(await page.getByRole('checkbox',{name:'Zaznacz wszystkie widoczne faktury'}).evaluate(el=>el.indeterminate),true);
  await expect(summary.locator('[data-selection-currency="PLN"] dd').last()).toContainText('123,00');
  await page.setViewportSize({width:390,height:900});await expect(summary).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await summary.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${engine}-selection-phone.png`});
  await page.getByRole('button',{name:'Odznacz',exact:true}).click();await expect(summary).toHaveCount(0);await page.setViewportSize({width:1440,height:1000});await search().fill('');await expect(rows()).toHaveCount(30);
  record('selection sums PLN/EUR/USD separately, preserves a negative correction, identifies drafts/proformas and fits a phone');

  for(const sort of ['date_desc','date_asc']) {
   await choose('Kolejność faktur',sort==='date_desc'?'Najnowsze najpierw':'Najstarsze najpierw');
   const data=await read(sort);await expect(rows().first()).toHaveAttribute('data-invoice-id',data.invoices[0].id);
   await open(0);await dialog().evaluate(el=>el.dataset.powerPanel='retained');await expect(previous()).toHaveAttribute('aria-disabled','true');
   await next().focus();await page.keyboard.press('ArrowRight');await expect(title()).toHaveText(data.invoices[1].number);await expect(next()).toBeFocused();await expect(dialog()).toHaveAttribute('data-power-panel','retained');
   await page.keyboard.press('ArrowLeft');await expect(title()).toHaveText(data.invoices[0].number);
   await page.keyboard.press('Shift+ArrowRight');await expect(title()).toHaveText(data.invoices[0].number);
   await close();
  }
  record('preview buttons and arrow keys follow both server orders without remounting the panel or stealing focus');

  await choose('Kolejność faktur','Najnowsze najpierw');const first=await read();await expect(rows().first()).toHaveAttribute('data-invoice-id',first.invoices[0].id);await open(29);
  const originalIds=await identities(), originalScroll=await scroll.evaluate(el=>el.scrollTop), originalWindow=await page.evaluate(()=>scrollY);
  let release,seen=0;const gate=new Promise(resolve=>release=resolve);
  const delayed=async route=>{if(new URL(route.request().url()).searchParams.get('cursor')===first.nextCursor){seen++;await gate;}try{await route.continue();}catch{}};
  await context.route('**/api/invoices/search?**',delayed);await next().click();await expect.poll(()=>seen).toBe(1);await expect(dialog().getByRole('navigation',{name:'Przeglądanie faktur'})).toContainText('Ładowanie dokumentów');await expect(title()).toHaveText(first.invoices[29].number);
  release();await expect(dialog().getByRole('navigation')).toContainText('Strona 2');const second=await read('date_desc',first.nextCursor);await expect(title()).toHaveText(second.invoices[0].number);await context.unroute('**/api/invoices/search?**',delayed);
  await previous().click();await expect(title()).toHaveText(first.invoices[29].number);await expect(dialog().getByRole('navigation')).toContainText('Strona 1');
  await close();assert.deepEqual(await identities(),originalIds);assert.equal(await scroll.evaluate(el=>el.scrollTop),originalScroll);assert.equal(await page.evaluate(()=>scrollY),originalWindow);
  // Opening on list page two also supports the reverse cursor boundary.
  await page.getByRole('button',{name:'Następna',exact:true}).click();await expect(rows().first()).toHaveAttribute('data-invoice-id',second.invoices[0].id);await open(0);await previous().click();await expect(title()).toHaveText(first.invoices[29].number);await close();await expect(rows().first()).toHaveAttribute('data-invoice-id',second.invoices[0].id);
  await page.getByRole('button',{name:'Pierwsza strona',exact:true}).click();await expect(rows().first()).toHaveAttribute('data-invoice-id',first.invoices[0].id);
  record('preview crosses forward and reverse page boundaries on demand without changing the underlying list page or scroll');

  await open(29);
  const fail=route=>new URL(route.request().url()).searchParams.get('cursor')===first.nextCursor?route.fulfill({status:500,contentType:'application/json',body:'{"error":"Przejściowy błąd odczytu · TEST"}'}):route.continue();
  await context.route('**/api/invoices/search?**',fail);await next().click();await expect(dialog().getByRole('alert')).toContainText('Przejściowy błąd odczytu');await expect(title()).toHaveText(first.invoices[29].number);await context.unroute('**/api/invoices/search?**',fail);
  await dialog().getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();await expect(title()).toHaveText(second.invoices[0].number);await close();
  await open(29);const deny=route=>new URL(route.request().url()).searchParams.get('cursor')===first.nextCursor?route.fulfill({status:403,contentType:'text/plain',body:'Denied'}):route.continue();
  await context.route('**/api/invoices/search?**',deny);await next().click();await expect(dialog()).toHaveCount(0);await context.unroute('**/api/invoices/search?**',deny);
  await expect(rows().first()).toBeVisible();assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await open(29);let releaseClosed,pendingClosed=0;const closedGate=new Promise(resolve=>releaseClosed=resolve);
  const duringClose=async route=>{if(new URL(route.request().url()).searchParams.get('cursor')===first.nextCursor){pendingClosed++;await closedGate;}try{await route.continue();}catch{}};
  await context.route('**/api/invoices/search?**',duringClose);await next().click();await expect.poll(()=>pendingClosed).toBe(1);await close();releaseClosed();await context.unroute('**/api/invoices/search?**',duringClose);await read();await expect(dialog()).toHaveCount(0);
  record('failed reads allow retry, non-JSON access denial closes the panel and a late response cannot reopen a closed preview');

  await openColumns();for(const option of await columns().getByRole('menuitemcheckbox').all())if(await option.getAttribute('aria-checked')==='true')await option.click();await page.keyboard.press('Escape');await expect(page.locator('thead th')).toHaveCount(2);await expect(rows().first().getByRole('button',{name:/^Więcej działań/})).toBeVisible();
  await openColumns();await columns().getByRole('menuitem',{name:'Przywróć domyślne kolumny',exact:true}).click();
  await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(String(key).startsWith('fakturaprosto:invoice-columns:'))throw new DOMException('Blocked','SecurityError');return get.call(this,key);};Storage.prototype.setItem=function(key,value){if(String(key).startsWith('fakturaprosto:invoice-columns:'))throw new DOMException('Blocked','SecurityError');return set.call(this,key,value);};});
  await page.reload();await expect(rows().first()).toBeVisible();await openColumns();await column('Waluta').click();await expect(column('Waluta')).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');await expect(page.locator('thead [data-invoice-column="currency"]')).toBeVisible();
  record('all optional columns can be hidden, defaults can be restored and blocked storage does not disable customization');
  await writeFile(`${out}/${engine}-invoice-power.json`,JSON.stringify({passed:true,engine,checks},null,2));
 }catch(error){await page.screenshot({path:`${out}/${engine}-power-failure.png`});await writeFile(`${out}/${engine}-power-failure.json`,JSON.stringify({error:error.message,text:await page.locator('body').innerText()},null,2));throw error;}
}

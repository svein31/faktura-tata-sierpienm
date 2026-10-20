import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function auditInvoiceFrontend({page,context,base,fixture,out,expect,engine}) {
 const checks=[], requests=[];
 const record=name=>{checks.push(name);console.log(`[invoice-frontend:${engine}] PASS ${name}`);};
 const go=async path=>{await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');};
 const search=()=>page.getByRole('textbox',{name:'Szukaj faktur',exact:true});
 const panel=()=>page.getByRole('dialog');
 const clear=async()=>{await search().fill('');const reset=page.getByRole('button',{name:'Wyczyść',exact:true});if(await reset.count())await reset.click();await expect(page.locator('tbody tr').first()).toBeVisible();};
 const assertViewport=async locator=>{await locator.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});const r=await locator.boundingBox(), size=page.viewportSize();assert.ok(r&&r.x>=-1&&r.y>=-1&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1,JSON.stringify({r,size}));};
 const request=req=>requests.push(new URL(req.url()).pathname);
 try {
  await page.setViewportSize({width:1440,height:1000});await go('/invoices');await clear();
  const scroll=page.getByRole('region',{name:'Tabela faktur — przewijana lista'});
  await scroll.scrollIntoViewIfNeeded();await scroll.evaluate(el=>el.scrollTop=300);
  const top=(await scroll.boundingBox()).y, header=(await page.locator('thead th').first().boundingBox()).y;
  assert.ok(Math.abs(header-top)<2,'header remains at the top of the scroll region');
  await scroll.evaluate(el=>el.scrollTop=0);
  const checkbox=page.locator('tbody tr').first().getByRole('checkbox');await checkbox.check();assert.equal(await panel().count(),0);await checkbox.uncheck();
  record('sticky header remains visible and selecting a row never opens its preview');

  await search().fill('FV/');await expect(page.locator('tbody tr').first()).toContainText('FV/');
  const row=page.locator('tbody tr').nth(3), id=await row.getAttribute('data-invoice-id');
  const trigger=row.getByRole('button',{name:/^Podgląd faktury/});
  await trigger.scrollIntoViewIfNeeded();await trigger.focus();
  const before=await scroll.evaluate(el=>el.scrollTop), outer=await page.evaluate(()=>scrollY);
  page.on('request',request);await trigger.press('Enter');await expect(panel()).toBeVisible();
  await expect(panel().getByRole('button',{name:'Zamknij podgląd faktury'})).toBeFocused();
  await expect(panel().getByRole('link',{name:'Otwórz szczegóły'})).toHaveAttribute('href',`/invoices/${id}`);
  await expect(page).toHaveURL(base+'/invoices');await expect(panel().getByRole('region',{name:'Wartość i płatność'})).toBeVisible();
  await page.keyboard.press('Shift+Tab');await expect(panel().getByRole('link',{name:'Otwórz szczegóły'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(panel().getByRole('button',{name:'Zamknij podgląd faktury'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);await expect(trigger).toBeFocused();
  assert.equal(await scroll.evaluate(el=>el.scrollTop),before);assert.equal(await page.evaluate(()=>scrollY),outer);await expect(search()).toHaveValue('FV/');
  page.off('request',request);assert.equal(requests.filter(path=>/^\/api\/invoices\/[a-f0-9]{24}$/.test(path)||/pdf/i.test(path)).length,0);
  record('keyboard preview needs no detail/PDF request, traps focus and restores focus, both scroll positions and filters');

  await clear();await search().fill('UX/ACCEPTED');await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').first().getByRole('button',{name:/^Podgląd faktury/}).click();
  await expect(panel().getByRole('region',{name:'Wartość i płatność'})).toContainText('Opłacona');await expect(panel().getByRole('region',{name:'KSeF w podglądzie'})).toContainText('Przyjęta');
  await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);
  await search().fill('UX/VERIFY');await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').first().getByRole('button',{name:/^Podgląd faktury/}).click();
  await expect(panel().getByRole('region',{name:'KSeF w podglądzie'})).toContainText('nie wysyłaj ponownie');
  await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);
  record('quick preview keeps payment and transmission states separate and preserves uncertain-send guidance');

  await clear();await page.locator('tbody tr').first().getByRole('button',{name:/^Podgląd faktury/}).click();await expect(panel()).toBeVisible();
  const deny=route=>route.fulfill({status:403,contentType:'application/json',body:'{"error":"Brak dostępu — kontrola izolowana"}'});
  await context.route('**/api/invoices/search?**',deny);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(panel()).toHaveCount(0);await expect(page.locator('tbody tr')).toHaveCount(0);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await context.unroute('**/api/invoices/search?**',deny);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('tbody tr').first()).toBeVisible();await expect(panel()).toHaveCount(0);
  record('loss of invoice access closes the preview, removes rows and releases the scroll lock');

  for(const width of [320,390,1280,1920]) {
   await page.setViewportSize({width,height:900});
   const currency=page.getByRole('combobox',{name:'Waluta faktury',exact:true});await currency.scrollIntoViewIfNeeded();await currency.focus();await currency.press('End');
   const list=page.getByRole('listbox');await expect(list).toBeVisible();await assertViewport(list);
   await expect(page.getByRole('option',{name:'USD',exact:true})).toHaveAttribute('data-active','true');
   await page.keyboard.press('Home');await expect(page.getByRole('option',{name:'Waluta (wszystkie)',exact:true})).toHaveAttribute('data-active','true');
   await page.keyboard.press('Escape');await expect(currency).toBeFocused();await expect(list).toHaveCount(0);
   const preview=page.locator(width<768?'article:visible':'tbody tr').first().getByRole('button',{name:/^Podgląd faktury/});
   await preview.click();await expect(panel()).toBeVisible();await assertViewport(panel());
   await expect(panel().getByRole('link',{name:'Otwórz szczegóły'})).toBeInViewport();
   await page.screenshot({path:`${out}/${engine}-preview-${width}.png`});
   await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`no page overflow at ${width}`);
  }
  record('select keyboard and preview geometry remain usable at 320, 390, 1280 and 1920 pixels');

  await page.setViewportSize({width:1440,height:1000});
  const actions=page.locator('tbody tr').first().getByRole('button',{name:/^Więcej działań/});await actions.scrollIntoViewIfNeeded();await actions.focus();await actions.press('ArrowDown');
  const menu=page.getByRole('menu',{name:/^Działania dla faktury/});await expect(menu).toBeVisible();await assertViewport(menu);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();await page.keyboard.press('End');await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Home');await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(actions).toBeFocused();assert.equal(await panel().count(),0);
  const link=page.locator('tbody tr').first().getByRole('link').first();await link.focus();await link.press('Enter');await expect(panel()).toBeVisible();await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);await expect(link).toBeFocused();
  record('row action menu supports arrows, Home, End and Escape; invoice links remain keyboard-accessible');

  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});await search().fill('NIE-MA-TAKIEJ-FAKTURY');
   await expect(page.getByRole('heading',{name:'Brak wyników wyszukiwania',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Wyczyść filtry',exact:true}).click();await expect(search()).toHaveValue('');
   await page.getByRole('button',{name:/^Wybierz firmę:/}).click();await page.getByRole('menuitem').filter({hasText:'Firma B · DEMO'}).click();
   const emptyTitle=page.getByRole('heading',{name:'Tutaj pojawią się Twoje faktury',exact:true});
   await expect(emptyTitle).toBeVisible();await expect(emptyTitle.locator('..')).toHaveCSS('opacity','1');
   await expect(page.locator('.ui-loading-exit')).toHaveCount(0);await expect(page.locator('.ui-popup[data-state="closed"]')).toHaveCount(0);
   const firstInvoice=page.getByRole('button',{name:'Wystaw pierwszą fakturę',exact:true});await firstInvoice.evaluate(el=>el.scrollIntoView({block:'center'}));
   await page.screenshot({path:`${out}/${engine}-empty-${width}.png`});
   await firstInvoice.click();await expect(page).toHaveURL(/\/invoices\/new$/);await expect(page.getByRole('region',{name:'Zapis i wystawienie faktury',exact:true})).toBeVisible();
   await page.goBack({waitUntil:'domcontentloaded'});await expect(page).toHaveURL(base+'/invoices');await expect(emptyTitle).toBeVisible();
   await page.getByRole('button',{name:/^Wybierz firmę:/}).click();await page.getByRole('menuitem').filter({hasText:'Studio Aurora · DEMO'}).click();
   await expect(page.locator(width<768?'article:visible':'tbody tr').first()).toBeVisible();assert.equal(await panel().count(),0);
  }
  record('empty-company and filtered-empty states have different working actions on desktop and phone');

  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.documentElement.classList.add('dark');});
  await page.locator('tbody tr').first().getByRole('button',{name:/^Podgląd faktury/}).click();await expect(panel()).toHaveCSS('opacity','1');await page.screenshot({path:`${out}/${engine}-preview-dark.png`});
  const amount=panel().locator('p.tabular-nums').first();assert.equal(await amount.evaluate(el=>getComputedStyle(el).fontVariantNumeric),'tabular-nums');
  await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('tbody tr').first().getByRole('button',{name:/^Podgląd faktury/}).click();
  assert.equal(await panel().evaluate(el=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');await expect(panel()).toHaveCount(0);await page.emulateMedia({reducedMotion:'no-preference'});
  record('dark-theme preview uses aligned digits and respects reduced-motion settings');
  await writeFile(`${out}/${engine}-invoice-frontend.json`,JSON.stringify({passed:true,engine,checks},null,2));
 } catch(error) {await page.screenshot({path:`${out}/${engine}-frontend-failure.png`});await writeFile(`${out}/${engine}-frontend-failure.json`,JSON.stringify({error:error.message,text:await page.locator('body').innerText()},null,2));throw error;}
}

import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

export async function auditInvoiceUx({page,context,base,fixture,out,expect,engine}) {
 context.setDefaultTimeout(10000);
 const checks=[];const record=name=>{checks.push(name);console.log(`[invoice-ux:${engine}] PASS ${name}`);};
 const go=async path=>{await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');await page.evaluate(()=>document.fonts.ready);};
 const choose=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 const read=async path=>{const res=await context.request.get(base+path);assert.ok(res.ok(),await res.text());return res.json();};
 const searchBox=()=>page.getByPlaceholder('Szukaj: numer, kontrahent, NIP, numer KSeF…');
 await context.route('**/api/ksef/status?**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"success":true}'}));
 try {
  // Exercise the complete server order, not just a sort of one visible page.
  for(const sort of ['date_desc','date_asc']) {
   const ids=[],keys=[];let cursor='';let total;
   do {
    const result=await read(`/api/invoices/search?companyId=${fixture.companyId}&sort=${sort}&cursor=${cursor}`);
    total=result.total;for(const invoice of result.invoices){ids.push(invoice.id);keys.push(`${invoice.issueDate}:${invoice.id}`);}
    cursor=result.nextCursor||'';
   }while(cursor);
   assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
   const ordered=[...keys].sort();if(sort==='date_desc')ordered.reverse();assert.deepEqual(keys,ordered);
  }
  const invalid=await context.request.get(`${base}/api/invoices/search?companyId=${fixture.companyId}&sort=amount`);assert.equal(invalid.status(),400);
  const foreignCursor=await context.request.get(`${base}/api/invoices/search?companyId=${fixture.otherCompanyId}&sort=date_asc&cursor=${fixture.states.accepted}`);assert.equal(foreignCursor.status(),409);
  record('both date orders paginate all invoices without duplicates; invalid sorts and foreign-company cursors fail closed');
  for(const [status,name] of [['ksef_queued','queued'],['ksef_sent','verify'],['ksef_rejected','rejected'],['ksef_active','accepted']]) {
   const result=await read(`/api/invoices/search?companyId=${fixture.companyId}&status=${status}`);
   assert.ok(result.invoices.some(i=>i.id===fixture.states[name]),`${status} includes actual state, independently of payment`);
  }
  record('KSeF filters match queue, uncertain transmission, rejection and a paid accepted invoice');
  const outsider=await context.browser().newContext({baseURL:base,extraHTTPHeaders:{Origin:base}});
  try {
    const registered=await outsider.request.post('/api/auth/register',{data:{name:'Isolated outsider',email:`outsider-${engine}@example.invalid`,password:'MotionUxTest123!',acceptTerms:true}});
    assert.ok(registered.ok(),await registered.text());
    assert.equal((await outsider.request.get('/api/auth/me')).status(),200);
    const forbidden=await outsider.request.get(`/api/invoices/${fixture.states['queue-error']}`);
    assert.equal(forbidden.status(),404);assert.equal(JSON.stringify(await forbidden.json()).includes('ostatniego zadania'),false);
  } finally {await outsider.close();}
  record('authenticated unrelated account cannot read a document or its queue error');


  for(const [name,label] of [['queued','W kolejce'],['sent','Wysłana'],['verify','Weryfikacja wyniku'],['legacy-verify','Weryfikacja wyniku'],['rejected','Odrzucona'],['queue-error','Odrzucona'],['accepted','Przyjęta'],['upo','Przyjęta'],['demo','Przyjęta'],['proforma','Nie dotyczy KSeF']]) {
   await go(`/invoices/${fixture.states[name]}`);
   const timeline=page.getByRole('region',{name:'Status KSeF',exact:true});
   await expect(timeline).toBeVisible();await expect(timeline.getByText(label,{exact:true}).first()).toBeVisible();
   if(['queued','sent','verify','legacy-verify'].includes(name))await expect(timeline.locator('[data-step="accepted"]')).toHaveAttribute('data-state','pending');
   if(name==='verify'||name==='legacy-verify') {await expect(timeline).toContainText('nie wysyłaj ponownie');assert.equal(await page.getByRole('button',{name:/^Wyślij do KSeF/}).count(),0);}
   if(name==='rejected')await expect(timeline).toContainText('Brak uprawnienia do wystawienia dokumentu · TEST');
   if(name==='queue-error')await expect(timeline).toContainText('Błąd uprawnień z ostatniego zadania · TEST');
   if(name==='accepted')assert.equal(await timeline.getByRole('button',{name:'Pobierz UPO',exact:true}).count(),0);
   if(name==='upo')await expect(timeline.getByRole('button',{name:'Pobierz UPO',exact:true})).toBeVisible();
   if(name==='demo') {await expect(timeline).toContainText('Symulacja demo');assert.equal(await timeline.getByRole('button',{name:'Pobierz UPO',exact:true}).count(),0);}
  }
  record('ten actual document states show truthful timeline, explicit demo and UPO only when available');
  await page.screenshot({path:`${out}/${engine}-timeline.png`});

  await go('/invoices');await expect(page.locator('tbody tr').first()).toBeVisible();
  const comfortable=(await page.locator('tbody tr').first().boundingBox()).height;
  await choose('Gęstość tabeli','Widok kompaktowy');
  await expect.poll(async()=> (await page.locator('tbody tr').first().boundingBox()).height).toBeLessThan(comfortable);
  await choose('Kolejność faktur','Najstarsze najpierw');
  await searchBox().fill('FV/');
  await expect(page.locator('tbody tr').first()).toContainText('FV/');
  if (!(await page.locator('a[href="/dashboard"]:visible').count())) await page.getByRole('button',{name:'Pulpit',exact:true}).first().click();
  await page.locator('a[href="/dashboard"]:visible').first().click();await expect(page).toHaveURL(/\/dashboard$/);
  if (!(await page.locator('a[href="/invoices"]:visible').count())) await page.getByRole('button',{name:'Dokumenty',exact:true}).first().click();
  await page.locator('a[href="/invoices"]:visible').first().click();await expect(page).toHaveURL(/\/invoices$/);
  await expect(searchBox()).toHaveValue('FV/');
  await expect(page.getByRole('combobox',{name:'Kolejność faktur',exact:true})).toContainText('Najstarsze najpierw');
  await expect(page.getByRole('combobox',{name:'Gęstość tabeli',exact:true})).toContainText('Widok kompaktowy');
  await page.reload();await expect(searchBox()).toHaveValue('FV/');
  record('filters, server sort and real compact row height survive navigation and reload');
  await page.getByRole('button',{name:/^Wybierz firmę:/}).click();
  await page.getByRole('menuitem').filter({hasText:'Firma B · DEMO'}).click();
  await expect(searchBox()).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Gęstość tabeli',exact:true})).toContainText('Widok wygodny');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button',{name:/^Wybierz firmę:/}).click();
  await page.getByRole('menuitem').filter({hasText:'Studio Aurora · DEMO'}).click();
  await expect(searchBox()).toHaveValue('FV/');
  await expect(page.getByRole('combobox',{name:'Gęstość tabeli',exact:true})).toContainText('Widok kompaktowy');
  await searchBox().fill('');await choose('Kolejność faktur','Najnowsze najpierw');await choose('Gęstość tabeli','Widok wygodny');
  record('switching companies isolates the remembered view and restores each company correctly');

  await go('/invoices/new');
  const actions=page.getByRole('region',{name:'Zapis i wystawienie faktury',exact:true});
  for(const width of [1280,1440,1920,390]) {
   await page.setViewportSize({width,height:900});
   await expect(actions).toBeVisible();
   for(const position of [0,0.5,1]) {
    await page.evaluate(position=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*position),position);
    const box=await actions.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=900,`${width} pinned actions must fit at every scroll position`);
    await expect(actions.getByRole('button',{name:'Zapisz szkic',exact:true})).toBeInViewport();
    await expect(actions.getByRole('button',{name:'Zapisz fakturę',exact:true})).toBeInViewport();
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} page overflow`);
   await page.screenshot({path:`${out}/${engine}-actions-${width}.png`});
  }
  record('single pinned action bar stays in view at four widths and top/middle/bottom without page overflow');
  await page.setViewportSize({width:1440,height:1000});
  const name=page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true});
  const price=page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true});
  await name.fill('Opis musi pozostać po błędzie');await price.fill('125');
  const save=actions.getByRole('button',{name:'Zapisz fakturę',exact:true});await save.click();
  await expect(page.locator('#invoice-numberMode')).toBeFocused();
  await expect(page.locator('#invoice-contractorId')).toHaveAttribute('aria-invalid','true');
  await expect(name).toHaveValue('Opis musi pozostać po błędzie');
  await page.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).click();
  await page.getByRole('textbox',{name:'Numer faktury',exact:true}).fill(`UX-${engine}/SAVE`);
  await page.locator('#invoice-contractorId').click();await page.getByRole('option',{name:/Pracownia Forma/}).click();
  await price.fill('-5');await save.click();await expect(price).toBeFocused();await expect(price).toHaveAttribute('aria-invalid','true');
  await expect(price).toHaveValue('-5');await expect(name).toHaveValue('Opis musi pozostać po błędzie');
  await price.fill('125');
  let rejected=0;
  const invalidWrite=async route=>{if(route.request().method()!=='POST')return route.continue();rejected++;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Sprawdź cenę pozycji · TEST',fieldErrors:{'lines.0.netPrice':'Zweryfikuj cenę netto wskazanej pozycji · TEST'}})});};
  await context.route('**/api/invoices',invalidWrite);
  await save.click();const assistant=page.getByRole('dialog',{name:'Asystent przed wysyłką faktury',exact:true});
  await assistant.getByRole('button',{name:'Zatwierdzam i kontynuuję',exact:true}).click();
  await expect(price).toHaveAttribute('aria-invalid','true');await expect(price).toBeFocused();
  await expect(name).toHaveValue('Opis musi pozostać po błędzie');await expect(price).toHaveValue('125');
  await expect(page.locator('#invoice-save-error')).toContainText('Wpisane dane pozostały w formularzu');
  assert.equal(rejected,1);await context.unroute('**/api/invoices',invalidWrite);
  await price.fill('126');await save.click();await assistant.getByRole('button',{name:'Zatwierdzam i kontynuuję',exact:true}).click();
  await expect(page).toHaveURL(/\/invoices$/);
  const saved=await read(`/api/invoices/search?companyId=${fixture.companyId}&search=UX-${engine}/SAVE`);assert.equal(saved.total,1);
  record('local and backend field errors focus the right visible control, preserve values and allow a single successful retry');
  await go('/invoices/new');await page.locator('#invoice-contractorId').click();await page.getByRole('option',{name:/Dodaj nowego/}).click();
  await page.getByRole('region',{name:'Zapis i wystawienie faktury'}).getByRole('button',{name:'Zapisz fakturę',exact:true}).click();
  await expect(page.locator('#invoice-new-name')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#invoice-new-tax-id')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#invoice-new-city')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#invoice-new-street')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#invoice-new-postal')).toHaveAttribute('aria-invalid','true');
  record('new-buyer name, tax ID and address errors have inline descriptions');
  await writeFile(`${out}/${engine}-invoice-ux.json`,JSON.stringify({passed:true,engine,checks},null,2));
 }catch(error){await page.screenshot({path:`${out}/${engine}-ux-failure.png`});await writeFile(`${out}/${engine}-ux-failure.json`,JSON.stringify({error:error.message,text:await page.locator('body').innerText()},null,2));throw error;}
}

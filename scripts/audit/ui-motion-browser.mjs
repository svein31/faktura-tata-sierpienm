import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

/** Run against an authenticated, disposable local fixture; no real providers. */
export async function auditUiMotion({ page, context, base, companyId, out, expect, engine }) {
  const checks = [];
  const record = name => { checks.push(name); console.log(`[ui-motion:${engine}] PASS ${name}`); };
  const ready = async path => {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
    await page.evaluate(() => document.fonts.ready);
  };
  const geometry = locator => locator.evaluate(n => { const b = n.getBoundingClientRect(); return { x:b.x,y:b.y,width:b.width,height:b.height }; });
  const stable = (a,b,message) => { for (const key of Object.keys(a)) assert.ok(Math.abs(a[key]-b[key]) < 1, `${message}: ${key} ${a[key]} -> ${b[key]}`); };
  const gate = () => { let release; const waiting = new Promise(r => { release=r; }); return { waiting, release }; };
  let releaseRequest = () => {};
  try {
    await ready('/dashboard');
    await page.getByRole('button',{name:'Jasny',exact:true}).first().click();
    const card = page.locator('section[data-tone="income"]');
    for (const theme of ['light','dark']) {
      await page.getByRole('button',{name:theme==='light'?'Jasny':'Ciemny',exact:true}).first().click();
      await page.mouse.move(0,0);
      const before = await geometry(card), color = await card.evaluate(n=>getComputedStyle(n).borderColor);
      await card.hover();
      await expect.poll(()=>card.evaluate(n=>getComputedStyle(n).borderColor)).not.toBe(color);
      stable(before,await geometry(card),`${theme} card hover`);
      record(`${theme} card hover changes its border without moving/resizing`);
    }
    await page.screenshot({path:`${out}/${engine}-dashboard-dark.png`});
    await page.getByRole('button',{name:'Jasny',exact:true}).first().click();
    await page.mouse.move(0,0);

    // Hold a real overview response: data is not delayed by the animation.
    let overviewGate = gate(); releaseRequest = overviewGate.release;
    const overviewRoute = async route => { await overviewGate.waiting; await route.continue(); };
    await context.route('**/api/overview?**',overviewRoute);
    await page.getByRole('button',{name:'Odśwież przegląd',exact:true}).click();
    const dashboardFallback = page.getByRole('status',{name:'Wczytywanie przeglądu',exact:true});
    await expect(dashboardFallback).toBeVisible();
    const reserved = await dashboardFallback.evaluate(n=>n.parentElement.getBoundingClientRect().height);
    overviewGate.release();
    await expect(page.getByRole('region',{name:'Sprawy wymagające działania',exact:true})).toBeVisible();
    await expect(dashboardFallback).toHaveCount(0);
    const dashboardHeight = await page.getByRole('region',{name:'Sprawy wymagające działania',exact:true}).evaluate(n=>n.parentElement.parentElement.getBoundingClientRect().height);
    assert.ok(dashboardHeight>=reserved-1,'Overview does not collapse when the skeleton leaves');
    await context.unroute('**/api/overview?**',overviewRoute);
    record('dashboard loading fades to immediate data and retains its reserved height');

    await ready('/invoices/new');
    await page.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).click();
    await page.getByRole('textbox',{name:'Numer faktury',exact:true}).fill(`MOTION-${engine.toUpperCase()}/01`);
    await page.locator('#invoice-contractorId').click();
    await page.getByRole('option',{name:/Pracownia Forma/}).click();
    await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill(`Motion QA ${engine}`);
    await page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true}).fill('250');
    const save = page.locator('button:visible').filter({has:page.locator('.ui-save-label')}).last();
    await save.scrollIntoViewIfNeeded();
    const saveBounds = await geometry(save);
    const saveBefore = {width:saveBounds.width,height:saveBounds.height};
    const beforeTotal=(await (await context.request.get(`${base}/api/invoices/search?companyId=${companyId}`)).json()).total;
    let writeGate=gate(), fail=true, posts=0, saved=null;
    releaseRequest=writeGate.release;
    const writeRoute=async route=>{
      if(route.request().method()!=='POST')return route.continue();
      posts++;await writeGate.waiting;
      if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Kontrolowany błąd testowy zapisu'})});
      const response=await route.fetch();
      const body=await response.json();assert.ok(response.ok(),JSON.stringify(body));saved=body.invoice;
      await route.fulfill({response});
    };
    await context.route('**/api/invoices',writeRoute);
    const confirmSave=async()=>{
      await save.click();
      const assistant=page.getByRole('dialog',{name:'Asystent przed wysyłką faktury',exact:true});
      await expect(assistant).toBeVisible();
      await assistant.getByRole('button',{name:'Zatwierdzam i kontynuuję',exact:true}).click();
      await expect(save).toHaveAttribute('aria-busy','true');
      await expect(save).toBeDisabled();
      stable(saveBefore,await geometry(save),'Save button pending geometry');
    };
    await confirmSave();
    assert.equal(await page.locator('.ui-save-confirmed').count(),0,'No success indicator before response');
    writeGate.release();
    await expect(page.getByText('Kontrolowany błąd testowy zapisu',{exact:true})).toBeVisible();
    await expect(save).toBeEnabled();
    stable(saveBefore,await geometry(save),'Save button after failure');
    assert.equal(await page.locator('.ui-save-confirmed').count(),0,'No success indicator after failure');
    assert.equal((await (await context.request.get(`${base}/api/invoices/search?companyId=${companyId}`)).json()).total,beforeTotal);
    record('pending save keeps its width/height; failed save never displays success or creates a row');
    fail=false;writeGate=gate();releaseRequest=writeGate.release;
    await confirmSave();
    writeGate.release();
    await expect(page).toHaveURL(/\/invoices$/);
    assert.ok(saved?.id);
    await page.locator(`[data-invoice-id="${saved.id}"]:visible`).scrollIntoViewIfNeeded();
    const row=page.locator('[data-new-invoice="true"]:visible');
    await expect(row).toHaveCount(1);
    assert.ok(saved?.id);
    await expect(row).toContainText(saved.number);
    await expect(page.locator('.ui-save-confirmed')).toBeVisible();
    const highlighted=await geometry(row);
    await page.screenshot({path:`${out}/${engine}-created-highlight.png`});
    await expect(page.locator('[data-new-invoice="true"]')).toHaveCount(0);
    const savedRow=page.locator('tr:visible').filter({hasText:saved.number});
    stable(highlighted,await geometry(savedRow),'Created row after highlight');
    assert.equal(posts,2,'One failed attempt and one confirmed write, no duplicate POST');
    await context.unroute('**/api/invoices',writeRoute);
    record('confirmed write shows animated check, highlights exactly the created row, and does not resize it');
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await expect(savedRow).toBeVisible();
    assert.equal(await page.locator('[data-new-invoice="true"]').count(),0);
    record('background refresh does not replay the new-invoice highlight');

    // Filter results must hide old-scope rows; the faded skeleton is inert.
    let searchGate=gate();releaseRequest=searchGate.release;
    const searchRoute=async route=>{if(new URL(route.request().url()).searchParams.get('search')==='MOTION-NO-MATCH'){await searchGate.waiting;}return route.continue();};
    await context.route('**/api/invoices/search?**',searchRoute);
    await page.getByPlaceholder('Szukaj: numer, kontrahent, NIP, numer KSeF…').fill('MOTION-NO-MATCH');
    const listFallback=page.getByRole('status',{name:'Wczytywanie faktur',exact:true});
    await expect(listFallback).toBeVisible();
    assert.equal(await page.locator('tbody tr').count(),0,'Old query rows are not retained under new filters');
    const placeholderHeight=await listFallback.evaluate(n=>{n.parentElement.dataset.motionQa='results';return n.parentElement.getBoundingClientRect().height;});
    searchGate.release();
    await expect(page.getByText('Brak faktur spełniających kryteria',{exact:true}).first()).toBeVisible();
    await expect(listFallback).toHaveCount(0);
    assert.ok(await page.locator('[data-motion-qa="results"]').evaluate(n=>n.getBoundingClientRect().height)>=placeholderHeight-1);
    await context.unroute('**/api/invoices/search?**',searchRoute);
    record('filter skeleton reveals empty results without collapsing or retaining unrelated rows');

    await page.emulateMedia({reducedMotion:'reduce'});
    await ready('/dashboard');
    assert.equal(await page.locator('.ui-page-enter').evaluate(n=>getComputedStyle(n).animationName),'none');
    await page.getByRole('button',{name:'Odśwież przegląd',exact:true}).click();
    await expect(page.getByRole('region',{name:'Sprawy wymagające działania',exact:true})).toBeVisible();
    assert.equal(await page.locator('.ui-loading-exit:visible').count(),0);
    record('reduced-motion preference disables page/reveal animations and leaves content readable');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await ready('/dashboard');
    await page.locator('.ui-page-enter').evaluate(n=>n.dataset.previousRoute='dashboard');
    await page.getByRole('link',{name:'Terminarz',exact:true}).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.locator('main h1')).toBeVisible();
    assert.equal(await page.locator('.ui-page-enter').getAttribute('data-previous-route'),null);
    assert.equal(await page.locator('.ui-page-enter').evaluate(n=>getComputedStyle(n).animationName),'ui-content-in');
    record('client navigation remounts the opacity-only page reveal');
    await ready('/invoices');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    for (const width of [390,1280,1920]) {
      await page.setViewportSize({width,height:900});
      await expect(page.locator('main h1')).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px page overflow`);
      await page.screenshot({path:`${out}/${engine}-invoices-${width}.png`});
    }
    record('invoice list fits phone and desktop widths without horizontal page overflow');
    await page.setViewportSize({width:390,height:844});
    await ready('/invoices/new');
    await page.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).click();
    await page.getByRole('textbox',{name:'Numer faktury',exact:true}).fill(`MOBILE-${engine.toUpperCase()}/01`);
    await page.locator('#invoice-contractorId').click();
    await page.getByRole('option',{name:/Pracownia Forma/}).click();
    await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill('Mobile motion QA');
    await page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true}).fill('150');
    const draft=page.getByRole('button',{name:'Szkic',exact:true});
    await draft.scrollIntoViewIfNeeded();
    const draftBefore=await geometry(draft);
    writeGate=gate();releaseRequest=writeGate.release;
    await context.route('**/api/invoices',writeRoute);
    await draft.click();
    const pendingDraft=page.locator('button[aria-busy="true"]:visible').filter({has:page.locator('.ui-save-label')});
    await expect(pendingDraft).toBeDisabled();
    stable({width:draftBefore.width,height:draftBefore.height},await geometry(pendingDraft),'Mobile draft pending geometry');
    writeGate.release();
    await expect(page).toHaveURL(/\/invoices$/);
    const newMobileRow=page.locator(`article[data-invoice-id="${saved.id}"]:visible`);
    await expect(newMobileRow).toBeVisible();
    assert.equal(await newMobileRow.getAttribute('data-new-invoice'),null,'Off-screen new card does not spend its highlight');
    await newMobileRow.scrollIntoViewIfNeeded();
    const mobileRow=page.locator('article[data-new-invoice="true"]:visible');
    await expect(mobileRow).toHaveCount(1);
    await expect(page.locator('.ui-save-confirmed')).toBeVisible();
    const mobileBounds=await geometry(mobileRow);
    const mobileNumber=saved.number;
    await page.screenshot({path:`${out}/${engine}-mobile-created-highlight.png`});
    await expect(page.locator('[data-new-invoice="true"]')).toHaveCount(0);
    stable(mobileBounds,await geometry(page.locator('article:visible').filter({hasText:mobileNumber})),'Mobile new invoice geometry');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile draft/list fits the viewport');
    await context.unroute('**/api/invoices',writeRoute);
    assert.equal(posts,3,'Failed save, confirmed issue and confirmed mobile draft only');
    record('mobile draft pending/success is stable; off-screen highlight waits until its card enters view');
    await writeFile(`${out}/${engine}-motion-qa.json`,JSON.stringify({passed:true,engine,checks,savedInvoice:saved.id},null,2));
    return checks;
  } catch(error) {
    await page.screenshot({path:`${out}/${engine}-failure.png`});
    await writeFile(`${out}/${engine}-failure.json`,JSON.stringify({error:error.message,text:await page.locator('body').innerText()},null,2));
    throw error;
  } finally { releaseRequest(); }
}

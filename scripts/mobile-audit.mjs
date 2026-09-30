import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const appRoutes = ['/dashboard','/analytics','/calendar','/invoices','/invoices/new','/invoices/recurring','/advances','/offers','/recurring','/reminders','/ksef','/expenses','/documents','/cost-reviews','/finances','/contractors','/products','/warehouse','/orders','/projects','/accountant/portal','/accountant','/jpk','/tax-estimate','/audit','/settings/team','/settings/companies','/settings/appearance','/settings/pdf-templates','/settings/currencies','/settings/integrations','/settings/health','/settings/account','/settings/ksef','/help'];
const publicRoutes = ['/','/login','/register','/forgot-password','/demo','/program-do-faktur','/narzedzia','/narzedzia/kalkulator-vat','/narzedzia/limit-ksef','/pomoc','/regulamin','/polityka-cookies','/polityka-prywatnosci','/powierzenie-danych','/faktury','/poradnik-ksef','/vat'];
export async function mobileLayoutDefects(page) {
  return page.evaluate(configuredWidth => {
    const width = Math.min(configuredWidth, document.documentElement.clientWidth), failures = [];
    if (document.documentElement.scrollWidth > width + 2) failures.push({kind:'page-overflow',width:document.documentElement.scrollWidth,viewport:width});
    for (const element of document.querySelectorAll('main *,header *,[role="dialog"] *')) {
      if (!(element instanceof HTMLElement) || !element.getClientRects().length || element.closest('.sr-only,[aria-hidden="true"]')) continue;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (rect.width < 2 || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      let scrolled = false;
      for (let parent=element.parentElement;parent && parent!==document.body;parent=parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowX;
        if (['auto','scroll'].includes(overflow) && parent.scrollWidth > parent.clientWidth + 2) { scrolled=true; break; }
      }
      if (scrolled) continue;
      const label=(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0,90);
      if (rect.left < -2 || rect.right > width + 2) failures.push({kind:'element-outside',tag:element.tagName,label,class:element.className,left:Math.round(rect.left),right:Math.round(rect.right)});
      if (element.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]),textarea') && width<=430 && Number.parseFloat(style.fontSize)<16) failures.push({kind:'input-font',label,font:style.fontSize});
    }
    return failures.slice(0,16);
  }, page.viewportSize().width);
}

export async function auditMobileExperience(base, storageState, fixture) {
  const failures=[], engines=[{name:'chromium',driver:chromium,sizes:[[320,740],[375,812],[390,844],[430,932],[667,375]]}];
  if (process.env.RUN_WEBKIT_CHECKS==='1') engines.push({name:'webkit',driver:webkit,sizes:[[375,812],[430,932]]});
  await mkdir('artifacts/mobile',{recursive:true});
  let checks=0;
  for (const engine of engines) {
    const browser=await engine.driver.launch({headless:true});
    const context=await browser.newContext({baseURL:base,storageState,isMobile:true,hasTouch:true,viewport:{width:375,height:812}});
    const publicContext=await browser.newContext({baseURL:base,isMobile:true,hasTouch:true,viewport:{width:375,height:812}});
    const page=await context.newPage(), publicPage=await publicContext.newPage(), errors=[];
    for(const target of [page,publicPage]) target.on('pageerror',error=>{const record={engine:engine.name,url:target.url(),message:error.message,stack:error.stack};errors.push(record);console.log('[mobile-js-error] '+JSON.stringify(record));});
    let activeTarget=page;
    async function audit(target,label) {
      activeTarget=target;
      const found=await mobileLayoutDefects(target);checks++;
      if(found.length) {
        failures.push({engine:engine.name,viewport:target.viewportSize(),route:label,defects:found});
        console.log('[mobile-audit] '+JSON.stringify(failures.at(-1)));
        await target.screenshot({path:'artifacts/mobile/'+engine.name+'-'+target.viewportSize().width+'-'+label.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true});
      }
    }
    try {
      for (const [width,height] of engine.sizes) {
        await page.setViewportSize({width,height}); await publicPage.setViewportSize({width,height});
        const publicSet=width===667?['/','/login','/demo']:publicRoutes;
        for(const route of publicSet) {
          activeTarget=publicPage; await publicPage.goto(route);
          await expect(publicPage.locator('h1').first()).toBeVisible();
          await publicPage.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');
          if(!await publicPage.evaluate(()=>document.cookie.includes('fakturo_consent='))) await expect(publicPage.getByRole('button',{name:'Odrzuć opcjonalne',exact:true})).toBeVisible();
          const reject=publicPage.getByRole('button',{name:'Odrzuć opcjonalne',exact:true});
          if(await reject.isVisible()) await reject.tap();
          await publicPage.evaluate(()=>document.fonts.ready); await audit(publicPage,route);
          if(route==='/' && width<=375) {
            await publicPage.getByRole('button',{name:'Ustawienia prywatności',exact:true}).tap();
            await expect(publicPage.getByRole('dialog')).toBeVisible(); await audit(publicPage,'cookie preferences');
            await publicPage.getByRole('dialog').getByRole('button',{name:'Zamknij',exact:true}).tap();
          }
        }
        const routes=width===667?['/invoices/new','/finances','/accountant/portal','/settings/companies']:[...appRoutes,'/invoices/'+fixture.invoiceId];
        for(const route of routes) {
          activeTarget=page; await page.goto(route);
          await expect(page.locator('main')).toBeVisible();
          await expect(page.locator('main h1').first()).toBeVisible();
          await page.waitForLoadState('networkidle');
          await page.evaluate(()=>document.fonts.ready);
          assert.equal(await page.getByText('Nie udało się wyświetlić strony',{exact:true}).count(),0,route);
          await audit(page,route);
          if(width===320 || engine.name==='webkit' && width===375) {
            const summaries=page.locator('main details > summary');
            for(let index=0;index<await summaries.count();index++) {
              const summary=summaries.nth(index);
              if(await summary.isVisible()) await summary.evaluate(element=>element.parentElement.open=true);
            }
            await audit(page,route+' expanded');
          }
        }
      }
      await page.setViewportSize({width:320,height:740});
      let releaseBootstrap;
      const bootstrapGate=new Promise(resolve=>{releaseBootstrap=resolve;});
      const holdBootstrap=async route=>{await bootstrapGate;await route.continue();};
      await page.route('**/api/data**',holdBootstrap);
      try {
        activeTarget=page; await page.goto('/dashboard',{waitUntil:'domcontentloaded'});
        await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
        await audit(page,'data loading on slow connection');
      } finally {releaseBootstrap();}
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.unroute('**/api/data**',holdBootstrap);
      for (const [width,height] of [[320,740],[430,932]]) {
        await page.setViewportSize({width,height});
        for (const [route,button] of [['/contractors','Dodaj kontrahenta'],['/products','Dodaj pozycję'],['/offers','Nowa oferta'],['/orders','Nowe zlecenie'],['/expenses','Dodaj koszt'],['/settings/companies','Dodaj firmę']]) {
          activeTarget=page; await page.goto(route); await expect(page.locator('main h1').first()).toBeVisible();
          await page.getByRole('button',{name:button,exact:true}).first().tap();
          const dialog=page.getByRole('dialog').first(); await expect(dialog).toBeVisible();
          await audit(page,route+' create dialog');
          await dialog.getByRole('button',{name:'Zamknij',exact:true}).tap();
          await expect(dialog).toHaveCount(0);
        }
      }
      await page.setViewportSize({width:320,height:740});
      activeTarget=page; await page.goto('/contractors');
      await page.getByRole('button',{name:'CRM 360°',exact:true}).first().tap();
      const crm=page.getByRole('dialog'); await expect(crm).toBeVisible();
      await expect(crm.getByRole('status')).toHaveCount(0); await audit(page,'contractor CRM');
      await crm.getByRole('button',{name:'Zamknij',exact:true}).tap(); await expect(crm).toHaveCount(0);
      activeTarget=page; await page.goto('/invoices/'+fixture.invoiceId);
      await page.getByRole('button',{name:'Wyślij e-mailem',exact:true}).tap();
      const email=page.getByRole('dialog'); await expect(email).toBeVisible(); await audit(page,'invoice email dialog');
      await email.getByRole('button',{name:'Zamknij',exact:true}).first().tap(); await expect(email).toHaveCount(0);
      activeTarget=page; await page.goto('/invoices/new');
      await page.getByTitle('Skróty klawiszowe (Ctrl+S, Ctrl+Enter, Shift+Alt+N...)',{exact:true}).tap();
      const shortcuts=page.getByRole('dialog',{name:'Skróty klawiszowe',exact:true});
      await expect(shortcuts).toBeVisible(); await audit(page,'invoice shortcuts');
      await shortcuts.getByRole('button',{name:'Zamknij',exact:true}).tap(); await expect(shortcuts).toHaveCount(0);
      // Exercise actual touch-sized controls, not just static screenshots.
      await page.setViewportSize({width:320,height:740});
      activeTarget=page; await page.goto('/dashboard'); await expect(page.locator('main h1')).toBeVisible();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fakturo:open-onboarding')));
      const tour=page.getByRole('dialog',{name:'Pierwsze kroki',exact:true});
      await expect(tour).toBeVisible(); await audit(page,'onboarding');
      await page.setViewportSize({width:320,height:360});
      await expect.poll(()=>tour.evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight+1)).toBe(true);
      await audit(page,'onboarding short viewport');
      await tour.getByRole('button',{name:'Dalej',exact:true}).tap();
      await expect(tour.getByText('Krok 2 z 5',{exact:true})).toBeVisible();
      await tour.getByRole('button',{name:'Pomiń',exact:true}).tap();
      await expect(tour).toHaveCount(0); await page.setViewportSize({width:320,height:740});
      const menuButton=page.getByRole('button',{name:'Otwórz menu',exact:true});
      await menuButton.tap(); const drawer=page.getByRole('dialog',{name:'Nawigacja',exact:true});
      await expect(drawer).toBeVisible(); await audit(page,'drawer');
      await drawer.getByRole('button',{name:'Ustawienia',exact:true}).tap();
      await drawer.getByRole('link',{name:'Wygląd',exact:true}).tap();
      await expect(page).toHaveURL(/settings\/appearance/); await expect(drawer).toHaveCount(0);
      await menuButton.tap(); await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
      await expect(menuButton).toBeFocused();
      const switcher=page.getByRole('button',{name:'Wybierz firmę',exact:true});
      await switcher.tap(); await audit(page,'company switcher');
      await page.getByRole('button',{name:new RegExp(fixture.alternateName)}).tap();
      await expect(page.getByRole('button',{name:'Wybierz firmę',exact:true})).toContainText(fixture.alternateName);
      await switcher.tap(); await page.getByRole('button',{name:/Browser Company/}).tap();
      await expect(switcher).toContainText('Browser Company');
      await page.getByRole('button',{name:/Szukaj faktur/}).tap();
      const search=page.getByRole('dialog',{name:'Wyszukiwanie i polecenia'});
      await expect(search).toBeVisible(); await audit(page,'command search');
      await page.setViewportSize({width:320,height:360});
      await expect.poll(()=>search.evaluate(element=>element.getBoundingClientRect().bottom <= innerHeight+1)).toBe(true);
      await audit(page,'command search short viewport');
      await page.keyboard.press('Escape'); await expect(search).toHaveCount(0);
      await page.setViewportSize({width:320,height:740});
      activeTarget=page; await page.goto('/finances');
      await page.getByRole('button',{name:/Import.*wyciąg/}).tap();
      const importDialog=page.getByRole('dialog',{name:'Import wyciągu bankowego',exact:true});
      await expect(importDialog).toBeVisible(); await audit(page,'bank import dialog');
      await page.setViewportSize({width:320,height:400});
      await expect.poll(()=>importDialog.evaluate(element=>{const r=element.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1;})).toBe(true);
      await audit(page,'bank import short viewport');
      await importDialog.getByRole('combobox').tap(); await expect(page.getByRole('listbox')).toBeVisible();
      await audit(page,'bank format dropdown'); await page.keyboard.press('Escape');
      await expect(importDialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(importDialog).toHaveCount(0);
      await page.setViewportSize({width:320,height:740});
      activeTarget=page; await page.goto('/invoices/new');
      const discard=page.getByRole('button',{name:'Odrzuć',exact:true});
      if(await discard.isVisible()) await discard.tap();
      await page.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).tap();
      await page.getByLabel('Numer faktury',{exact:true}).fill('MOBILE-'+engine.name);
      await page.locator('#invoice-contractorId').tap();
      await page.getByRole('option',{name:/Searchable Buyer/}).tap();
      await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill('Mobilna usługa z długą nazwą — test edycji bez przesuwania tabeli');
      await page.getByRole('spinbutton',{name:'Ilość pozycji 1',exact:true}).fill('2');
      await page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true}).fill('100');
      await page.getByRole('combobox',{name:'VAT pozycji 1',exact:true}).tap();
      await page.getByRole('option',{name:'8%',exact:true}).tap();
      await audit(page,'populated invoice creator');
      const [saved]=await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/api/invoices') && response.request().method()==='POST'),
        page.getByRole('button',{name:'Szkic',exact:true}).tap(),
      ]);
      const body=await saved.json();assert.ok(saved.ok(),JSON.stringify(body));
      await expect(page).toHaveURL(/invoices$/);
      assert.equal(body.invoice.lines[0].quantity,2);assert.equal(Number(body.invoice.lines[0].netPrice),100);assert.equal(String(body.invoice.lines[0].vatRate),'8');
      activeTarget=page; await page.goto('/reminders');
      assert.equal(await page.getByText('Dodaj SMS',{exact:true}).count(),0);
      await fixture.prepareTerms();
      activeTarget=page; await page.goto('/dashboard');
      const terms=page.getByRole('dialog',{name:'Aktualizacja Regulaminu serwisu',exact:true});
      await expect(terms).toBeVisible();
      await page.setViewportSize({width:320,height:400});
      await expect.poll(()=>terms.evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight+1)).toBe(true);
      await audit(page,'updated terms short viewport');
      const acceptTerms=terms.getByRole('button',{name:'Akceptuję zaktualizowany Regulamin',exact:true});
      await expect(acceptTerms).toBeDisabled();
      await page.keyboard.press('Escape'); await expect(terms).toBeVisible();
      await terms.getByRole('checkbox').check();
      const [accepted]=await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/api/user/accept-terms') && response.request().method()==='POST'),
        acceptTerms.tap(),
      ]);
      assert.ok(accepted.ok(),'Terms acceptance must succeed from a short phone viewport');
      await expect(terms).toHaveCount(0);
      assert.deepEqual(errors,[],engine.name+' mobile JavaScript errors');
      console.log('[mobile-audit] PASS '+engine.name+' drawer, navigation, company switching, search, bank dialog and mobile invoice draft');
    } catch(error) {
      const diagnostics=await activeTarget.evaluate(()=>({
        url:location.href,
        viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport?.height,visualWidth:visualViewport?.width,visualScale:visualViewport?.scale,visualTop:visualViewport?.offsetTop,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},
        dialogs:Array.from(document.querySelectorAll('[role="dialog"]')).map(dialog=>({
          title:dialog.textContent?.slice(0,120),
          rect:dialog.getBoundingClientRect().toJSON(),
          buttons:Array.from(dialog.querySelectorAll('button')).filter(button=>button.getAttribute('aria-label')==='Zamknij').map(button=>{
            const rect=button.getBoundingClientRect();
            return {rect:rect.toJSON(),hit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.outerHTML.slice(0,450)};
          }),
        })),
      })).catch(()=>({}));
      console.log('[mobile-interaction-failure] '+JSON.stringify(diagnostics));
      await activeTarget.screenshot({path:'artifacts/mobile/'+engine.name+'-interaction-failure.png',fullPage:true}).catch(()=>{});
      throw error;
    } finally {await context.close();await publicContext.close();await browser.close();}
  }
  console.log('[mobile-audit] '+checks+' layout checks; '+failures.length+' failing screens');
  assert.deepEqual(failures,[],'All mobile screens and expanded forms must fit the viewport');
}

/** Read-only verification of the public production site; never creates accounts or documents. */
export async function auditPublicMobileSite(origin) {
  assert.equal(origin,'https://fakturaprosto.pl','Production audit is restricted to the configured public origin');
  await mkdir('artifacts/mobile',{recursive:true});
  const failures=[],errors=[];let checks=0;
  for(const engine of [{name:'chromium',driver:chromium,widths:[320,390,430]},{name:'webkit',driver:webkit,widths:[375]}]) {
    const browser=await engine.driver.launch({headless:true});
    const context=await browser.newContext({baseURL:origin,isMobile:true,hasTouch:true,viewport:{width:375,height:812}});
    const page=await context.newPage();
    page.on('pageerror',error=>{const record={engine:engine.name,url:page.url(),message:error.message};errors.push(record);console.log('[production-mobile-js] '+JSON.stringify(record));});
    try {
      for(const width of engine.widths) {
        await page.setViewportSize({width,height:812});
        for(const route of publicRoutes) {
          const response=await page.goto(route,{timeout:60000});
          assert.ok(response?.ok(),engine.name+' '+route+' HTTP '+response?.status());
          await expect(page.locator('h1').first()).toBeVisible({timeout:30000});
          await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');
          if(!await page.evaluate(()=>document.cookie.includes('fakturo_consent='))) await expect(page.getByRole('button',{name:'Odrzuć opcjonalne',exact:true})).toBeVisible();
          await page.evaluate(()=>document.fonts.ready);
          const reject=page.getByRole('button',{name:'Odrzuć opcjonalne',exact:true});
          if(await reject.isVisible()) await reject.tap();
          const found=await mobileLayoutDefects(page);checks++;
          if(found.length) {
            const record={engine:engine.name,width,route,defects:found};failures.push(record);console.log('[production-mobile] '+JSON.stringify(record));
            await page.screenshot({path:'artifacts/mobile/production-'+engine.name+'-'+width+'-'+route.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true});
          }
        }
      }
    } finally {await context.close();await browser.close();}
  }
  assert.deepEqual(errors,[],'Public production JavaScript errors');
  assert.deepEqual(failures,[],'Public production mobile layout failures');
  console.log('[production-mobile] PASS '+checks+' public layout checks in Chromium and WebKit');
}

import assert from 'node:assert/strict';
import { chromium, webkit, firefox, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { collectPublicRoutePaths, sourceFingerprint } from './qa-inventory.mjs';
import { recordVisibleControls, recordBrowserScenario, auditHistoryAndKeyboard, auditNegativeAndRecovery, writeBrowserCoverage } from './audit/browser-control-inventory.mjs';
import { auditCookiePrintBrowser } from './audit/cookie-print-browser.mjs';
import { auditPrivatePrefetchBrowser } from './audit/private-prefetch-browser.mjs';

const appRoutes = ['/dashboard','/analytics','/calendar','/invoices','/invoices/new','/invoices/recurring','/advances','/offers','/recurring','/reminders','/ksef','/expenses','/documents','/cost-reviews','/finances','/contractors','/products','/warehouse','/orders','/projects','/accountant/portal','/accountant','/jpk','/tax-estimate','/audit','/settings/team','/settings/companies','/settings/appearance','/settings/pdf-templates','/settings/currencies','/settings/integrations','/settings/health','/settings/account','/settings/ksef','/help'];
// Isolate full document navigations while preserving the browser context.
// Closing an old document cancels Next prefetches; detach only its error
// listener during that deliberate teardown. All live-document errors remain fatal.
const errorObservers = new WeakMap(), responses = new WeakMap(), networkIssues=[], consoleIssues=[];
function observeErrors(page, engine, errors, prefix) {
  const listener = error => {
    const record = { engine, url: page.url(), message: error.message, stack: error.stack };
    errors.push(record); console.log(prefix + ' ' + JSON.stringify(record));
  };
  page.on('pageerror', listener);
  page.on('response',response=>{
    if(response.status()>=400) {
      const requestPath=new URL(response.url()).pathname;
      const injected=!!response.headers()['x-qa-fixture'];
      const deliberatelyMissing=requestPath==='/qa-audit-definitely-missing-page' || requestPath.includes('/qa_missing_capability_');
      networkIssues.push({engine,page:new URL(page.url()).pathname,path:requestPath,method:response.request().method(),status:response.status(),classification:injected || deliberatelyMissing?'expected-negative-test':'requires-review'});
    }
  });
  page.on('console',message=>{
    if(message.type()==='error')consoleIssues.push({engine,page:new URL(page.url()).pathname,message:message.text().slice(0,1000),classification:'requires-review'});
  });
  errorObservers.set(page, {engine, errors, prefix, listener});
}
async function navigate(previous, route, options) {
  let page = previous;
  if (previous.url() !== 'about:blank') {
    const observer = errorObservers.get(previous), viewport = previous.viewportSize();
    page = await previous.context().newPage();
    await page.setViewportSize(viewport);
    if (observer) {
      previous.off('pageerror', observer.listener);
      observeErrors(page, observer.engine, observer.errors, observer.prefix);
    }
    await previous.close();
  }
  responses.set(page, await page.goto(route, options));
  return page;
}

const publicRoutes = await collectPublicRoutePaths();
const sourceSha256=await sourceFingerprint();
const buildId=await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8').then(value=>value.trim()).catch(()=>null);
export async function mobileLayoutDefects(page) {
  return page.evaluate(configuredWidth => {
    const width = Math.min(configuredWidth, document.documentElement.clientWidth), failures = [];
    if (document.documentElement.scrollWidth > width + 2) failures.push({kind:'page-overflow',width:document.documentElement.scrollWidth,viewport:width});
    for (const element of document.querySelectorAll('body *')) {
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

// Background polling/prefetch and service workers can keep the network active.
// Audit the rendered view after hydration, bootstrap and font/layout completion.
export async function waitForRenderedLayout(page) {
  await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

export async function auditMobileExperience(base, storageState, fixture) {
  const failures=[], configuredEngines=[{name:'chromium',driver:chromium,sizes:[[320,740],[375,812],[390,844],[430,932],[667,375],[768,1024],[1280,900]]}];
  if (process.env.RUN_WEBKIT_CHECKS==='1') configuredEngines.push({name:'webkit',driver:webkit,sizes:[[375,812],[768,1024],[1280,900]]});
  if (process.env.RUN_FIREFOX_CHECKS==='1') configuredEngines.push({name:'firefox',driver:firefox,sizes:[[390,844],[768,1024],[1280,900]]});
  let engines=configuredEngines;
  if(process.env.QA_BROWSER_ENGINES!==undefined) {
    const selected=process.env.QA_BROWSER_ENGINES.split(',').map(value=>value.trim());
    assert.ok(selected.length && selected.every(name=>configuredEngines.some(engine=>engine.name===name)),'QA_BROWSER_ENGINES must contain enabled browser names: '+configuredEngines.map(engine=>engine.name).join(','));
    assert.equal(new Set(selected).size,selected.length,'QA_BROWSER_ENGINES must not repeat an engine');
    engines=configuredEngines.filter(engine=>selected.includes(engine.name));
  }
  await mkdir('artifacts/mobile',{recursive:true});
  await mkdir('artifacts/audit',{recursive:true});
  let checks=0;const engineResults=[],browserLifecycle=[];
  for (const engine of engines) {
    let browser=await engine.driver.launch({headless:true});
    // Playwright Firefox supports a touch viewport but does not implement
    // isMobile; actual responsive CSS is still measured at the requested size.
    // Controlled API failures are intercepted by Playwright. Service workers
    // can bypass route interception (notably WebKit), so this matrix blocks
    // them. The real worker/cache has its own dedicated regression tests.
    let context=await browser.newContext({baseURL:base,storageState,serviceWorkers:'block',isMobile:engine.name!=='firefox',hasTouch:true,viewport:{width:375,height:812}});
    let publicContext=await browser.newContext({baseURL:base,serviceWorkers:'block',isMobile:engine.name!=='firefox',hasTouch:true,viewport:{width:375,height:812}});
    context.setDefaultTimeout(15000);publicContext.setDefaultTimeout(15000);
    let page=await context.newPage(), publicPage=await publicContext.newPage(); const errors=[];
    for(const target of [page,publicPage]) observeErrors(target,engine.name,errors,'[mobile-js-error]');
    let activeTarget=page;
    async function audit(target,label) {
      activeTarget=target;
      const found=await mobileLayoutDefects(target);checks++;
      await recordVisibleControls(target,{engine:engine.name,scenario:label,layoutStatus:found.length?'failed':'checked'});
      if(found.length) {
        failures.push({engine:engine.name,viewport:target.viewportSize(),route:label,defects:found});
        console.log('[mobile-audit] '+JSON.stringify(failures.at(-1)));
        await target.screenshot({path:'artifacts/mobile/'+engine.name+'-'+target.viewportSize().width+'-'+label.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true});
      }
    }
    async function recycleFirefox(phase) {
        // Hundreds of full document/tab lifetimes can retain browser resources.
        // Preserve cookies/localStorage and viewport, then run the interaction
        // phase in a fresh engine process. Collected observations are retained;
        // only the deliberately closed documents lose their error listeners.
        const privateState=await context.storageState(),publicState=await publicContext.storageState();
        const privateViewport=page.viewportSize(),publicViewport=publicPage.viewportSize();
        for(const target of [...context.pages(),...publicContext.pages()]) {
          const observer=errorObservers.get(target);
          if(observer)target.off('pageerror',observer.listener);
        }
        await context.close();await publicContext.close();await browser.close();
        browser=await engine.driver.launch({headless:true});
        context=await browser.newContext({baseURL:base,storageState:privateState,serviceWorkers:'block',isMobile:false,hasTouch:true,viewport:privateViewport});
        publicContext=await browser.newContext({baseURL:base,storageState:publicState,serviceWorkers:'block',isMobile:false,hasTouch:true,viewport:publicViewport});
        context.setDefaultTimeout(15000);publicContext.setDefaultTimeout(15000);
        page=await context.newPage();publicPage=await publicContext.newPage();activeTarget=page;
        for(const target of [page,publicPage])observeErrors(target,engine.name,errors,'[mobile-js-error]');
        const lifecycle={engine:engine.name,event:phase,layoutChecks:checks,storageStatePreserved:true,privateViewport,publicViewport};
        browserLifecycle.push(lifecycle);console.log('[mobile-browser-lifecycle] '+JSON.stringify(lifecycle));
    }
    let enginePassed=false;
    try {
      await auditPrivatePrefetchBrowser(browser,{base,engine:engine.name,storageState,outputPath:'artifacts/audit/private-prefetch-'+engine.name+'.json'});
      await auditCookiePrintBrowser(browser,{base,engine:engine.name,outputPath:'artifacts/audit/cookie-print-'+engine.name+'.json'});
      const {auditUiPrimitives}=await import('./audit/ui-primitives-regression.mjs');
      const primitiveProof=await auditUiPrimitives(browser,{outputPath:'artifacts/audit/primitives-'+engine.name+'.json'});
      for(const check of primitiveProof.checks)recordBrowserScenario({engine:engine.name},'shared-ui:'+check.name,{scope:primitiveProof.scope,evidence:'artifacts/audit/primitives-'+engine.name+'.json'});
      const {auditInvoiceSearch}=await import('./audit/invoice-search-regression.mjs');
      const searchProof=await auditInvoiceSearch(browser,{outputPath:'artifacts/audit/invoice-search-'+engine.name+'.json'});
      for(const check of searchProof.checks)recordBrowserScenario({engine:engine.name},'invoice-search:'+check.name,{scope:searchProof.scope,evidence:'artifacts/audit/invoice-search-'+engine.name+'.json'});
      const {auditConsent}=await import('./audit/consent-browser-regression.mjs');
      const consentProof=await auditConsent(browser,{outputPath:'artifacts/audit/consent-'+engine.name+'.json'});
      for(const check of consentProof.checks)recordBrowserScenario({engine:engine.name},'consent:'+check.name,{scope:consentProof.scope,evidence:'artifacts/audit/consent-'+engine.name+'.json'});
      if(fixture.financialAudit){
        const financialProof=await fixture.financialAudit(browser,engine.name);
        for(const check of financialProof.checks)recordBrowserScenario({engine:engine.name},'financial:'+check,{evidence:'artifacts/audit/financial-'+engine.name+'.json'});
      }
      if(fixture.invitationAudit){
        const invitationProof=await fixture.invitationAudit(browser,engine.name);
        for(const check of invitationProof.checks)recordBrowserScenario({engine:engine.name},'invitation:'+check,{evidence:'artifacts/audit/invitation-'+engine.name+'.json'});
      }
      if(fixture.teamClipboardAudit){
        const clipboardProof=await fixture.teamClipboardAudit(browser,engine.name);
        for(const check of clipboardProof.checks)recordBrowserScenario({engine:engine.name},'team-clipboard:'+check,{evidence:'artifacts/audit/team-clipboard-'+engine.name+'.json'});
      }
      if(fixture.expenseFilterAudit){
        const filterProof=await fixture.expenseFilterAudit(browser,engine.name);
        for(const check of filterProof.checks)recordBrowserScenario({engine:engine.name},'expenses-filter:'+check,{evidence:'artifacts/audit/expenses-filter-'+engine.name+'.json'});
      }
      let viewportIndex=0;
      for (const [width,height] of engine.sizes) {
        if(engine.name==='firefox' && viewportIndex>0)await recycleFirefox('between-layout-viewports');
        viewportIndex++;
        await page.setViewportSize({width,height}); await publicPage.setViewportSize({width,height});
        const completeRoutes=[320,768,1280].includes(width) || engine.name==='webkit' && width===375 || engine.name==='firefox' && width===390;
        const publicSet=completeRoutes?[...publicRoutes,...(fixture.publicRoutes || [])]:['/','/login','/register','/demo','/cennik','/narzedzia/kalkulator-vat'];
        for(const route of publicSet) {
          publicPage=await navigate(publicPage,route); activeTarget=publicPage;
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
        const routes=completeRoutes?[...appRoutes,'/invoices/'+fixture.invoiceId]:['/dashboard','/invoices/new','/finances','/accountant/portal','/settings/companies'];
        for(const route of routes) {
          page=await navigate(page,route); activeTarget=page;
          await expect(page.locator('main')).toBeVisible();
          await expect(page.locator('main h1').first()).toBeVisible();
          await waitForRenderedLayout(page);
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
        console.log('[mobile-viewport-done] '+JSON.stringify({engine:engine.name,width,height,checks,layoutFailures:failures.length}));
      }
      if(engine.name==='firefox')await recycleFirefox('before-interaction-phase');
      await auditHistoryAndKeyboard(page,publicPage,engine.name);
      await auditNegativeAndRecovery(page,publicPage,engine.name);
      const publicViewport=publicPage.viewportSize();
      const {auditPublicCalculators}=await import('./public-calculator-browser-checks.mjs');
      activeTarget=publicPage;
      const calculatorScenarios=await auditPublicCalculators(publicPage);
      for(const scenario of calculatorScenarios)recordBrowserScenario({engine:engine.name},'public-calculator:'+scenario.scenario,{viewport:scenario.viewport});
      await publicPage.setViewportSize(publicViewport);
      const {auditPasswordResetLinks}=await import('./audit/password-reset-browser.mjs');
      await auditPasswordResetLinks(publicPage,engine.name);
      recordBrowserScenario({engine:engine.name},'reset-password-fragment-legacy-and-missing-token');
      await page.setViewportSize({width:320,height:740});
      let releaseBootstrap;
      const bootstrapGate=new Promise(resolve=>{releaseBootstrap=resolve;});
      const holdBootstrap=async route=>{await bootstrapGate;await route.continue();};
      await context.route('**/api/data**',holdBootstrap);
      try {
        page=await navigate(page,'/settings/companies',{waitUntil:'domcontentloaded'}); activeTarget=page;
        await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
        await audit(page,'data loading on slow connection');
      } finally {releaseBootstrap();}
      await expect(page.locator('main h1').first()).toBeVisible();
      await context.unroute('**/api/data**',holdBootstrap);
      for (const [width,height] of [[320,740],[430,932]]) {
        await page.setViewportSize({width,height});
        for (const [route,button] of [['/contractors','Dodaj kontrahenta'],['/products','Dodaj pozycję'],['/offers','Nowa oferta'],['/orders','Nowe zlecenie'],['/expenses','Dodaj koszt'],['/settings/companies','Dodaj firmę']]) {
          page=await navigate(page,route); activeTarget=page; await expect(page.locator('main h1').first()).toBeVisible();
          await page.getByRole('button',{name:button,exact:true}).first().tap();
          const dialog=page.getByRole('dialog').first(); await expect(dialog).toBeVisible();
          await audit(page,route+' create dialog');
          await dialog.getByRole('button',{name:'Zamknij',exact:true}).tap();
          await expect(dialog).toHaveCount(0);
        }
      }
      await page.setViewportSize({width:320,height:740});
      page=await navigate(page,'/contractors'); activeTarget=page;
      await page.getByRole('button',{name:'CRM 360°',exact:true}).first().tap();
      const crm=page.getByRole('dialog'); await expect(crm).toBeVisible();
      await expect(crm.getByRole('status')).toHaveCount(0); await audit(page,'contractor CRM');
      await crm.getByRole('button',{name:'Zamknij',exact:true}).tap(); await expect(crm).toHaveCount(0);
      page=await navigate(page,'/invoices/'+fixture.invoiceId); activeTarget=page;
      await page.getByRole('button',{name:'Wyślij e-mailem',exact:true}).tap();
      const email=page.getByRole('dialog'); await expect(email).toBeVisible(); await audit(page,'invoice email dialog');
      await email.getByRole('button',{name:'Zamknij',exact:true}).first().tap(); await expect(email).toHaveCount(0);
      page=await navigate(page,'/invoices/new'); activeTarget=page;
      await page.getByTitle('Skróty klawiszowe (Ctrl+S, Ctrl+Enter, Shift+Alt+N...)',{exact:true}).tap();
      const shortcuts=page.getByRole('dialog',{name:'Skróty klawiszowe',exact:true});
      await expect(shortcuts).toBeVisible(); await audit(page,'invoice shortcuts');
      await shortcuts.getByRole('button',{name:'Zamknij',exact:true}).tap(); await expect(shortcuts).toHaveCount(0);
      // Exercise actual touch-sized controls, not just static screenshots.
      await page.setViewportSize({width:320,height:740});
      page=await navigate(page,'/dashboard'); activeTarget=page; await expect(page.locator('main h1')).toBeVisible();
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
      const switcher=page.getByRole('button',{name:/^Wybierz firmę:/});
      await switcher.tap(); await audit(page,'company switcher');
      await page.getByRole('button',{name:new RegExp(fixture.alternateName)}).tap();
      await expect(page.getByRole('button',{name:/^Wybierz firmę:/})).toContainText(fixture.alternateName);
      await switcher.tap(); await page.getByRole('button',{name:/Browser Company/}).tap();
      await expect(switcher).toContainText('Browser Company');
      await page.getByRole('button',{name:/^Szukaj/}).tap();
      const search=page.getByRole('dialog',{name:'Wyszukiwanie i polecenia'});
      await expect(search).toBeVisible(); await audit(page,'command search');
      await page.setViewportSize({width:320,height:360});
      await expect.poll(()=>search.evaluate(element=>element.getBoundingClientRect().bottom <= innerHeight+1)).toBe(true);
      await audit(page,'command search short viewport');
      await page.keyboard.press('Escape'); await expect(search).toHaveCount(0);
      await page.setViewportSize({width:320,height:740});
      page=await navigate(page,'/finances'); activeTarget=page;
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
      page=await navigate(page,'/invoices/new'); activeTarget=page;
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
      page=await navigate(page,'/reminders'); activeTarget=page;
      assert.equal(await page.getByText('Dodaj SMS',{exact:true}).count(),0);
      await fixture.prepareTerms();
      page=await navigate(page,'/dashboard'); activeTarget=page;
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
      enginePassed=true;
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
      console.log('[mobile-interaction-failure] '+JSON.stringify({engine:engine.name,error:{name:error.name,message:error.message,stack:error.stack},browserConnected:browser.isConnected(),activePageClosed:activeTarget.isClosed(),diagnostics}));
      await activeTarget.screenshot({path:'artifacts/mobile/'+engine.name+'-interaction-failure.png',fullPage:true}).catch(()=>{});
      throw error;
    } finally {
      engineResults.push({engine:engine.name,status:enginePassed && !failures.some(failure=>failure.engine===engine.name)?'passed':'failed'});
      await writeBrowserCoverage({sourceSha256,buildId,selectedEngines:engines.map(engine=>engine.name),browserLifecycle,engines:engineResults,completedEngines:engineResults.filter(engine=>engine.status==='passed').map(engine=>engine.engine),layoutChecks:checks,layoutFailures:failures,networkIssues,consoleIssues});
      await context.close();await publicContext.close();await browser.close();
    }
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
    let page=await context.newPage();
    observeErrors(page,engine.name,errors,'[production-mobile-js]');
    try {
      for(const width of engine.widths) {
        await page.setViewportSize({width,height:812});
        for(const route of publicRoutes) {
          // A full browser fetches page assets and prefetches links too. Pace this
          // read-only audit instead of sending a burst to the production edge.
          await new Promise(resolve=>setTimeout(resolve,1200));
          let response;
          for(let attempt=0;attempt<4;attempt++) {
            page=await navigate(page,route,{timeout:60000});response=responses.get(page);
            if(response?.ok())break;
            const headers=response?.headers() || {};
            const body=await response?.text().catch(()=> '') || '';
            const message=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1400);
            console.log('[production-http] '+JSON.stringify({engine:engine.name,width,route,attempt:attempt+1,status:response?.status(),message,headers:Object.fromEntries(['server','retry-after','x-nf-request-id','x-nf-error','x-netlify-error','content-type'].filter(key=>headers[key]).map(key=>[key,headers[key]]))}));
            if(attempt===3 || ![403,429,503].includes(response?.status()))break;
            const retrySeconds=Number(headers['retry-after']);
            if(Number.isFinite(retrySeconds) && retrySeconds>30)break;
            await new Promise(resolve=>setTimeout(resolve,Math.max([2000,5000,10000][attempt],Number.isFinite(retrySeconds)?retrySeconds*1000:0)));
          }
          if(!response?.ok())await page.screenshot({path:'artifacts/mobile/production-http-'+engine.name+'-'+width+'-'+route.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true}).catch(()=>{});
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

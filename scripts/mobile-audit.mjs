import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const appRoutes = ['/dashboard','/analytics','/calendar','/invoices','/invoices/new','/invoices/recurring','/advances','/offers','/recurring','/reminders','/ksef','/expenses','/documents','/cost-reviews','/finances','/contractors','/products','/warehouse','/orders','/projects','/accountant/portal','/accountant','/jpk','/tax-estimate','/audit','/settings/team','/settings/companies','/settings/appearance','/settings/pdf-templates','/settings/currencies','/settings/integrations','/settings/health','/settings/account','/settings/ksef','/help'];
const publicRoutes = ['/','/login','/register','/forgot-password','/demo','/program-do-faktur','/narzedzia','/narzedzia/kalkulator-vat','/narzedzia/limit-ksef','/pomoc','/regulamin','/polityka-cookies','/polityka-prywatnosci','/powierzenie-danych','/faktury','/poradnik-ksef','/vat'];
async function defects(page) {
  return page.evaluate(() => {
    const width = innerWidth, failures = [];
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
  });
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
    page.on('pageerror',error=>errors.push(error.message));
    publicPage.on('pageerror',error=>errors.push(error.message));
    async function audit(target,label) {
      const found=await defects(target);checks++;
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
          await publicPage.goto(route);
          await expect(publicPage.locator('h1').first()).toBeVisible();
          const reject=publicPage.getByRole('button',{name:'Odrzuć opcjonalne',exact:true});
          if(await reject.isVisible()) await reject.click();
          await publicPage.evaluate(()=>document.fonts.ready); await audit(publicPage,route);
        }
        const routes=width===667?['/invoices/new','/finances','/accountant/portal','/settings/companies']:[...appRoutes,'/invoices/'+fixture.invoiceId];
        for(const route of routes) {
          await page.goto(route);
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
      // Exercise actual touch-sized controls, not just static screenshots.
      await page.setViewportSize({width:320,height:740});
      await page.goto('/dashboard'); await expect(page.locator('main h1')).toBeVisible();
      const menuButton=page.getByRole('button',{name:'Otwórz menu',exact:true});
      await menuButton.click(); const drawer=page.getByRole('dialog',{name:'Nawigacja',exact:true});
      await expect(drawer).toBeVisible(); await audit(page,'drawer');
      await drawer.getByRole('button',{name:'Ustawienia',exact:true}).click();
      await drawer.getByRole('link',{name:'Wygląd',exact:true}).click();
      await expect(page).toHaveURL(/settings\/appearance/); await expect(drawer).toHaveCount(0);
      await menuButton.click(); await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
      await expect(menuButton).toBeFocused();
      const switcher=page.getByRole('button',{name:'Wybierz firmę',exact:true});
      await switcher.click(); await audit(page,'company switcher');
      await page.getByRole('button',{name:new RegExp(fixture.alternateName)}).click();
      await expect(page.getByRole('button',{name:'Wybierz firmę',exact:true})).toContainText(fixture.alternateName);
      await switcher.click(); await page.getByRole('button',{name:/Browser Company/}).click();
      await expect(switcher).toContainText('Browser Company');
      await page.getByRole('button',{name:/Szukaj faktur/}).click();
      const search=page.getByRole('dialog',{name:'Wyszukiwanie i polecenia'});
      await expect(search).toBeVisible(); await audit(page,'command search');
      await page.setViewportSize({width:320,height:360});
      await expect.poll(()=>search.evaluate(element=>element.getBoundingClientRect().bottom <= innerHeight+1)).toBe(true);
      await audit(page,'command search short viewport');
      await page.keyboard.press('Escape'); await expect(search).toHaveCount(0);
      await page.setViewportSize({width:320,height:740});
      await page.goto('/finances');
      await page.getByRole('button',{name:/Import.*wyciąg/}).click();
      const importDialog=page.getByRole('dialog',{name:'Import wyciągu bankowego',exact:true});
      await expect(importDialog).toBeVisible(); await audit(page,'bank import dialog');
      await page.setViewportSize({width:320,height:400});
      await expect.poll(()=>importDialog.evaluate(element=>{const r=element.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight+1;})).toBe(true);
      await audit(page,'bank import short viewport');
      await importDialog.getByRole('combobox').click(); await expect(page.getByRole('listbox')).toBeVisible();
      await audit(page,'bank format dropdown'); await page.keyboard.press('Escape');
      await expect(importDialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(importDialog).toHaveCount(0);
      await page.setViewportSize({width:320,height:740});
      await page.goto('/invoices/new');
      const discard=page.getByRole('button',{name:'Odrzuć',exact:true});
      if(await discard.isVisible()) await discard.click();
      await page.getByRole('button',{name:'Wpisz numer ręcznie',exact:true}).click();
      await page.getByLabel('Numer faktury',{exact:true}).fill('MOBILE-'+engine.name);
      await page.locator('#invoice-contractorId').click();
      await page.getByRole('option',{name:/Searchable Buyer/}).click();
      await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill('Mobilna usługa z długą nazwą — test edycji bez przesuwania tabeli');
      await page.getByRole('spinbutton',{name:'Ilość pozycji 1',exact:true}).fill('2');
      await page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true}).fill('100');
      await page.getByRole('combobox',{name:'VAT pozycji 1',exact:true}).click();
      await page.getByRole('option',{name:'8%',exact:true}).click();
      await audit(page,'populated invoice creator');
      const [saved]=await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/api/invoices') && response.request().method()==='POST'),
        page.getByRole('button',{name:'Szkic',exact:true}).click(),
      ]);
      const body=await saved.json();assert.ok(saved.ok(),JSON.stringify(body));
      await expect(page).toHaveURL(/invoices$/);
      assert.equal(body.invoice.lines[0].quantity,2);assert.equal(Number(body.invoice.lines[0].netPrice),100);assert.equal(String(body.invoice.lines[0].vatRate),'8');
      await page.goto('/reminders');
      assert.equal(await page.getByText('Dodaj SMS',{exact:true}).count(),0);
      assert.deepEqual(errors,[],engine.name+' mobile JavaScript errors');
      console.log('[mobile-audit] PASS '+engine.name+' drawer, navigation, company switching, search, bank dialog and mobile invoice draft');
    } finally {await context.close();await publicContext.close();await browser.close();}
  }
  console.log('[mobile-audit] '+checks+' layout checks; '+failures.length+' failing screens');
  assert.deepEqual(failures,[],'All mobile screens and expanded forms must fit the viewport');
}

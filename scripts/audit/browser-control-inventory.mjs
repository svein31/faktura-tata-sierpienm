import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

const observations = [], scenarios = [];
const output = 'artifacts/audit/browser-coverage.json';

export async function recordVisibleControls(page, metadata) {
  const observation = await page.evaluate(() => {
    const selector = 'a,button,input:not([type="hidden"]),textarea,select,summary,[role="button"],[role="tab"],[role="combobox"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="tooltip"],[role="dialog"]';
    const elements = [...document.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[aria-hidden="true"],.sr-only');
    });
    const controls = elements.map((element, index) => {
      const normalized = text => (text || '').replace(/\s+/g,' ').trim().slice(0,180);
      const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent).join(' ');
      const label = normalized(element.getAttribute('aria-label') || labelledBy || [...element.labels || []].map(label=>label.textContent).join(' ') || element.getAttribute('title') || element.textContent || element.getAttribute('placeholder'));
      const disabled = element.matches(':disabled,[aria-disabled="true"]'), inert = !!element.closest('[inert]');
      const states = {action:'unverified',hover:'unverified',focus:'unverified',disabled:disabled?'observed-disabled':'unverified',loading:element.matches('[aria-busy="true"]')?'observed-loading':'unverified',error:'unverified',empty:'unverified',validation:'unverified',refresh:'unverified',back:'unverified'};
      // This verifies programmatic focus, not keyboard reachability or the
      // appearance of the focus ring. Those have a separate keyboard scenario.
      if (!disabled && !inert && element.matches('a[href],button,input,select,textarea,summary,[tabindex]')) {
        const previous = document.activeElement;
        element.focus({preventScroll:true});
        states.focus = document.activeElement === element ? 'checked-programmatic-focus' : 'not-focusable';
        if(previous instanceof HTMLElement)previous.focus({preventScroll:true});
      }
      return {index,tag:element.tagName.toLowerCase(),role:element.getAttribute('role'),label,href:element.getAttribute('href'),type:element.getAttribute('type'),disabled,inert,required:element.hasAttribute('required') || element.getAttribute('aria-required')==='true',invalid:element.getAttribute('aria-invalid'),states};
    });
    return {url:location.pathname,viewport:{width:innerWidth,height:innerHeight},controls};
  });
  observations.push({...metadata,...observation});
  return observation;
}

export function recordBrowserScenario(metadata, name, details={}) {
  scenarios.push({...metadata,name,status:'checked',...details});
}

export async function auditHistoryAndKeyboard(page, publicPage, engine, first='/dashboard', second='/invoices') {
  const metadata={engine,viewport:page.viewportSize()};
  await page.goto(first);await expect(page.locator('main h1').first()).toBeVisible();
  const title=await page.locator('main h1').first().innerText();
  await page.reload();await expect(page.locator('main h1').first()).toHaveText(title);
  recordBrowserScenario(metadata,'authenticated-refresh',{route:first});
  await page.goto(second);await expect(page.locator('main h1').first()).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(new RegExp(first+'(?:[?]|$)'));
  await expect(page.locator('main h1').first()).toHaveText(title);
  await page.goForward();await expect(page).toHaveURL(new RegExp(second+'(?:[?]|$)'));
  await expect(page.locator('main h1').first()).toBeVisible();
  recordBrowserScenario(metadata,'authenticated-back-forward',{routes:[first,second]});
  page=publicPage;
  await page.goto('/login');await expect(page.getByLabel('Adres e-mail')).toBeVisible();
  // Reject optional cookies once; otherwise the intentionally prominent banner
  // can precede the form in the tab order.
  const reject=page.getByRole('button',{name:'Odrzuć opcjonalne',exact:true});if(await reject.isVisible())await reject.click();
  await page.getByLabel('Adres e-mail').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Nie pamiętasz hasła?',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>({tag:document.activeElement?.tagName,type:document.activeElement?.getAttribute('type'),label:document.activeElement?.getAttribute('aria-label')}));
  assert.equal(focused.tag,'INPUT','Email Tab should reach the password input');
  assert.equal(focused.type,'password');
  recordBrowserScenario(metadata,'login-keyboard-tab',{route:'/login'});
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Pokaż hasło',exact:true})).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Hasło',{exact:true})).toHaveAttribute('type','text');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Hasło',{exact:true})).toHaveAttribute('type','password');
  recordBrowserScenario(metadata,'login-password-visibility-keyboard',{route:'/login'});
  await page.getByLabel('Adres e-mail').fill('żółć+qa@example.invalid');
  await page.getByLabel('Hasło',{exact:true}).fill('Zażółć gęślą jaźń <script>');
  await page.getByLabel('Adres e-mail').fill('błędny-adres');
  assert.equal(await page.getByLabel('Adres e-mail').evaluate(element=>element.validity.typeMismatch),true,'Browser email validation should reject malformed input');
  // No submit: this checks native validation, preserves the authenticated fixture
  // and cannot contact real auth/providers.
  recordBrowserScenario(metadata,'login-native-invalid-email',{route:'/login',serverValidation:'covered separately by API tests',submitted:false});
}

export async function auditNegativeAndRecovery(page, publicPage, engine) {
  const metadata={engine,viewport:page.viewportSize()};
  const missing='/qa-audit-definitely-missing-page';
  const response=await publicPage.goto(missing);
  assert.equal(response.status(),404,'Missing route must have an actual HTTP 404');
  await expect(publicPage.getByRole('heading',{name:'Nie znaleźliśmy tej strony',exact:true})).toBeVisible();
  await publicPage.getByRole('link',{name:'Strona główna',exact:true}).click();
  await expect(publicPage).toHaveURL(/\/$/);
  recordBrowserScenario(metadata,'404-recovery-link',{route:missing,statusCode:404});
  const invalid='qa_missing_capability_'.padEnd(48,'x');
  await publicPage.goto('/portal/'+invalid);
  await expect(publicPage.getByRole('heading',{name:'Nie znaleziono dokumentu',exact:true})).toBeVisible();
  recordBrowserScenario(metadata,'invalid-public-document-token',{route:'/portal/[invalid-token]',expectedApiStatus:404});
  await publicPage.goto('/invite/'+invalid);
  await expect(publicPage.getByRole('heading',{name:'Nieprawidłowe zaproszenie',exact:true})).toBeVisible();
  recordBrowserScenario(metadata,'invalid-team-invitation-token',{route:'/invite/[invalid-token]',expectedApiStatus:404});
  // Use a fresh page with a page-scoped interception. Background requests from
  // previous documents must not consume the controlled failure attempts.
  const recoveryPage=await page.context().newPage();
  await recoveryPage.setViewportSize(page.viewportSize());
  const pageErrors=[];recoveryPage.on('pageerror',error=>pageErrors.push(error.message));
  let failures=0;
  const handler=async route=>{
    // Bootstrap automatically retries once before rendering an error. Fail both
    // attempts, then allow the explicit user retry to reach the real test API.
    if(failures++<2)await route.fulfill({status:503,contentType:'application/json',headers:{'x-qa-fixture':'bootstrap-failure'},body:JSON.stringify({error:'Kontrolowany błąd sieciowy testu QA.'})});
    else await route.continue();
  };
  await recoveryPage.route('**/api/data**',handler);
  try {
    await recoveryPage.goto('/settings/companies');
    await expect(recoveryPage.getByRole('heading',{name:'Nie udało się wczytać danych',exact:true})).toBeVisible({timeout:15000});
    await recoveryPage.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();
    await expect(recoveryPage.locator('main h1').first()).toBeVisible();
    await expect(recoveryPage.getByRole('heading',{name:'Nie udało się wczytać danych',exact:true})).toHaveCount(0);
    assert.ok(failures>=3,'User retry must follow both failed automatic attempts');
    assert.deepEqual(pageErrors,[],'Controlled bootstrap failures must not cause unhandled page errors');
    recordBrowserScenario(metadata,'bootstrap-503-error-and-retry',{route:'/settings/companies',expectedApiStatus:503,requests:failures});
  } finally {await recoveryPage.close();}
}

export async function writeBrowserCoverage(extra={}) {
  await mkdir('artifacts/audit',{recursive:true});
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceInventoryIsNotRuntimeVerification:true,scope:'isolated app fixture; conditional unseen controls and unclicked actions remain unverified',...extra,totals:{observations:observations.length,visibleControlInstances:observations.reduce((count,observation)=>count+observation.controls.length,0),checkedScenarios:scenarios.length},observations,scenarios};
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  const summary={schemaVersion:1,generatedAt:report.generatedAt,scope:report.scope,...extra,totals:report.totals,visited:observations.map(({engine,scenario,url,viewport,layoutStatus,controls})=>({engine,scenario,url,viewport,layoutStatus,visibleControlInstances:controls.length})),scenarios};
  await writeFile('artifacts/audit/browser-coverage-summary.json',JSON.stringify(summary,null,2)+'\n');
  return report.totals;
}

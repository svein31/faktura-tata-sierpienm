import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mobileLayoutDefects } from './mobile-audit.mjs';
export async function auditFeatureControls(page, context, db, fixture) {
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const originalViewport=page.viewportSize(),errors=[],checks=[];
  const listener=error=>errors.push(error.message);
  page.on('pageerror',listener);
  async function diagnosticWithin(promise, fallback) {
    let timer;
    try { return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),2000);})]); }
    catch { return fallback; }
    finally { clearTimeout(timer); }
  }
  async function checkPhoneDialog(label) {
    const defects=await mobileLayoutDefects(page);
    assert.deepEqual(defects,[],label+' must fit the phone viewport');
  }
  const field=(root,label)=>root.locator('label').filter({hasText:label}).first().locator('..').locator('input').first();
  async function submit(button,endpoint) {
    console.log('[feature-controls-stage] submit '+endpoint);
    let timer,stage='response and click';
    const task=(async()=>{
      const [response]=await Promise.all([
        page.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&['POST','PUT','PATCH'].includes(response.request().method()),{timeout:15000}),
        button.click({timeout:15000}),
      ]);
      console.log('[feature-controls-stage] response '+endpoint+' '+response.status());
      stage='response body';
      const body=await response.json();
      assert.ok(response.ok(),endpoint+': '+JSON.stringify(body));
      console.log('[feature-controls-stage] body '+endpoint);
      return body;
    })();
    try { return await Promise.race([task,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Timed out during '+stage+' for '+endpoint)),30000);
    })]); }
    finally { clearTimeout(timer); }
  }
  try {
    await page.setViewportSize({width:390,height:844});
    // The preceding recovery test leaves a populated draft in the creator.
    await page.locator('#invoice-contractorId').click();
    await page.getByRole('option',{name:/Searchable Buyer/}).click();
    await page.getByRole('textbox',{name:'Nazwa pozycji 1',exact:true}).fill('UI fractional quantity');
    await page.getByRole('spinbutton',{name:'Ilość pozycji 1',exact:true}).fill('0.004');
    await page.getByRole('spinbutton',{name:'Cena netto pozycji 1',exact:true}).fill('1000');
    const fractional=await submit(page.getByRole('button',{name:'Szkic',exact:true}),'/api/invoices');
    assert.equal(fractional.invoice.lines[0].quantity,0.004);assert.equal(fractional.invoice.totalNet,4);
    await expect(page).toHaveURL(/invoices$/);checks.push('Invoice creator preserves fractional quantity');
    await page.goto('/invoices/' + fractional.invoice.id);
    await page.getByRole('button',{name:'Edytuj',exact:true}).click();
    await expect(page).toHaveURL(/invoices\/new$/);
    const beforeIssue = await db.invoice.findUniqueOrThrow({where:{id:fractional.invoice.id}});
    await page.getByRole('button',{name:/^Zapisz fakturę/}).first().click();
    let assistant = page.getByRole('dialog');
    await expect(assistant.getByRole('heading',{name:'Asystent przed wysyłką faktury',exact:true})).toBeVisible();
    await checkPhoneDialog('Invoice preflight assistant');
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:fractional.invoice.id}})).version,beforeIssue.version,'Preflight does not save the document');
    await assistant.getByRole('button',{name:'Wróć do edycji',exact:true}).click();
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:fractional.invoice.id}})).status,'draft');
    await page.getByRole('button',{name:/^Zapisz fakturę/}).first().click();
    assistant = page.getByRole('dialog');
    await submit(assistant.getByRole('button',{name:'Zatwierdzam i kontynuuję',exact:true}),'/api/invoices/'+fractional.invoice.id);
    await expect(page).toHaveURL(/invoices$/);
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:fractional.invoice.id}})).status,'issued');
    checks.push('Phone invoice assistant cancel, no side effects and explicit issue confirmation');

    await page.setViewportSize({width:1280,height:900});
    await page.goto('/narzedzia/kalkulator-vat');
    await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');
    const vatCalculator=page.getByRole('heading',{name:'Oblicz kwoty',exact:true}).locator('..');
    await page.getByLabel('Kwota w PLN').fill('100');
    await expect(vatCalculator.getByRole('status')).toContainText('123,00');
    await page.getByLabel('Kwota w PLN').fill('abc');await expect(vatCalculator.getByRole('alert')).toContainText('Popraw format');
    await page.getByLabel('Kwota w PLN').fill('100,01');
    const direction=vatCalculator.locator('label').filter({hasText:'Rodzaj kwoty'}).getByRole('combobox');
    await direction.click();await page.getByRole('option',{name:'Brutto',exact:true}).click();
    await expect(direction).toHaveText('Brutto');
    await expect(vatCalculator.getByRole('status')).toContainText('81,31');checks.push('VAT calculator directions and invalid input');
    await page.goto('/narzedzia/limit-ksef');
    await page.waitForFunction(()=>document.documentElement.dataset.uiReady==='true');
    await page.getByLabel('Suma wcześniejszych faktur brutto w tym miesiącu').fill('8000');
    await page.getByLabel('Nowa faktura brutto').fill('2000');
    await page.getByRole('combobox').click();await page.getByRole('option',{name:'Nie',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('nie przekracza jeszcze');
    await page.getByLabel('Nowa faktura brutto').fill('2000,01');
    await expect(page.getByRole('status')).toContainText('wymaga KSeF');
    await page.getByRole('combobox').click();await page.getByRole('option',{name:'Tak, w tym lub wcześniejszym miesiącu',exact:true}).click();
    await page.getByLabel('Suma wcześniejszych faktur brutto w tym miesiącu').fill('0');
    await page.getByLabel('Nowa faktura brutto').fill('1');
    await expect(page.getByRole('status')).toContainText('nie przywraca wyjątku');checks.push('KSeF exact threshold, crossing and earlier crossing');
    await page.setViewportSize({width:390,height:844});
    await page.goto('/products');
    await page.getByRole('button',{name:'Dodaj pozycję',exact:true}).first().click();
    let dialog=page.getByRole('dialog');
    await dialog.getByPlaceholder('np. Usługa programistyczna (osobodzień)').fill('UI audited product');
    await field(dialog,'Cena netto (PLN)').fill('100');
    await checkPhoneDialog('Product creation');
    const product=await submit(dialog.getByRole('button',{name:'Dodaj',exact:true}),'/api/products');
    assert.equal(product.product.companyId,fixture.companyId);
    await expect(dialog).toHaveCount(0);
    const productName=page.getByRole('table').getByText('UI audited product',{exact:true});
    // AnimatePresence briefly keeps both optimistic and persisted rows in the DOM.
    await expect(productName).toHaveCount(1);
    await expect(productName).toBeVisible();
    const row=page.locator('tr').filter({hasText:'UI audited product'});
    await row.getByTitle('Edytuj',{exact:true}).click();dialog=page.getByRole('dialog');
    await field(dialog,'Cena netto (PLN)').fill('125');
    await checkPhoneDialog('Product editing');
    await submit(dialog.getByRole('button',{name:'Zapisz zmiany',exact:true}),'/api/products/'+product.product.id);
    assert.equal((await db.product.findUniqueOrThrow({where:{id:product.product.id}})).netPrice,125);
    checks.push('Product create and edit through UI');
    console.log('[feature-controls-stage] open expense form');
    await page.goto('/expenses');await page.getByRole('button',{name:'Dodaj koszt',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByPlaceholder('np. Adobe Systems, PKN Orlen').fill('UI audited supplier');
    await dialog.getByPlaceholder('np. FV/2026/03/4821').fill('UI/AUDIT/COST');
    await dialog.getByPlaceholder('0.00').fill('123');
    const validity=await dialog.locator('form').evaluate(form=>({valid:form.checkValidity(),invalid:Array.from(form.querySelectorAll('input')).filter(input=>!input.validity.valid).map(input=>({placeholder:input.placeholder,message:input.validationMessage}))}));
    console.log('[feature-controls-stage] expense form validity '+JSON.stringify(validity));
    assert.ok(validity.valid,JSON.stringify(validity));
    await checkPhoneDialog('Expense creation');
    const expense=await submit(dialog.getByRole('button',{name:'Zapisz koszt',exact:true}),'/api/expenses');
    assert.equal(expense.expense.totalGross,123);assert.equal(expense.expense.totalNet,100);
    assert.equal(await db.expense.count({where:{companyId:fixture.companyId,number:'UI/AUDIT/COST'}}),1,'One UI submission creates exactly one expense');
    await expect(page.getByText('UI/AUDIT/COST',{exact:true}).first()).toBeVisible();
    await submit(page.getByTitle('Kliknij, aby przełączyć status płatności').first(),'/api/expenses/'+expense.expense.id);
    assert.equal((await db.expense.findUniqueOrThrow({where:{id:expense.expense.id}})).paymentStatus,'paid');
    const expenseRow=page.locator('tr').filter({hasText:'UI/AUDIT/COST'});
    await expect(expenseRow.getByTitle('Kliknij, aby przełączyć status płatności')).toHaveText('Opłacone');
    const downloadPromise=page.waitForEvent('download',{timeout:15000});await page.getByRole('button',{name:'Eksportuj CSV',exact:true}).click();
    const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.csv$/);
    checks.push('Expense save, payment toggle and CSV download');
    await page.goto('/orders');await page.getByRole('button',{name:'Nowe zlecenie',exact:true}).click();dialog=page.getByRole('dialog');
    await field(dialog,'Tytuł zlecenia').fill('UI audited order');
    await field(dialog,'Numer zlecenia').fill('UI/AUDIT/ORDER');
    await field(dialog,'Wycena brutto').fill('123');
    await checkPhoneDialog('Order creation');
    const order=await submit(dialog.getByRole('button',{name:'Utwórz zlecenie',exact:true}),'/api/orders');
    assert.equal(order.order.companyId,fixture.companyId);
    await expect(page.getByText('UI audited order',{exact:true})).toBeVisible();
    await page.getByTitle('Zaloguj czas pracy',{exact:true}).first().click();dialog=page.getByRole('dialog');
    await field(dialog,'Liczba godzin do dodania').fill('0.5');
    await checkPhoneDialog('Order time logging');
    await submit(dialog.getByRole('button',{name:'Zapisz czas',exact:true}),'/api/orders/'+order.order.id);
    assert.equal((await db.order.findUniqueOrThrow({where:{id:order.order.id}})).trackedMinutes,30);
    // Failed requests must show their message and keep the user's time-entry dialog.
    await page.getByTitle('Zaloguj czas pracy',{exact:true}).first().click();
    const intercept='**/api/orders/'+order.order.id;
    await context.route(intercept,route=>route.request().method()==='PATCH'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Audit conflict: refresh data'})}):route.continue());
    await page.getByRole('dialog').getByRole('button',{name:'Zapisz czas',exact:true}).click();
    await expect(page.getByText('Audit conflict: refresh data',{exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();await context.unroute(intercept);
    await page.getByRole('dialog').getByRole('button',{name:'Anuluj',exact:true}).click();
    const invoice=await submit(page.getByTitle('Wystaw fakturę ze zlecenia',{exact:true}).first(),'/api/orders/'+order.order.id+'/convert');
    await expect(page).toHaveURL(new RegExp('/invoices/'+invoice.invoice.id+'$'));
    assert.equal((await db.order.findUniqueOrThrow({where:{id:order.order.id}})).status,'billed');
    checks.push('Order create, fractional time, failed save recovery and invoice conversion');
    await page.goto('/offers');await page.getByRole('button',{name:'Nowa oferta',exact:true}).click();dialog=page.getByRole('dialog');
    await field(dialog,'Numer oferty').fill('UI/AUDIT/OFFER');
    await dialog.getByPlaceholder('np. Wdrożenie sklepu internetowego i integracja z ERP').fill('UI audited offer');
    await dialog.getByPlaceholder('Nazwa usługi / materiału').first().fill('UI offer service');
    await dialog.getByPlaceholder('Cena netto').first().fill('100');
    await checkPhoneDialog('Offer creation');
    const offer=await submit(dialog.getByRole('button',{name:'Zapisz i wygeneruj ofertę',exact:true}),'/api/offers');
    assert.equal(offer.offer.totalGross,123);await expect(page.getByRole('table').getByText('UI/AUDIT/OFFER',{exact:true})).toBeVisible();
    checks.push('Offer creation through UI');
    const bankTarget = await db.bankTransaction.create({data:{userId:beforeIssue.userId,accountId:fixture.companyId,externalId:'ui-manual-bank-target',bookingDate:beforeIssue.issueDate,amount:beforeIssue.totalGross,currency:beforeIssue.currency,direction:'in',description:'UI audited bank receipt'}});
    await db.bankTransaction.createMany({data:Array.from({length:31},(_,i)=>({userId:beforeIssue.userId,accountId:fixture.companyId,externalId:'ui-bank-pagination-'+i,bookingDate:beforeIssue.issueDate,amount:1,currency:'PLN',direction:'in',description:'UI pagination '+i}))});
    await page.goto('/finances?transactionId='+bankTarget.id);
    dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Rozlicz transakcję bankową',exact:true})).toBeVisible();
    await dialog.getByLabel('Dokument',{exact:true}).click();
    await page.getByRole('option').filter({hasText:fractional.invoice.number}).click();
    await checkPhoneDialog('Bank transaction matching beyond first page');
    page.once('dialog',d=>d.accept());
    await submit(dialog.getByRole('button',{name:'Przypisz i zapisz płatność',exact:true}),'/api/banking/transactions');
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:fractional.invoice.id}})).paymentStatus,'paid');
    assert.equal(await db.paymentRecord.count({where:{invoiceId:fractional.invoice.id}}),1);
    checks.push('Phone bank deep link beyond pagination and exactly one manual payment');
    await page.goto('/accountant');
    await expect(page.getByRole('progressbar',{name:'Postęp kontroli miesiąca'})).toBeVisible();
    await expect(page.getByRole('link',{name:'Sprawdź skrzynkę dokumentów →'})).toBeVisible();
    await checkPhoneDialog('Accountant readiness checklist');
    checks.push('Phone accountant month readiness and source links');
    assert.deepEqual(errors,[],'Functional UI journeys must not raise unhandled JavaScript errors');
    console.log('[feature-controls-summary] '+JSON.stringify({checks:checks.length,scenarios:checks,errors}));
  } catch(error) {
    console.log('[feature-controls-error] '+JSON.stringify({checks,error:error.stack||error.message}));
    const diagnostic=await diagnosticWithin(page.evaluate(()=>({
      url:location.pathname,
      headings:Array.from(document.querySelectorAll('h1,h2')).map(el=>el.textContent),
      dialogs:Array.from(document.querySelectorAll('[role="dialog"]')).map(el=>({
        title:el.querySelector('h2')?.textContent,
        buttons:Array.from(el.querySelectorAll('button')).map(button=>({text:button.textContent,disabled:button.disabled,type:button.type})),
        inputs:Array.from(el.querySelectorAll('input')).map(input=>({placeholder:input.placeholder,type:input.type,valid:input.validity.valid,message:input.validationMessage})),
      })),
    })),{unavailable:true});
    console.log('[feature-controls-failure] '+JSON.stringify({checks,error:error.message,diagnostic}));
    throw error;
  } finally {
    page.off('pageerror',listener);
    await diagnosticWithin(page.setViewportSize(originalViewport),null);
  }
}

import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);require('../register-ts.cjs');
const {catalogWorkbook:spreadsheet}=require('../fixtures/catalog-workbook.cjs');

export async function auditCatalogAccountingBrowser({page,context,base,db,companyId,out,expect,engine}) {
  const company=await db.companyProfile.findUniqueOrThrow({where:{id:companyId}}),checks=[],violations=[],errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.log('[catalog-ui-pageerror]',page.url(),error.message);});
  const record=message=>{checks.push(message);console.log('[catalog-accounting-ui:'+engine+'] PASS',message);};
  const scan=async name=>{
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);
    // Inspect the settled UI: WebKit can start a modal's fade after its visible assertion.
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="dialog"]')).every(dialog=>getComputedStyle(dialog).opacity==='1'&&dialog.getAnimations({subtree:true}).every(animation=>animation.playState==='finished'||animation.playState==='idle'||animation.effect?.getTiming().iterations===Infinity)),{},{timeout:5000});
    await page.addScriptTag({path:'/workspace/.cache/faktura-runtime/a11y/node_modules/axe-core/axe.min.js'});
    const result=await page.evaluate(async()=>{await document.fonts.ready;return (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations;});
    if(result.length)violations.push({name,result});
    await writeFile(`${out}/${engine}-partial-scans.json`,JSON.stringify({checks,violations,errors},null,2));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no horizontal page overflow');
    await page.screenshot({path:`${out}/${engine}-${name}.png`,fullPage:true});
  };
  const choose=async(control,label)=>{await control.click();await page.getByRole('option',{name:label,exact:true}).click();};
  const cost=await db.expense.create({data:{userId:company.userId,companyId,number:'COST/UI/ORIGINAL',contractorName:'Example supplier',issueDate:'2026-01-05',totalNet:10,totalVat:2.3,totalGross:12.3,workflowStatus:'verified'}});
  const original=Buffer.from('%PDF-1.4 synthetic UI original'),source=await db.expenseScan.create({data:{userId:company.userId,companyId,expenseId:cost.id,status:'converted',safetyStatus:'clean',fileName:'original.pdf',mimeType:'application/pdf',sizeBytes:original.length,sha256:createHash('sha256').update(original).digest('hex'),imageData:'data:application/pdf;base64,'+original.toString('base64')}});
  await db.expense.update({where:{id:cost.id},data:{scanId:source.id}});
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});await page.addInitScript(theme=>localStorage.setItem('fakturaprosto-theme',theme),width===390?'dark':'light');
    await page.goto(base+'/products',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Produkty / Usługi',exact:true})).toBeVisible();
    const importer=page.locator('[data-catalog-import="products"]');await importer.locator('summary').first().click();
    const workbook=spreadsheet([['Nazwa','SKU','Cena netto','VAT','Waluta'],[`Konsultacja ${width}`,`UI-${width}`,'125,50','23%','PLN'],['Duplikat',`ui-${width}`,'90,00','8','PLN'],['Błędna cena',`BAD-${width}`,'15abc','23','PLN']]);
    await importer.getByLabel('Plik importu produktów i usług',{exact:true}).setInputFiles({name:'kartoteka.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook});
    await expect(importer).toContainText('3 wierszy danych');await importer.getByRole('button',{name:'Sprawdź import',exact:true}).click();
    await expect(importer.getByRole('region',{name:'Wynik sprawdzenia importu'})).toContainText('Gotowe do dodania: 1');
    await expect(importer).toContainText('Duplikaty: 1');await expect(importer).toContainText('Błędy: 1');
    assert.equal(await db.product.count({where:{companyId,sku:`UI-${width}`}}),0);
    await scan('product-preview-'+width);
    const mapping=importer.getByRole('combobox',{name:/Cena netto/});await choose(mapping,'2. SKU');
    await expect(importer.getByRole('region',{name:'Wynik sprawdzenia importu'})).toHaveCount(0);await expect(importer).toContainText('Jedna kolumna może być przypisana tylko do jednego pola.');
    await choose(mapping,'3. Cena netto');await importer.getByRole('button',{name:'Sprawdź import',exact:true}).click();await expect(importer).toContainText('Gotowe do dodania: 1');
    await importer.getByRole('button',{name:'Importuj pozycje (1)',exact:true}).click();await expect(importer).toContainText('Dodano: 1');
    const saved=await db.product.findFirstOrThrow({where:{companyId,sku:`UI-${width}`}});assert.equal(saved.netPrice,125.5);assert.equal(saved.vatRate,'23');
    await expect(page.locator('table').last().getByRole('cell',{name:`Konsultacja ${width}`,exact:true})).toBeVisible();
    const download=page.waitForEvent('download');await importer.getByRole('button',{name:'Pobierz raport CSV',exact:true}).click();assert.equal((await download).suggestedFilename(),'raport-products.csv');
    record(width+'px Excel mapping, preview without writes, invalidation after mapping change, duplicate/error report, exact saved price and downloadable CSV report');

    await page.goto(base+'/accountant?month=2026-01',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'Miesiąc do rozliczenia · 2026-01',exact:true})).toBeVisible();
    const tasks=page.locator('#monthly-tasks');await expect(tasks.getByLabel('Zadanie lub dokument',{exact:true})).toBeEnabled();
    await tasks.getByLabel('Zadanie lub dokument',{exact:true}).fill('Brak wyciągu '+width);await choose(tasks.getByRole('combobox',{name:/Rodzaj/}),'Brakujący dokument');await tasks.getByRole('button',{name:'Dodaj',exact:true}).click();
    const article=tasks.locator('article').filter({hasText:'Brak wyciągu '+width});await expect(article).toBeVisible();await expect(article.getByRole('button',{name:'Notatka',exact:true})).toBeEnabled();
    await article.getByRole('button',{name:'Notatka',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Notatka do zadania',exact:true});await expect(dialog).toBeVisible();await dialog.getByLabel('Treść notatki',{exact:true}).fill('Potrzebny wyciąg za styczeń.');await scan('task-note-'+width);await dialog.getByRole('button',{name:'Zapisz notatkę',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(article).toContainText('Potrzebny wyciąg za styczeń.');
    await expect(article.getByRole('combobox',{name:/Osoba odpowiedzialna/})).toBeEnabled();const owner=await db.user.findUniqueOrThrow({where:{id:company.userId}});await choose(article.getByRole('combobox',{name:/Osoba odpowiedzialna/}),owner.name);
    await choose(tasks.getByRole('combobox',{name:'Filtr zadań miesiąca'}),'Przypisane do mnie');await expect(article).toBeVisible();await scan('month-workspace-'+width);
    await expect(article.getByRole('checkbox')).toBeEnabled();await article.getByRole('checkbox').click();await expect(article).toHaveCount(0);
    await expect.poll(async()=>{const workspace=await db.accountingWorkspace.findFirst({where:{companyId,month:'2026-01'}});return workspace?.items.some(item=>item.title==='Brak wyciągu '+width&&item.done);}).toBe(true);
    await choose(tasks.getByRole('combobox',{name:'Filtr zadań miesiąca'}),'Wszystkie');await expect(article.getByRole('checkbox')).toBeChecked();await expect(article.getByRole('button',{name:'Usuń',exact:true})).toBeEnabled();await article.getByRole('button',{name:'Usuń',exact:true}).click();dialog=page.getByRole('dialog',{name:'Usunąć zadanie?',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Anuluj',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(article).toBeVisible();
    record(width+'px shared missing-document task, note dialog, owner assignment, personal filter, completion and non-destructive delete cancellation');
    const packageDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Pobierz paczkę miesiąca →',exact:true}).click();const packageFile=await packageDownload;assert.ok(packageFile.suggestedFilename().includes('2026-01'));await packageFile.saveAs(`${out}/${engine}-month-${width}.zip`);const packageBytes=await readFile(`${out}/${engine}-month-${width}.zip`);assert.ok(packageBytes.includes(original));assert.ok(packageBytes.includes(Buffer.from('zawartosc-paczki.csv')));
    await page.getByRole('link',{name:'Otwórz pulpit księgowy →',exact:true}).click();await expect(page.getByRole('heading',{name:'Pulpit księgowy',exact:true})).toBeVisible();await expect(page.getByLabel('Miesiąc',{exact:true})).toHaveValue('2026-01');await scan('accountant-portal-'+width);
    record(width+'px month ZIP downloads successfully and the selected month persists into the accountant portal');
  }
  await page.goto(base+'/contractors',{waitUntil:'domcontentloaded'});const contacts=page.locator('[data-catalog-import="contractors"]');await contacts.locator('summary').first().click();
  await contacts.getByLabel('Plik importu kontrahentów',{exact:true}).setInputFiles({name:'kontrahenci.csv',mimeType:'text/csv',buffer:Buffer.from('Nazwa;NIP;Miasto\r\nNowy kontrahent;1234563218;Poznań\r\nPowtórzony;1234563218;Poznań\r\nZły NIP;123;Warszawa')});
  await contacts.getByRole('button',{name:'Sprawdź import',exact:true}).click();await expect(contacts).toContainText('Gotowe do dodania: 1');await expect(contacts).toContainText('Duplikaty: 1');await expect(contacts).toContainText('Błędy: 1');await scan('contractor-preview-mobile');await contacts.getByRole('button',{name:'Importuj kontrahentów (1)',exact:true}).click();await expect(contacts).toContainText('Dodano: 1');
  assert.equal(await db.contractor.count({where:{companyId,nip:'1234563218'}}),1);record('CSV contractor import shares the same preview/report flow and writes only the valid unique contact');
  const second=await db.companyProfile.create({data:{userId:company.userId,nip:'5250001003',companyName:'Import scope B',isDefault:false}});await context.addInitScript(({userId,companyId})=>{for(const key of ['guide-seen','banner-dismissed'])localStorage.setItem(`fakturo_onboarding_v3:${key}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`,'true');},{userId:company.userId,companyId:second.id});
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Wybierz firmę:/}).click();await page.getByRole('menu',{name:'Twoje firmy i zespoły',exact:true}).getByRole('menuitem').filter({hasText:second.companyName}).click();
  const fresh=page.locator('[data-catalog-import="contractors"]');await fresh.locator('summary').first().click();await expect(fresh.getByRole('region',{name:'Wynik sprawdzenia importu'})).toHaveCount(0);await expect(fresh).toContainText('Import scope B');assert.equal(await db.contractor.count({where:{companyId:second.id}}),0);record('Company switch clears file, mapping and preview instead of importing the previous company data');
  await context.addInitScript(({userId,companyId})=>{localStorage.removeItem(`fakturo_onboarding_v3:banner-dismissed:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`);},{userId:company.userId,companyId:second.id});
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  let release;const held=new Promise(resolve=>release=resolve);
  const holdOverview=async route=>{if(new URL(route.request().url()).searchParams.get('companyId')===second.id)await held;return route.continue();};
  await context.route('**/api/overview?**',holdOverview);
  try {
    await page.getByRole('button',{name:/Wybierz firmę:/}).click();await page.getByRole('menu',{name:'Twoje firmy i zespoły',exact:true}).getByRole('menuitem').filter({hasText:second.companyName}).click();
    const fallback=page.locator('.ui-loading-reveal[data-loading="true"]');await expect(fallback).toBeVisible();await fallback.evaluate(element=>element.dataset.qaHeldOverview='true');
    await page.setViewportSize({width:430,height:950});await scan('held-overview-resize');const height=await fallback.evaluate(element=>element.getBoundingClientRect().height);assert.ok(height>0);
    const reveal=page.locator('[data-qa-held-overview="true"]');release();await expect(reveal).toHaveAttribute('data-loading','false');await page.waitForTimeout(220);
    assert.ok(await reveal.evaluate(element=>element.getBoundingClientRect().height)>=height-1,'Loaded content preserves the reserved skeleton height');
    record('Held overview response and viewport resize preserve skeleton space before the data transition, without observer errors');
  } finally {release();await context.unroute('**/api/overview?**',holdOverview);}
  await expect(page.getByRole('heading',{name:'Twój pierwszy dokument, krok po kroku',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Otwórz kreator',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pokaż przewodnik',exact:true}).click();await expect(page.getByRole('dialog',{name:'Pierwsze kroki',exact:true})).toBeVisible();await scan('existing-first-invoice-guide');await page.keyboard.press('Escape');record('Existing first-document onboarding remains available for a new company; no duplicate wizard was added');
  await writeFile(`${out}/${engine}-catalog-accounting.json`,JSON.stringify({checks,violations,errors},null,2));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
}

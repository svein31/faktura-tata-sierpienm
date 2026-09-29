import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
export async function browserChecks(base) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function post(path, data) {
    const response = await context.request.post(path, { data }); const body = await response.json();
    assert.ok(response.ok(), `${path}: ${JSON.stringify(body)}`); return body;
  }
  try {
    await context.addInitScript(() => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); });
    // Public pages must fit a phone viewport without horizontal page scrolling.
    const publicContext = await browser.newContext({
      baseURL: base, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
    });
    const publicPage = await publicContext.newPage(), publicErrors = [];
    publicPage.on('pageerror', error => publicErrors.push(error.message));
    try {
      for (const route of ['/', '/login', '/register', '/demo']) {
        await publicPage.goto(route);
        await expect(publicPage.locator('h1')).toBeVisible();
        assert.ok(
          await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `Public mobile overflow: ${route}`,
        );
      }
      await publicPage.goto('/');
      await publicPage.getByRole('link', { name: /Zobacz funkcje/ }).click();
      await expect(publicPage.locator('#funkcje')).toBeInViewport();
      assert.deepEqual(publicErrors, [], 'Public mobile pages must not report JavaScript errors');
    } finally { await publicContext.close(); }
    await post('/api/auth/register', { name: 'Browser owner', email: 'browser@example.com', password: 'BrowserTest123!', acceptTerms: true });
    // A fresh phone browser should complete password login and reach the protected app.
    const loginContext = await browser.newContext({
      baseURL: base, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    await loginContext.addInitScript(() => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); });
    const loginPage = await loginContext.newPage(), loginErrors = [];
    loginPage.on('pageerror', error => loginErrors.push(error.message));
    try {
      await loginPage.goto('/login');
      await loginPage.getByRole('button', { name: 'Odrzuć opcjonalne' }).click();
      await loginPage.getByLabel('Adres e-mail').fill('browser@example.com');
      await loginPage.getByLabel('Hasło', { exact: true }).fill('BrowserTest123!');
      await loginPage.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
      await expect(loginPage).toHaveURL(new RegExp('/dashboard(?:[?]|$)'));
      await expect(loginPage.locator('main')).toBeVisible();
      assert.ok(
        await loginPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Authenticated mobile dashboard overflow',
      );
      assert.deepEqual(loginErrors, [], 'Mobile login must not report JavaScript errors');
    } finally { await loginContext.close(); }
    const company = (await post('/api/companies', { companyName: 'Browser Company', nip: '5260301706' })).company;
    const contractor = (await post('/api/contractors', { companyId: company.id, name: 'Searchable Buyer', nip: '5250001003' })).contractor;
    for (let n = 1; n <= 32; n++) await post('/api/invoices', {
      number: `BROWSER/${String(n).padStart(3,'0')}`, type: 'sale', status: 'draft', sellerCompanyId: company.id, contractorId: contractor.id,
      issueDate: '2026-09-22', saleDate: '2026-09-22', dueDate: '2026-09-29', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 7,
      lines: [{ id: 'line', name: 'Browser service', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }],
    });
    // HTTP assertions cover cardinality, stable paging, search and archive scoping.
    const get = async url => { const r = await context.request.get(url); assert.ok(r.ok()); return r.json(); };
    const first = await get(`/api/invoices/search?companyId=${company.id}`);
    assert.equal(first.total, 32); assert.equal(first.invoices.length, 30);
    const second = await get(`/api/invoices/search?companyId=${company.id}&cursor=${first.nextCursor}`);
    assert.equal(second.invoices.length, 2); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.invoices, ...second.invoices].map(i => i.id)).size, 32);
    assert.equal((await get(`/api/invoices/search?companyId=${company.id}&search=Searchable`)).total, 32);
    assert.equal((await get(`/api/invoices/search?companyId=${company.id}&search=%5B`)).total, 0);
    assert.equal((await get('/api/data?invoiceMode=list')).invoices.length, 0);
    const overview = await get(`/api/overview?companyId=${company.id}`);
    assert.equal(overview.counts.drafts, 32);
    assert.equal(overview.actionTotal, 32);
    assert.equal(overview.actions.length, 8);
    assert.equal(overview.totals.length, 0);
    const issued = await post('/api/invoices', {
      number: 'BROWSER/ISSUED', type: 'sale', status: 'issued', sellerCompanyId: company.id, contractorId: contractor.id,
      issueDate: '2026-09-22', saleDate: '2026-09-22', dueDate: '2026-09-29', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 7,
      lines: [{ id: 'line', name: 'Browser service', quantity: 2, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }],
    });
    const issuedOverview = await get(`/api/overview?companyId=${company.id}&months=12`);
    assert.equal(issuedOverview.totals.find(row => row.currency === 'PLN')?.gross, 246);
    assert.equal(issuedOverview.months.length, 12);
    assert.equal(issuedOverview.months.at(-1).values[0].gross, 246);
    assert.equal(issuedOverview.counts.drafts, 32);
    const changed = await context.request.put(`/api/invoices/${issued.invoice.id}`, { data: {
      number: 'BROWSER/ISSUED', type: 'sale', status: 'issued', sellerCompanyId: company.id, contractorId: contractor.id,
      issueDate: '2026-09-22', saleDate: '2026-09-22', dueDate: '2026-09-29', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 7,
      lines: [{ id: 'line', name: 'Browser service', quantity: 3, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }],
    } });
    assert.ok(changed.ok(), JSON.stringify(await changed.json()));
    assert.equal((await get(`/api/overview?companyId=${company.id}&months=12`)).totals[0].gross, 369);
    assert.equal((await context.request.get(`/api/overview?companyId=${company.id}&months=7`)).status(), 400);
    const center = await get(`/api/ksef/center?companyId=${company.id}`);
    assert.equal(center.certificate.notice, 'missing');
    assert.equal(center.tasks.length, 0);
    assert.ok(['AVAILABLE', 'MAINTENANCE', 'FAILURE', 'TOTAL_FAILURE', 'UNAVAILABLE'].includes(center.official.status));
    assert.equal((await context.request.post('/api/ksef/center', { data: { companyId: company.id, action: 'upload', certificateBase64: 'invalid' } })).status(), 400);
    assert.equal((await context.request.get('/api/ksef/center?companyId=000000000000000000000000')).status(), 403);
    const inaccessible = await context.request.get('/api/overview?companyId=000000000000000000000000');
    assert.equal(inaccessible.status(), 403);
    const importRows = [
      { name: 'CSV supplier', nip: '1234563218', street: 'Main 1', city: 'Poznań', postal: '60-001', email: '', phone: '' },
      { name: 'CSV repeat', nip: '1234563218', street: '', city: '', postal: '', email: '', phone: '' },
      { name: 'Existing buyer', nip: '5250001003', street: '', city: '', postal: '', email: '', phone: '' },
      { name: 'Bad NIP', nip: '123', street: '', city: '', postal: '', email: '', phone: '' },
    ];
    const importPreview = await post('/api/contractors/import', { companyId: company.id, action: 'preview', rows: importRows });
    assert.deepEqual([importPreview.ready, importPreview.duplicate, importPreview.invalid], [1, 2, 1]);
    assert.equal((await post('/api/contractors/import', { companyId: company.id, action: 'import', rows: importRows })).created, 1);
    assert.equal((await post('/api/contractors/import', { companyId: company.id, action: 'import', rows: importRows })).created, 0);
    assert.equal((await context.request.post('/api/contractors/import', { data: { companyId: '000000000000000000000000', action: 'import', rows: importRows } })).status(), 403);
    const currentInvoice = (await get(`/api/invoices/${issued.invoice.id}`)).invoice;
    const drafts = first.invoices[0];
    const paymentBatch = { companyId: company.id, invoices: [{ id: currentInvoice.id, version: currentInvoice.version }, { id: drafts.id, version: drafts.version }] };
    assert.equal((await context.request.post('/api/invoices/bulk/pay', { data: paymentBatch })).status(), 409);
    assert.equal((await get(`/api/invoices/${currentInvoice.id}/payments`)).payments.length, 0);
    assert.equal((await context.request.post('/api/invoices/bulk/pay', { data: { ...paymentBatch, companyId: '000000000000000000000000' } })).status(), 403);
    assert.equal((await post('/api/invoices/bulk/pay', { companyId: company.id, invoices: [paymentBatch.invoices[0]] })).count, 1);
    const paid = await get(`/api/invoices/${currentInvoice.id}`);
    assert.equal(paid.invoice.paymentStatus, 'paid');
    assert.equal((await get(`/api/invoices/${currentInvoice.id}/payments`)).payments[0].amount, 369);
    assert.equal((await context.request.post('/api/invoices/bulk/pay', { data: { companyId: company.id, invoices: [paymentBatch.invoices[0]] } })).status(), 409);
    await page.goto('/invoices');
    await expect(page.getByRole('heading', { name: 'Faktury', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Odrzuć opcjonalne' }).click();
    const dismiss = page.getByRole('button', { name: /Pomiń|Rozumiem|Zakończ/ });
    if (await dismiss.count()) await dismiss.first().click();
    await page.goto('/contractors');
    await page.locator('summary').filter({ hasText: 'Importuj kontrahentów z CSV' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'kontrahenci.csv', mimeType: 'text/csv', buffer: Buffer.from('Nazwa;NIP;Miasto\nNowy CSV;5260301706;Poznań\n') });
    await page.getByRole('button', { name: 'Sprawdź import' }).click();
    await expect(page.getByRole('button', { name: 'Importuj 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Importuj 1' }).click();
    await expect(page.getByText('Nowy CSV').first()).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Do załatwienia' })).toBeVisible();
    await expect(page.getByText('BROWSER/001').first()).toBeVisible();
    await page.goto('/analytics');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Analityka' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Okres wykresu' }).click();
    await page.getByRole('option', { name: '12 miesięcy', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Okres wykresu' })).toHaveText('12 miesięcy');
    await page.goto('/ksef');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Stan KSeF' })).toBeVisible();
    await page.goto('/invoices');
    await expect(page.getByText(/Strona 1 · 33 wyniki/)).toBeVisible();
    await page.getByRole('button', { name: 'Następna', exact: true }).click();
    await expect(page.getByText(/Strona 2 · 33 wyniki/)).toBeVisible();
    await page.getByRole('button', { name: 'Poprzednia', exact: true }).click();
    await expect(page.getByText(/Strona 1 · 33 wyniki/)).toBeVisible();
    const invoiceSearch = page.getByPlaceholder(/Szukaj|numer|Numer/).first();
    await invoiceSearch.fill('BROWSER/001');
    await expect(page.getByText(/Strona 1 · 1 wynik/)).toBeVisible();
    // Route transition must load full data for legacy consumers and preserve functionality.
    await page.goto('/projects'); await page.locator('summary').filter({ hasText: 'Nowy projekt' }).click();
    await expect(page.getByRole('button', { name: 'Utwórz projekt' })).toBeVisible();
    await page.getByLabel('Nazwa', { exact: true }).fill('Browser Project');
    await page.getByRole('button', { name: 'Utwórz projekt' }).click();
    await page.getByRole('button', { name: /Browser Project/ }).click();
    await page.locator('summary').filter({ hasText: 'Dodaj czas pracy' }).click();
    await page.getByLabel('Data pracy', { exact: true }).fill('2026-09-22');
    await page.getByLabel('Opis', { exact: true }).fill('Browser work');
    await page.getByLabel('Liczba minut').fill('60'); await page.getByLabel('Koszt godziny pracy').fill('120');
    await page.getByRole('button', { name: 'Zapisz czas' }).click();
    await expect(page.getByText('Browser work', { exact: true })).toBeVisible();
    await page.goto('/settings/pdf-templates');
    await page.getByLabel('Nazwa', { exact: true }).fill('Browser template');
    await page.getByLabel('Stopka', { exact: true }).fill('Browser footer');
    await page.getByRole('button', { name: 'Zapisz nową wersję' }).click();
    await expect(page.getByText(/Zapisano wersję/)).toBeVisible();
    for (const [route, heading] of [['/warehouse','Magazyn'], ['/cost-reviews','Obieg kosztów'], ['/accountant','Panel księgowej'], ['/documents','Skrzynka dokumentów']]) {
      await page.goto(route); await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('heading').first()).toBeVisible();
      assert.equal(await page.getByText('Nie udało się wyświetlić strony', { exact: true }).count(), 0, heading);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileRoutes = ['/dashboard', '/analytics', '/ksef', '/settings/health', '/invoices', '/warehouse', '/projects', '/documents', '/settings/pdf-templates'];
    // Rozszerzony audyt po wdrożeniu; podstawowy zestaw pozostaje bramką CI.
    if (process.env.RUN_ALL_MOBILE_CHECKS === '1') mobileRoutes.push(
      '/invoices/new', '/invoices/recurring', '/advances', '/recurring', '/offers', '/orders', '/expenses',
      '/finances', '/calendar', '/jpk', '/audit', '/contractors', '/products', '/accountant', '/cost-reviews',
      '/reminders', '/settings/account', '/settings/companies', '/settings/currencies', '/settings/integrations',
      '/settings/ksef', '/settings/team', '/help',
    );
    for (const route of mobileRoutes) {
      await page.goto(route); await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('heading').first()).toBeVisible();
      if (route === '/invoices') await expect(page.getByRole('link', { name: 'Szczegóły dokumentu' }).first()).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${route}`);
    }
    // Numbering preference survives reload, and each new invoice asks auto vs manual on a phone.
    await page.goto('/invoices/new');
    await expect(page.getByText('Jak ponumerować tę fakturę?')).toBeVisible();
    await page.getByRole('button', { name: 'Wpisz numer ręcznie', exact: true }).click();
    await page.getByLabel('Numer faktury', { exact: true }).fill('KLIENT-007/2026');
    await page.getByRole('button', { name: 'Ustaw numerację tej firmy', exact: true }).click();
    const presets = page.getByLabel('Gotowy wariant numeracji');
    await presets.click();
    await expect(page.getByRole('option', { name: 'Tydzień / numer', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Tydzień / numer', exact: true }).click();
    await expect(page.locator('#invoice-number-pattern')).toHaveValue('{WW}/{NN}');
    // Keyboard opening, Escape and complete mobile containment of the custom list.
    await presets.focus(); await presets.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    assert.ok(await page.getByRole('listbox').evaluate(el => { const r=el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }), 'Mobile dropdown overflow');
    await presets.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.locator('#invoice-number-pattern').fill('KLIENT/{NNN}/{YYYY}');
    await page.getByRole('button', { name: 'Zapisz format', exact: true }).click();
    await expect(page.getByText('Zapisano numerację firmy', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Jak ponumerować tę fakturę?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kontynuuj automatycznie', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Kontynuuj automatycznie', exact: true }).click();
    await expect(page.getByLabel('Numer faktury', { exact: true })).toHaveValue(/KLIENT\/001\/\d{4}/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile invoice creator overflow');
    assert.equal(await page.locator('select').count(), 0, 'Invoice dropdowns use themed controls');
    assert.deepEqual(errors, [], 'Browser must not report unhandled JavaScript errors');
    console.log('[integration] PASS desktop/mobile browser navigation, invoice paging/search, project time and PDF templates');
  } finally { await context.close(); await browser.close(); }
}

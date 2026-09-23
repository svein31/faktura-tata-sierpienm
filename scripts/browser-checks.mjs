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
    await post('/api/auth/register', { name: 'Browser owner', email: 'browser@example.com', password: 'BrowserTest123!', acceptTerms: true });
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
    await page.goto('/invoices');
    await expect(page.getByRole('heading', { name: 'Faktury', exact: true })).toBeVisible();
    const dismiss = page.getByRole('button', { name: /Pomiń|Rozumiem|Zakończ/ });
    if (await dismiss.count()) await dismiss.first().click();
    await expect(page.getByText(/Strona 1 · 32 wyników/)).toBeVisible();
    await page.getByRole('button', { name: 'Następna', exact: true }).click();
    await expect(page.getByText(/Strona 2 · 32 wyników/)).toBeVisible();
    await page.getByRole('button', { name: 'Poprzednia', exact: true }).click();
    await expect(page.getByText(/Strona 1 · 32 wyników/)).toBeVisible();
    const invoiceSearch = page.getByPlaceholder(/Szukaj|numer|Numer/).first();
    await invoiceSearch.fill('BROWSER/001');
    await expect(page.getByText(/Strona 1 · 1 wyników/)).toBeVisible();
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
    for (const route of ['/invoices', '/warehouse', '/projects', '/documents', '/settings/pdf-templates']) {
      await page.goto(route); await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('heading').first()).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${route}`);
    }
    assert.deepEqual(errors, [], 'Browser must not report unhandled JavaScript errors');
    console.log('[integration] PASS desktop/mobile browser navigation, invoice paging/search, project time and PDF templates');
  } finally { await context.close(); await browser.close(); }
}

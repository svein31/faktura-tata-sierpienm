import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { waitForRenderedLayout } from '../mobile-audit.mjs';

const require = createRequire(import.meta.url);
require('../register-ts.cjs');
const { sessionTokenHash } = require('../../src/lib/session-token.ts');
const { LEGAL_VERSIONS } = require('../../src/lib/legal/config.ts');
const { currencyNames } = require('../../src/lib/i18n.ts');

/** Loopback, synthetic account, browser clicks and actual invoice API; NBP is mocked. */
export async function auditFinancialBrowser(browser, { base, db, outputPath } = {}) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Financial QA must use an isolated local target');
  const marker = randomBytes(6).toString('hex'), token = randomBytes(32).toString('base64url');
  const today = new Date().toISOString().slice(0, 10);
  const owner = await db.user.create({ data: { email: `financial-browser-${marker}@example.test`, password: 'unusable-synthetic-fixture', name: 'Finansowy test QA', termsAcceptedAt: new Date(), termsAcceptedVersion: LEGAL_VERSIONS.terms } });
  let context;
  const checks = [], pageErrors = [];
  const result = { scope: 'isolated-loopback-synthetic', viewport: { width: 390, height: 844 }, checks };
  try {
    await db.session.create({ data: { userId: owner.id, sessionToken: sessionTokenHash(token), authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
    // The integrated suite shares its database with other synthetic Pro owners.
    // MongoDB's non-sparse nullable unique indexes also index missing values.
    // Give this fixture distinct inert Stripe identifiers so it can coexist
    // with the HTTP suite's provider-free subscription without Stripe calls.
    await db.subscription.create({ data: { userId: owner.id, stripeCustomerId: `cus_qa_financial_${marker}`, stripeSubscriptionId: `sub_qa_financial_${marker}`, plan: 'yearly', status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Finansowa firma QA', street: 'Testowa 1', city: 'Warszawa', postalCode: '00-001', isDefault: true } });
    const buyer = await db.contractor.create({ data: { userId: owner.id, companyId: company.id, name: 'Finansowy nabywca Żółć', nip: '5250001003', country: 'PL', taxIdType: 'nip', address: { country: 'PL', street: 'Testowa 2', city: 'Warszawa', postal: '00-001' } } });
    context = await browser.newContext({ baseURL: base, viewport: result.viewport, reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { Origin: base } });
    context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
    await context.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
    await context.addInitScript(() => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); });
    const writeResponses = [], ksefMutationRequests = [];
    const errorListener = error => pageErrors.push(error.message);
    const observe = observed => {
      observed.on('pageerror', errorListener);
      observed.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/ksef/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          ksefMutationRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
        }
      });
      observed.on('response', response => { if (new URL(response.url()).pathname === '/api/invoices' && response.request().method() === 'POST') writeResponses.push(response); });
    };
    let page = await context.newPage(); observe(page);
    const navigate = async route => {
      if (page.url() !== 'about:blank') {
        const previous = page; previous.off('pageerror', errorListener);
        page = await context.newPage(); observe(page); await previous.close();
      }
      await page.goto(route); await waitForRenderedLayout(page);
    };
    const refresh = async () => {
      // Only teardown errors from the old document are detached. Reattach at
      // response commit, before the new document executes any application JS.
      page.off('pageerror', errorListener);
      await page.reload({ waitUntil: 'commit' }); page.on('pageerror', errorListener);
      await waitForRenderedLayout(page);
    };
    const originalResponse = await context.request.post('/api/invoices', { data: { number: `QA/${marker}/ORIGINAL`, type: 'sale', status: 'issued', sellerCompanyId: company.id, contractorId: buyer.id, issueDate: today, saleDate: today, dueDate: today, currency: 'PLN', language: 'PL', paymentMethod: 'transfer', lines: [{ id: 'original-line', name: 'Oryginał usługa Łódź <&>', quantity: 1, netPrice: 100, vatRate: '23', unit: 'szt.' }] } });
    const originalData = await originalResponse.json(); assert.ok(originalResponse.ok(), JSON.stringify(originalData));
    const original = originalData.invoice;
    const originalStored = await db.invoice.findUniqueOrThrow({ where: { id: original.id } });
    const fresh = async () => {
      const link = page.getByRole('link', { name: 'Wystaw fakturę', exact: true });
      if (await link.count()) await link.first().click(); else await navigate('/invoices/new');
      await waitForRenderedLayout(page);
      await expect(page.getByRole('textbox', { name: 'Nazwa pozycji 1', exact: true })).toHaveValue('');
    };
    const chooseManual = async number => {
      await page.getByRole('button', { name: 'Wpisz numer ręcznie', exact: true }).click();
      await page.getByLabel('Numer faktury', { exact: true }).fill(number);
    };
    const chooseBuyer = async () => { await page.locator('#invoice-contractorId').click(); await page.getByRole('option', { name: /Finansowy nabywca Żółć/ }).click(); };
    const submit = async (button, path, scenarioKey) => {
      let postObserved = false;
      const observePost = request => { if (new URL(request.url()).pathname === path && request.method() === 'POST') postObserved = true; };
      if (scenarioKey) page.on('request', observePost);
      try {
        const [response] = await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST'),
          button.click(),
        ]);
        const data = await response.json();
        assert.ok(response.ok(), `${path}: ${JSON.stringify(data)}`); return data;
      } catch (error) {
        if (scenarioKey && !postObserved) {
          // Only visible validation messages from this isolated synthetic account;
          // never dump input values, the document, cookies or request payloads.
          const alerts = await page.locator('[role="alert"]:visible').allTextContents();
          console.error('[financial-browser] Missing POST ' + JSON.stringify({ scenario: scenarioKey, path, alerts: alerts.map(text => text.replace(/\s+/g, ' ').trim()) }));
        }
        throw error;
      } finally { if (scenarioKey) page.off('request', observePost); }
    };
    await navigate('/invoices/new');
    const cookieReject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true }); if (await cookieReject.count()) await cookieReject.click();
    await chooseManual(`QA/${marker}/ROUND`); await chooseBuyer();
    await page.getByRole('textbox', { name: 'Nazwa pozycji 1', exact: true }).fill('Granica ceny 1,005 — Łódź');
    await page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true }).fill('10');
    await page.getByRole('spinbutton', { name: 'Cena netto pozycji 1', exact: true }).fill('1.005');
    await expect(page.locator('.invoice-paper')).toContainText('10,10');
    await expect(page.locator('.invoice-paper')).toContainText('12,42');
    const rounded = await submit(page.getByRole('button', { name: 'Szkic', exact: true }).first(), '/api/invoices');
    assert.equal(rounded.invoice.totalNet, 10.1); assert.equal(rounded.invoice.totalGross, 12.42); assert.equal(rounded.invoice.lines[0].netPrice, 1.01);
    await expect(page).toHaveURL(/\/invoices$/); await waitForRenderedLayout(page);
    await navigate(`/invoices/${rounded.invoice.id}`); await refresh();
    await expect(page.locator('.invoice-paper')).toContainText('12,42');
    checks.push('1.005 × 10: visible preview equals saved/reloaded 10.10 net and 12.42 gross');
    await fresh(); await chooseManual(`QA/${marker}/ZERO`); await chooseBuyer();
    await page.getByRole('textbox', { name: 'Nazwa pozycji 1', exact: true }).fill('Zero nie jest sprzedażą');
    await page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true }).fill('0');
    const beforeZero = writeResponses.length;
    await page.getByRole('button', { name: 'Szkic', exact: true }).first().click();
    await expect(page.getByText('Dodaj co najmniej jedną pozycję z nazwą i ilością.').first()).toBeVisible();
    assert.equal(writeResponses.length, beforeZero);
    checks.push('Ordinary zero quantity stays an explicit validation error and never reaches invoice POST');
    // Leave an edit in the store, then use history back: the correction action must
    // reset that identity instead of PUT-ing the original as a new correction.
    await navigate(`/invoices/${original.id}`); await page.getByRole('button', { name: 'Edytuj', exact: true }).click();
    await expect(page).toHaveURL(/invoices\/new$/); await page.goBack();
    await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`correctionFrom=${original.id}`));
    await expect(page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true })).toHaveValue('1');
    await expect(page.getByRole('heading', { name: '2 Pozycje po korekcie', exact: true })).toBeVisible();
    await chooseManual(`QA/${marker}/CORRECTION`);
    await page.getByLabel('Przyczyna korekty (pole wymagane w schemacie FA(3)) *', { exact: true }).fill('Zwrot połowy usługi <&>');
    await page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true }).fill('0.5');
    await expect(page.getByTestId('correction-difference')).toContainText('-61,50');
    const preflight = await submit(page.getByRole('button', { name: 'Zapisz korektę', exact: true }).first(), '/api/invoices/preflight');
    assert.equal(preflight.canProceed, true); assert.equal(preflight.totals.gross, -61.5);
    const correction = await submit(page.getByRole('dialog').getByRole('button', { name: 'Zatwierdzam i kontynuuję', exact: true }), '/api/invoices');
    assert.notEqual(correction.invoice.id, original.id); assert.equal(correction.invoice.totalGross, -61.5); assert.equal(correction.invoice.originalInvoiceNumber, original.number);
    await expect(page).toHaveURL(/\/invoices$/); await waitForRenderedLayout(page);
    await navigate(`/invoices/${correction.invoice.id}`); await refresh();
    await expect(page.locator('.invoice-paper')).toContainText(original.number); await expect(page.locator('.invoice-paper')).toContainText('-61,50');
    const afterCorrection = await db.invoice.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(afterCorrection.version, originalStored.version); assert.deepEqual(afterCorrection.lines, originalStored.lines); assert.equal(afterCorrection.totalGross, originalStored.totalGross);
    checks.push('Detail → abandoned edit → back → signed correction → explicit preflight/save/reload preserves original identity and values');
    // Synthetic acceptance is persisted only in this isolated database. No send,
    // status reconciliation, MF session or other external provider is invoked.
    const acceptedSources = [
      { key: 'KSEF_ACCEPTED', status: 'ksef_active', documentStatus: 'accepted', jsonOnly: false },
      { key: 'KSEF_STALE_DRAFT', status: 'draft', documentStatus: 'draft', jsonOnly: false },
      { key: 'KSEF_LEGACY_JSON', status: 'draft', documentStatus: 'draft', jsonOnly: true },
    ];
    for (const [index, scenario] of acceptedSources.entries()) {
      const sourceResponse = await context.request.post('/api/invoices', { data: {
        number: `QA/${marker}/${scenario.key}`, type: 'sale', status: 'issued',
        sellerCompanyId: company.id, contractorId: buyer.id, issueDate: today,
        saleDate: today, dueDate: today, currency: 'PLN', language: 'PL', paymentMethod: 'transfer',
        lines: [{ id: `accepted-line-${index}`, name: `KSeF ${scenario.key} Żółć <&>`, quantity: 1, netPrice: 100, vatRate: '23', unit: 'szt.' }],
      } });
      const sourceData = await sourceResponse.json();
      assert.ok(sourceResponse.ok(), `${scenario.key}: ${JSON.stringify(sourceData)}`);
      const sourceId = sourceData.invoice.id;
      const sourceKsefNumber = `${company.nip}-${today.replaceAll('-', '')}-${marker.slice(0, 6).toUpperCase()}-${marker.slice(6).toUpperCase()}-${String(index + 1).padStart(2, '0')}`;
      const acceptedAt = `${today}T12:00:00.000Z`;
      await db.invoice.update({ where: { id: sourceId }, data: {
        status: scenario.status, documentStatus: scenario.documentStatus,
        ksefNumber: scenario.jsonOnly ? null : sourceKsefNumber,
        ksefStatus: scenario.jsonOnly ? null : 'accepted',
        ksef: { number: sourceKsefNumber, status: 'ACTIVE', environment: 'test', sentAt: acceptedAt },
        upoXml: `<UPO><Dokument><NumerKSeFDokumentu>${sourceKsefNumber}</NumerKSeFDokumentu><DataPrzyjeciaDokumentu>${acceptedAt}</DataPrzyjeciaDokumentu></Dokument></UPO>`,
        ksefXml: `<SyntheticQAOriginal><Number>${sourceData.invoice.number}</Number></SyntheticQAOriginal>`,
      } });
      const beforeAcceptedCorrection = await db.invoice.findUniqueOrThrow({ where: { id: sourceId } });
      await navigate(index === 0 ? '/invoices' : `/invoices/${sourceId}`);
      const createCorrection = page.getByRole('button', { name: index === 0 ? `Koryguj fakturę ${beforeAcceptedCorrection.number}` : 'Wystaw korektę', exact: true });
      await expect(createCorrection).toBeVisible();
      await createCorrection.click();
      await expect(page).toHaveURL(new RegExp(`correctionFrom=${sourceId}`));
      await expect(page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true })).toHaveValue('1');
      await expect(page.getByText(`Numer KSeF oryginału: ${sourceKsefNumber}`, { exact: false })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Wczytywanie faktury do sklonowania…' })).toHaveCount(0);
      await chooseManual(`QA/${marker}/${scenario.key}/CORRECTION`);
      await page.getByLabel('Przyczyna korekty (pole wymagane w schemacie FA(3)) *', { exact: true }).fill(`Zwrot połowy ${scenario.key} Żółć <&>`);
      await page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true }).fill('0.5');
      await expect(page.getByRole('spinbutton', { name: 'Ilość pozycji 1', exact: true })).toHaveValue('0.5');
      await expect(page.locator('.invoice-paper')).toContainText('-61,50');
      const acceptedPreflight = await submit(page.getByRole('button', { name: 'Zapisz korektę', exact: true }).first(), '/api/invoices/preflight', scenario.key);
      assert.equal(acceptedPreflight.canProceed, true, `${scenario.key} preflight`);
      assert.equal(acceptedPreflight.totals.gross, -61.5);
      const saved = await submit(page.getByRole('dialog').getByRole('button', { name: 'Zatwierdzam i kontynuuję', exact: true }), '/api/invoices');
      assert.notEqual(saved.invoice.id, sourceId);
      assert.equal(saved.invoice.isCorrection, true);
      assert.equal(saved.invoice.originalInvoiceId, sourceId);
      assert.equal(saved.invoice.originalInvoiceNumber, beforeAcceptedCorrection.number);
      assert.equal(saved.invoice.originalKsefNumber, sourceKsefNumber);
      assert.equal(saved.invoice.totalNet, -50); assert.equal(saved.invoice.totalVat, -11.5); assert.equal(saved.invoice.totalGross, -61.5);
      const storedCorrection = await db.invoice.findUniqueOrThrow({ where: { id: saved.invoice.id } });
      assert.deepEqual(storedCorrection.originalLines, beforeAcceptedCorrection.lines);
      assert.equal(storedCorrection.originalKsefNumber, sourceKsefNumber);
      await expect(page).toHaveURL(/\/invoices$/); await waitForRenderedLayout(page);
      await navigate(`/invoices/${saved.invoice.id}`); await refresh();
      await expect(page.locator('.invoice-paper')).toContainText(beforeAcceptedCorrection.number);
      await expect(page.locator('.invoice-paper')).toContainText('-61,50');
      const xmlDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Pobierz FA(3)', exact: true }).click();
      const download = await xmlDownload;
      assert.equal(await download.failure(), null, `${scenario.key} XML download`);
      const xmlStream = await download.createReadStream();
      assert.ok(xmlStream, `${scenario.key} XML stream`);
      const xmlParts = []; for await (const part of xmlStream) xmlParts.push(part);
      const xml = Buffer.concat(xmlParts).toString('utf8');
      assert.ok(xml.includes('<RodzajFaktury>KOR</RodzajFaktury>'));
      assert.ok(xml.includes(`<NrFaKorygowanej>${beforeAcceptedCorrection.number}</NrFaKorygowanej>`));
      assert.ok(xml.includes(`<NrKSeFFaKorygowanej>${sourceKsefNumber}</NrKSeFFaKorygowanej>`));
      assert.ok(xml.includes('<NrKSeF>1</NrKSeF>'));
      assert.ok(!xml.includes('<NrKSeFN>'), `${scenario.key} must reference its accepted KSeF original`);
      const pdfResponse = await context.request.get(`/api/invoices/${saved.invoice.id}/pdf`, { timeout: 30000 });
      assert.ok(pdfResponse.ok(), `${scenario.key} correction PDF: HTTP ${pdfResponse.status()}`);
      assert.match(pdfResponse.headers()['content-type'] || '', /^application\/pdf\b/);
      const pdf = await pdfResponse.body();
      assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-'); assert.ok(pdf.length > 500);
      const afterAcceptedCorrection = await db.invoice.findUniqueOrThrow({ where: { id: sourceId } });
      assert.deepEqual(afterAcceptedCorrection, beforeAcceptedCorrection, `${scenario.key} original must remain unchanged, including raw legacy statuses and KSeF fields`);
      checks.push(`${scenario.key}: visible detail action → signed correction → preflight/save/reload/XML/PDF preserves original KSeF reference and all raw original fields`);
    }
    assert.deepEqual(ksefMutationRequests, [], 'Correction QA must never dispatch a KSeF transmission or mutate a provider session');
    await fresh(); await chooseManual(`QA/${marker}/NBP`); await chooseBuyer();
    await page.getByRole('textbox', { name: 'Nazwa pozycji 1', exact: true }).fill('Test kursu NBP');
    await page.getByRole('spinbutton', { name: 'Cena netto pozycji 1', exact: true }).fill('1');
    let phase = 'race', releaseEuro, sawEuro;
    const euroSeen = new Promise(resolve => { sawEuro = resolve; });
    const euroGate = new Promise(resolve => { releaseEuro = resolve; });
    await page.route('**/api/nbp?*', async route => {
      const params = new URL(route.request().url()).searchParams;
      if (phase === 'race' && params.get('currency') === 'EUR') { sawEuro(); await euroGate; }
      try {
        if (phase === 'error') await route.fulfill({ status: 502, json: { error: 'Symulowana awaria kursów NBP' } });
        else await route.fulfill({ status: 200, json: { rate: params.get('currency') === 'USD' ? 4.1234 : 4.3333, unit: 1, tableNumber: phase === 'recovered' ? 'TABLE_RECOVERED' : `TABLE_${params.get('currency')}`, effectiveDate: today, source: 'Synthetic QA NBP' } });
      } catch (error) { if (!route.request().isNavigationRequest() && route.request().failure()?.errorText?.includes('ABORT')) return; throw error; }
    });
    const currency = page.getByLabel('Waluta', { exact: true });
    await currency.click(); await page.getByRole('option', { name: currencyNames.EUR, exact: true }).click();
    let euroTimeout;
    try { await Promise.race([euroSeen, new Promise((_, reject) => { euroTimeout = setTimeout(() => reject(new Error('Mocked EUR request was not observed within 15 seconds')), 15000); })]); }
    finally { clearTimeout(euroTimeout); }
    await expect(page.getByRole('button', { name: 'Odśwież kurs z NBP', exact: true })).toBeDisabled();
    await currency.click(); await page.getByRole('option', { name: currencyNames.USD, exact: true }).click();
    await expect(page.getByText('TABLE_USD', { exact: true }).first()).toBeVisible(); releaseEuro();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText('TABLE_EUR', { exact: true })).toHaveCount(0);
    checks.push('Slow EUR request cannot replace the newer USD rate; refresh has a loading state');
    phase = 'error'; await currency.click(); await page.getByRole('option', { name: currencyNames.EUR, exact: true }).click();
    await expect(page.getByText('Symulowana awaria kursów NBP', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('TABLE_USD', { exact: true })).toHaveCount(0);
    const beforeNbpError = writeResponses.length;
    await page.getByRole('button', { name: 'Szkic', exact: true }).first().click();
    await expect(page.getByText('Pobierz oficjalny kurs waluty z NBP dla tego dokumentu.').first()).toBeVisible();
    assert.equal(writeResponses.length, beforeNbpError);
    checks.push('NBP outage clears stale rate, shows an error and blocks save without a financial write');
    phase = 'recovered'; await page.getByRole('button', { name: 'Odśwież kurs z NBP', exact: true }).click();
    await expect(page.getByText('TABLE_RECOVERED', { exact: true }).first()).toBeVisible();
    checks.push('Explicit refresh recovers a current, visible official exchange rate after the outage');
    await page.unroute('**/api/nbp?*');
    assert.deepEqual(pageErrors, [], 'Financial browser scenarios must not throw JavaScript errors');
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[financial-browser] PASS ${checks.length} synthetic financial interaction scenarios`);
    return result;
  } catch (error) {
    result.status = 'failed'; result.error = error.message; result.pageErrors = pageErrors;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    await context?.close();
    await db.user.delete({ where: { id: owner.id } });
  }
}

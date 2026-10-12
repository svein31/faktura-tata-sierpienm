import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

// Public-only UI regressions: no account, real invoice, email or MF request.
export async function auditPublicCalculators(page) {
  const viewport = page.viewportSize(), checks = [];
  let originalFailure;
  async function ready(path) {
    await page.goto(path);
    await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
    const reject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
    if (await reject.isVisible()) await reject.click();
    await page.evaluate(() => document.fonts.ready);
  }
  async function choose(combobox, name) {
    await combobox.click();
    await page.getByRole('option', { name, exact: true }).click();
  }
  async function fits(label, results) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const layout = await page.evaluate(() => ({
      path: location.pathname,
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      fits: document.documentElement.scrollWidth <= innerWidth + 2,
    }));
    const resultLayout = results ? await results.evaluate(container => {
      const bounds = container.getBoundingClientRect(), violations = [];
      const describe = element => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return { tag: element.tagName, text: element.textContent, width: rect.width, left: rect.left, right: rect.right, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, gridTemplateColumns: style.gridTemplateColumns, minWidth: style.minWidth, overflowWrap: style.overflowWrap, fontFamily: style.fontFamily, fontSize: style.fontSize };
      };
      if (container.scrollWidth > container.clientWidth + 2) violations.push('result grid exceeds its available width');
      const cards = [...container.children].filter(element => element instanceof HTMLElement);
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (rect.left < bounds.left - 2 || rect.right > bounds.right + 2) violations.push('result card exceeds its grid');
        for (const value of card.querySelectorAll('p')) {
          if (value.scrollWidth > value.clientWidth + 2) violations.push('result amount exceeds its paragraph');
        }
      }
      return { violations, container: describe(container), cards: cards.map(describe), values: cards.flatMap(card => [...card.querySelectorAll('p')].map(describe)) };
    }) : null;
    if (!layout.fits || resultLayout?.violations.length) {
      // Preserve the failing viewport before the outer finally restores it.
      const diagnostic = { label, ...layout, resultLayout };
      console.log('[public-calculator-overflow] '+JSON.stringify(diagnostic));
      try {
        await mkdir('artifacts/mobile', { recursive: true });
        const engine = page.context().browser()?.browserType().name() || 'browser';
        const filename = 'artifacts/mobile/'+engine+'-calculator-'+label.replace(/[^a-z0-9]/gi, '_');
        await writeFile(filename+'.json', JSON.stringify(diagnostic, null, 2)+'\n');
        await page.screenshot({ path: filename+'.png', fullPage: true });
      } catch (error) {
        console.log('[public-calculator-diagnostic-failure] '+JSON.stringify({ message: error.message }));
      }
    }
    assert.ok(layout.fits, label+' has no horizontal overflow');
    if (resultLayout) assert.deepEqual(resultLayout.violations, [], label+' results fit inside their grid');
  }
  const compact = text => text.replace(/\s/g, '');
  async function exactAmounts(status, expected) {
    await expect.poll(async () => (await status.locator('p').allTextContents()).map(compact)).toEqual(expected);
  }
  try {
    for (const [width, height] of [[320, 740], [768, 1024], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await ready('/narzedzia/kalkulator-vat');
      const calculator = page.getByRole('heading', { name: 'Oblicz kwoty', exact: true }).locator('..');
      const amount = page.getByLabel('Kwota w PLN', { exact: true });
      const direction = calculator.locator('label').filter({ hasText: 'Rodzaj kwoty' }).getByRole('combobox');
      const rate = calculator.locator('label').filter({ hasText: 'Stawka VAT' }).getByRole('combobox');
      const status = calculator.getByRole('status');
      for (const [percent, vat, gross] of [[23, '23,00', '123,00'], [8, '8,00', '108,00'], [5, '5,00', '105,00'], [0, '0,00', '100,00']]) {
        await amount.fill('100'); await choose(rate, percent+'%');
        await exactAmounts(status, ['100,00zł', vat+'zł', gross+'zł']);
        await fits('VAT '+percent+'% result at '+width+'px', status);
      }
      checks.push({ viewport: width, scenario: 'All four VAT rates, net to gross', status: 'passed' });
      await choose(rate, '23%'); await choose(direction, 'Brutto');
      await amount.fill('100,01'); await exactAmounts(status, ['81,31zł', '18,70zł', '100,01zł']);
      await choose(direction, 'Netto'); await amount.fill('1 234,56');
      await exactAmounts(status, ['1234,56zł', '283,95zł', '1518,51zł']);
      await fits('Polish grouped VAT value at '+width+'px', status);
      checks.push({ viewport: width, scenario: 'Gross to net and Polish decimal/grouping input', status: 'passed' });
      for (const invalid of ['', '-1', 'abc', '1.234', 'ą', '<script>alert(1)</script>']) {
        await amount.fill(invalid); await expect(calculator.getByRole('alert')).toBeVisible();
        await expect(amount).toHaveAttribute('aria-invalid', 'true');
        await expect(status).toHaveCount(0);
      }
      checks.push({ viewport: width, scenario: 'Empty, negative, malformed, Polish characters and markup are rejected', status: 'passed' });
      await amount.fill('60071992547000.15');
      await expect(status).toBeVisible();
      await exactAmounts(status, ['60071992547000,15zł', '13816558285810,03zł', '73888550832810,18zł']);
      await fits('Large accepted VAT value at '+width+'px', status);
      await amount.fill('90071992547409.91'); await expect(calculator.getByRole('alert')).toBeVisible();
      await amount.fill('90071992547409.92'); await expect(calculator.getByRole('alert')).toBeVisible();
      await amount.fill('100'); await expect(status).toContainText('123,00');
      await direction.focus(); await direction.press('Enter');
      await expect(page.getByRole('listbox')).toBeVisible();
      await direction.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(direction).toBeFocused();
      checks.push({ viewport: width, scenario: 'Exact large values, input/result overflow, recovery and keyboard dropdown', status: 'passed' });
      await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
      await expect(page.getByLabel('Kwota w PLN', { exact: true })).toHaveValue('100');
      await expect(calculator.getByRole('status')).toContainText('123,00');
      await page.getByRole('link', { name: 'Narzędzia', exact: true }).click();
      await expect(page).toHaveURL(/\/narzedzia$/);
      await page.goBack(); await expect(page).toHaveURL(/\/narzedzia\/kalkulator-vat$/);
      await expect(page.getByLabel('Kwota w PLN', { exact: true })).toBeVisible();
      checks.push({ viewport: width, scenario: 'Reload and browser back preserve a usable calculator', status: 'passed' });

      await ready('/narzedzia/limit-ksef');
      const previous = page.getByLabel('Suma wcześniejszych faktur brutto w tym miesiącu', { exact: true });
      const invoice = page.getByLabel('Nowa faktura brutto', { exact: true });
      const threshold = page.getByRole('heading', { name: 'Która faktura przekracza 10 000 zł?', exact: true }).locator('..');
      const crossing = threshold.getByRole('combobox');
      const thresholdStatus = threshold.getByRole('status');
      await previous.fill('8000'); await invoice.fill('2000'); await choose(crossing, 'Nie');
      await expect(thresholdStatus).toContainText('nie przekracza jeszcze');
      await invoice.fill('2000,01'); await expect(thresholdStatus).toContainText('wymaga KSeF');
      await choose(crossing, 'Tak, w tym lub wcześniejszym miesiącu');
      await previous.fill('0'); await invoice.fill('1');
      await expect(thresholdStatus).toContainText('nie przywraca wyjątku');
      await invoice.fill('0'); await expect(invoice).toHaveAttribute('aria-invalid', 'true');
      await expect(thresholdStatus).toHaveCount(0);
      await invoice.fill('1'); await previous.fill('bad');
      await expect(previous).toHaveAttribute('aria-invalid', 'true'); await expect(thresholdStatus).toHaveCount(0);
      await previous.fill('0'); await expect(thresholdStatus).toContainText('wymaga KSeF');
      await fits('KSeF threshold at '+width+'px');
      checks.push({ viewport: width, scenario: 'Exact KSeF boundary, previous crossing, zero/invalid input and recovery', status: 'passed' });
    }
    console.log('[public-calculators] PASS '+checks.length+' workflows at 320/768/1280px');
    return checks;
  } catch(error) {
    originalFailure=error;
    throw error;
  } finally {
    if (viewport && !page.isClosed()) {
      try {await page.setViewportSize(viewport);}
      catch(error) {
        if(!originalFailure)throw error;
        console.log('[public-calculators-cleanup-failure] '+JSON.stringify({message:error.message,originalFailure:originalFailure.message}));
      }
    }
  }
}

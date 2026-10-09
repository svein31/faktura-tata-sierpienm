import assert from 'node:assert/strict';
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
  async function fits(label) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), label+' has no horizontal overflow');
  }
  const compact = text => text.replace(/\s/g, '');
  try {
    for (const [width, height] of [[320, 740], [768, 1024], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await ready('/narzedzia/kalkulator-vat');
      const calculator = page.getByRole('heading', { name: 'Oblicz kwoty', exact: true }).locator('..');
      const amount = page.getByLabel('Kwota w PLN', { exact: true });
      const direction = calculator.locator('label').filter({ hasText: 'Rodzaj kwoty' }).getByRole('combobox');
      const rate = calculator.locator('label').filter({ hasText: 'Stawka VAT' }).getByRole('combobox');
      const status = calculator.getByRole('status');
      for (const [percent, gross] of [[23, '123,00'], [8, '108,00'], [5, '105,00'], [0, '100,00']]) {
        await amount.fill('100'); await choose(rate, percent+'%');
        await expect(status).toContainText(gross);
      }
      checks.push({ viewport: width, scenario: 'All four VAT rates, net to gross', status: 'passed' });
      await choose(rate, '23%'); await choose(direction, 'Brutto');
      await amount.fill('100,01'); await expect(status).toContainText('81,31');
      await choose(direction, 'Netto'); await amount.fill('1 234,56');
      await expect.poll(async () => compact(await status.innerText())).toContain('1518,51zł');
      checks.push({ viewport: width, scenario: 'Gross to net and Polish decimal/grouping input', status: 'passed' });
      for (const invalid of ['', '-1', 'abc', '1.234', 'ą', '<script>alert(1)</script>']) {
        await amount.fill(invalid); await expect(calculator.getByRole('alert')).toBeVisible();
        await expect(amount).toHaveAttribute('aria-invalid', 'true');
        await expect(status).toHaveCount(0);
      }
      checks.push({ viewport: width, scenario: 'Empty, negative, malformed, Polish characters and markup are rejected', status: 'passed' });
      await amount.fill('60071992547000.15');
      await expect(status).toBeVisible();
      await expect.poll(async () => compact(await status.innerText())).toContain('13816558285810,03zł');
      await expect.poll(async () => compact(await status.innerText())).toContain('73888550832810,18zł');
      await fits('Large accepted VAT value at '+width+'px');
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

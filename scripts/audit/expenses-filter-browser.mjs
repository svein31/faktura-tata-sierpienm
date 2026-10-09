import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

const require = createRequire(import.meta.url);
require('../register-ts.cjs');
const { LEGAL_VERSIONS } = require('../../src/lib/legal/config.ts');

/** Actual expense filters, semantic colors and rows; local synthetic tenant only. */
export async function auditExpenseFilterBrowser(browser, { base, db, outputPath } = {}) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Expense filter QA requires an isolated local target');
  const marker = randomBytes(8).toString('hex'), contexts = [], checks = [], colors = [], pageErrors = [];
  const result = { scope: 'isolated-loopback-synthetic', viewport: { width: 390, height: 844 }, checks, colors };
  const owner = await db.user.create({ data: { email: `expense-filter-${marker}@example.invalid`, password: 'unusable-synthetic-fixture', name: 'Test filtrów kosztów Żółć', termsAcceptedAt: new Date(), termsAcceptedVersion: LEGAL_VERSIONS.terms } });
  try {
    const company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Test filtrów kosztów', isDefault: true } });
    const filters = [
      { label: 'Wszystkie statusy', status: null },
      { label: 'Do sprawdzenia', status: 'to_verify' },
      { label: 'Sprawdzone', status: 'verified' },
      { label: 'Przekazane księgowej', status: 'sent_to_accountant' },
    ];
    const expenses = [];
    for (const filter of filters.slice(1)) expenses.push(await db.expense.create({ data: { userId: owner.id, companyId: company.id, number: `QA/FILTER/${filter.status}/${marker}`, contractorName: 'Testowy sprzedawca Żółć', issueDate: '2026-10-08', category: 'inne', totalNet: 100, totalVat: 23, totalGross: 123, currency: 'PLN', paymentStatus: 'paid', workflowStatus: filter.status } }));
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ baseURL: base, viewport: result.viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
      contexts.push(context); context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
      await context.addInitScript(mode => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); localStorage.setItem('fakturaprosto-theme', mode); }, theme);
      const token = randomBytes(32).toString('base64url');
      await db.session.create({ data: { userId: owner.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
      await context.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto('/expenses');
      await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
      await expect(page.locator('tbody tr')).toHaveCount(3);
      const reject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
      if (await reject.isVisible()) await reject.click();
      for (const [index, filter] of filters.entries()) {
        const button = page.getByRole('button', { name: filter.label, exact: true });
        if (index === 2) { await button.focus(); await page.keyboard.press('Space'); }
        else await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        for (const other of filters.filter(item => item !== filter)) await expect(page.getByRole('button', { name: other.label, exact: true })).toHaveAttribute('aria-pressed', 'false');
        const expected = filter.status ? expenses.filter(item => item.workflowStatus === filter.status) : expenses;
        await expect(page.locator('tbody tr')).toHaveCount(expected.length);
        for (const expense of expected) await expect(page.locator('tbody').getByText(expense.number, { exact: true })).toBeVisible();
        await button.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const actual = await button.evaluate(element => {
          const style = getComputedStyle(element), card = element.closest('.bg-card');
          // Resolve each token without inheriting the global color transition.
          // Reusing an attached probe makes WebKit report the previous animated color.
          const resolve = token => {
            const probe = document.createElement('span');
            probe.style.setProperty('transition', 'none', 'important');
            probe.style.setProperty('animation', 'none', 'important');
            probe.style.color = `hsl(var(${token}))`;
            element.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          const tokens = { primary: resolve('--primary'), foreground: resolve('--primary-foreground'), muted: resolve('--muted-foreground') };
          const contrast = (first, second) => {
            const rgb = color => { const values = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/); if (!values) throw new Error('Unsupported computed color: ' + color); return values.slice(1, 4).map(Number); };
            const luminance = color => rgb(color).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
            const a = luminance(first), b = luminance(second); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          const inactive = [...element.parentElement.querySelectorAll('button[aria-pressed="false"]')].map(item => ({ label: item.textContent, color: getComputedStyle(item).color, background: getComputedStyle(item).backgroundColor }));
          return { background: style.backgroundColor, foreground: style.color, expected: tokens, selectedContrast: contrast(style.color, style.backgroundColor), cardBackground: getComputedStyle(card).backgroundColor, inactive };
        });
        assert.equal(actual.background, actual.expected.primary, `${theme}: active filter needs an actual semantic background`);
        assert.equal(actual.foreground, actual.expected.foreground, `${theme}: active foreground must follow its semantic theme token`);
        assert.ok(actual.selectedContrast >= 4.5, `${theme}: active text contrast ${actual.selectedContrast} must be at least 4.5`);
        for (const inactive of actual.inactive) { assert.equal(inactive.color, actual.expected.muted); assert.equal(inactive.background, 'rgba(0, 0, 0, 0)'); }
        colors.push({ theme, filter: filter.label, renderedRows: expected.length, ...actual });
      }
      await page.getByRole('button', { name: 'Wszystkie statusy', exact: true }).click();
      await expect(page.locator('tbody tr')).toHaveCount(3);
      assert.deepEqual(pageErrors, [], 'Expense filter clicks and keyboard activation must not throw browser errors');
      checks.push(`${theme}: all four filters expose pressed state, render their exact synthetic rows, support keyboard activation, and have visible semantic colors with contrast >=4.5`);
      await context.close();
    }
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[expense-filter-browser] PASS ${checks.length} theme scenarios and ${colors.length} actual filter/color/row states`);
    return result;
  } catch (error) {
    result.status = 'failed'; result.error = error.message; result.pageErrors = pageErrors;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    await db.user.delete({ where: { id: owner.id } });
  }
}

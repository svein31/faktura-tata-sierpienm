import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { recordBrowserScenario } from './browser-control-inventory.mjs';

/** Actual cookie UI print visibility and keyboard recovery; fresh anonymous local contexts. */
export async function auditCookiePrintBrowser(browser, { base, engine, outputPath } = {}) {
  const target = new URL(base);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Cookie print QA requires an isolated local target');
  assert.ok(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password, 'Cookie print QA needs a local HTTP origin without credentials');
  const contexts = [], checks = [], scenarios = [], pageErrors = [];
  const guards = { externalRequestsBlocked: 0, localMutationsBlocked: 0 };
  const result = { scope: 'isolated-loopback-fresh-anonymous; external requests and non-GET/HEAD mutations blocked', engine, viewport: { width: 390, height: 844 }, checks, scenarios, guards };
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ baseURL: target.origin, viewport: result.viewport, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
      contexts.push(context);
      context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
      await context.addInitScript(mode => localStorage.setItem('fakturaprosto-theme', mode), theme);
      await context.route('**/*', async route => {
        const request = route.request();
        if (new URL(request.url()).origin !== target.origin) { guards.externalRequestsBlocked++; await route.abort(); return; }
        if (!['GET', 'HEAD'].includes(request.method())) { guards.localMutationsBlocked++; await route.abort(); return; }
        await route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      const response = await page.goto('/');
      assert.equal(response?.status(), 200, 'Cookie print test must use the rendered main page');
      await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
      const banner = page.locator('[role="region"][aria-label="Powiadomienie o plikach cookies i prywatności"]');
      const trigger = banner.getByRole('button', { name: 'Ustawienia', exact: true });
      await expect(banner).toBeVisible();
      const measureBanner = () => banner.evaluate(element => ({ display: getComputedStyle(element).display, rendered: element.getClientRects().length > 0, visibleControls: [...element.querySelectorAll('button,a')].filter(control => control.getClientRects().length > 0).length }));
      const bannerScenario = { theme, name: 'cookie-banner-print-and-screen-return', screen: await measureBanner() };
      scenarios.push(bannerScenario);
      await page.emulateMedia({ media: 'print' });
      bannerScenario.print = await measureBanner();
      assert.equal(bannerScenario.print.display, 'none', `${theme}: the entire cookie banner must be hidden in print`);
      assert.equal(bannerScenario.print.rendered, false);
      assert.equal(bannerScenario.print.visibleControls, 0);
      await page.emulateMedia({ media: 'screen' });
      await expect(banner).toBeVisible();
      bannerScenario.restored = await measureBanner();
      assert.equal(bannerScenario.restored.rendered, true);
      assert.equal(bannerScenario.restored.visibleControls, bannerScenario.screen.visibleControls);
      recordBrowserScenario({ engine, theme }, bannerScenario.name, { route: '/', ...bannerScenario });
      checks.push(`${theme}: fresh cookie banner is visible on screen, entirely hidden in print, and restored on screen`);

      await trigger.focus();
      await expect(trigger).toBeFocused();
      await trigger.click();
      const dialog = page.locator('[role="dialog"][data-app-dialog="true"]');
      await expect(page.getByRole('dialog', { name: 'Ustawienia prywatności i plików cookies', exact: true })).toBeVisible();
      await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      const measureDialog = () => dialog.evaluate(panel => {
        const overlay = panel.parentElement, backdrop = overlay.firstElementChild;
        const measure = element => ({ display: getComputedStyle(element).display, rendered: element.getClientRects().length > 0 });
        return { overlay: measure(overlay), panel: measure(panel), backdrop: measure(backdrop), visibleControls: [...overlay.querySelectorAll('button,a,input,textarea,select')].filter(element => element.getClientRects().length > 0).length };
      });
      const dialogScenario = { theme, name: 'cookie-privacy-dialog-and-backdrop-print-and-screen-return', screen: await measureDialog() };
      scenarios.push(dialogScenario);
      assert.equal(dialogScenario.screen.overlay.rendered, true);
      assert.equal(dialogScenario.screen.backdrop.rendered, true);
      await page.emulateMedia({ media: 'print' });
      dialogScenario.print = await measureDialog();
      assert.equal(dialogScenario.print.overlay.display, 'none', `${theme}: print must hide the entire privacy overlay, including its backdrop`);
      for (const part of ['overlay', 'panel', 'backdrop']) assert.equal(dialogScenario.print[part].rendered, false);
      assert.equal(dialogScenario.print.visibleControls, 0);
      await page.emulateMedia({ media: 'screen' });
      await expect(dialog).toBeVisible();
      dialogScenario.restored = await measureDialog();
      for (const part of ['overlay', 'panel', 'backdrop']) assert.equal(dialogScenario.restored[part].rendered, true);
      assert.equal(dialogScenario.restored.visibleControls, dialogScenario.screen.visibleControls);
      recordBrowserScenario({ engine, theme }, dialogScenario.name, { route: '/', ...dialogScenario });
      checks.push(`${theme}: privacy dialog, all controls and backdrop are hidden in print and restored on screen`);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(banner).toBeVisible();
      await expect(trigger).toBeFocused();
      const recovery = { theme, name: 'cookie-privacy-escape-focus-restoration', dialogClosed: await dialog.count() === 0, trigger: await trigger.evaluate(element => ({ connected: element.isConnected, focused: element === document.activeElement })) };
      scenarios.push(recovery);
      assert.equal(recovery.trigger.connected, true);
      assert.equal(recovery.trigger.focused, true);
      assert.deepEqual(pageErrors, [], 'Cookie print and keyboard recovery must not throw browser errors');
      recordBrowserScenario({ engine, theme }, recovery.name, { route: '/', ...recovery });
      checks.push(`${theme}: Escape closes the restored privacy dialog and restores focus to Ustawienia`);

      await trigger.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Zamknij', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const closeRecovery = { theme, name: 'cookie-privacy-close-button-focus-restoration', dialogClosed: true, trigger: await trigger.evaluate(element => ({ connected: element.isConnected, focused: element === document.activeElement })) };
      scenarios.push(closeRecovery);
      assert.deepEqual(pageErrors, [], 'Cookie close-button recovery must not throw browser errors');
      recordBrowserScenario({ engine, theme }, closeRecovery.name, { route: '/', ...closeRecovery });
      checks.push(`${theme}: Zamknij closes the privacy dialog and restores focus to Ustawienia`);
      await context.close();
    }
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[cookie-print-browser] PASS ${engine || browser.browserType().name()} ${checks.length} actual banner/dialog/print/focus scenarios`);
    return result;
  } catch (error) {
    result.status = 'failed'; result.error = error.message; result.pageErrors = pageErrors;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}

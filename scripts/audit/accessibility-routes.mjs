import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { buildInventory } from '../qa-inventory.mjs';

// axe remains an audit tool installed outside application dependencies.
export async function auditAccessibilityRoutes(base, storageState, fixture, options = {}) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Accessibility write-capable context must be local');
  const axePath = options.axePath || process.env.AXE_CORE_PATH || '/tmp/faktura-qa-tools/node_modules/axe-core/axe.min.js';
  const axeSource = await readFile(axePath, 'utf8');
  const catalog = await buildInventory();
  const publicRoutes = [...catalog.publicPaths, ...(fixture.publicRoutes || [])];
  const routes = [...new Set([...publicRoutes, ...catalog.pages.filter(page => page.protected && !page.dynamic).map(page => page.route), `/invoices/${fixture.invoiceId}`])];
  const browser = await chromium.launch({ headless: true });
  const report = { checkedAt: new Date().toISOString(), sourceSha256: catalog.sourceSha256, buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), scope: 'Isolated synthetic account; rendered pages, WCAG A/AA automated checks; does not certify human/screen-reader accessibility', axeVersion: null, results: [] };
  try {
    for (const theme of ['light', 'dark']) {
      const contexts = {
        public: await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } }),
        protected: await browser.newContext({ baseURL: base, storageState, viewport: { width: 1280, height: 900 } }),
      };
      for (const context of Object.values(contexts)) await context.addInitScript(mode => {
        localStorage.setItem('fakturo_onboarding_completed_v2', 'true');
        localStorage.setItem('fakturaprosto-theme', mode);
      }, theme);
      for (const route of routes) {
        const context = publicRoutes.includes(route) ? contexts.public : contexts.protected;
        const page = await context.newPage();
        try {
          const response = await page.goto(route);
          await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
          await page.locator('main [aria-busy="true"]').waitFor({ state: 'hidden', timeout: 20000 });
          await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode === 'dark'), theme);
          // Entry transitions/stagger are real UI states, not settled text colors.
          // Complete them before evaluating steady-state contrast; interaction
          // and reduced-motion behavior are covered by the browser matrix.
          await page.waitForTimeout(1400);
          const reject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
          if (await reject.isVisible()) await reject.click();
          await page.evaluate(() => document.fonts.ready);
          await page.addScriptTag({ content: axeSource });
          const result = await page.evaluate(async () => {
            const checked = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
            return {
              version: checked.testEngine.version, passes: checked.passes.length,
              violations: checked.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, helpUrl: item.helpUrl, nodes: item.nodes.map(node => ({ html: node.html, target: node.target, reason: node.failureSummary })) })),
              incomplete: checked.incomplete.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),
            };
          });
          report.axeVersion = result.version;
          report.results.push({ route, theme, status: response?.status(), ...result });
          console.log('[a11y-route] ' + JSON.stringify({ route, theme, violations: result.violations.map(item => ({ id: item.id, nodes: item.nodes.length })), manualReviewGroups: result.incomplete.length }));
        } catch (error) {
          report.results.push({ route, theme, error: error.message });
          console.log('[a11y-route-error] ' + JSON.stringify({ route, theme, error: error.message }));
        } finally { await page.close(); }
      }
      await Promise.all(Object.values(contexts).map(context => context.close()));
    }
  } finally { await browser.close(); }
  report.summary = { routes: routes.length, screenChecks: report.results.length, failedScreens: report.results.filter(result => result.error || result.violations?.length).length, manualReviewScreens: report.results.filter(result => result.incomplete?.length).length };
  await mkdir('artifacts/qa', { recursive: true });
  await writeFile('artifacts/qa/accessibility-routes.json', JSON.stringify(report, null, 2));
  console.log('[a11y-summary] ' + JSON.stringify(report.summary));
  return report;
}

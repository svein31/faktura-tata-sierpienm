import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { expect } from '@playwright/test';
import { recordBrowserScenario } from './browser-control-inventory.mjs';

const selectedHeaderNames = ['rsc', 'next-router-prefetch', 'purpose', 'sec-purpose', 'accept'];
const normalizedPath = pathname => pathname.replace(/\/+$/, '') || '/';

function requestEvidence(request, origin, phase) {
  const url = new URL(request.url());
  const headers = Object.fromEntries(Object.entries(request.headers()).map(([name, value]) => [name.toLowerCase(), value]));
  const selectedHeaders = Object.fromEntries(selectedHeaderNames.filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
  const hints = [];
  if (headers['next-router-prefetch'] !== undefined) hints.push('next-router-prefetch');
  if (/\bprefetch\b/i.test(headers.purpose || '')) hints.push('purpose');
  if (/\bprefetch\b/i.test(headers['sec-purpose'] || '')) hints.push('sec-purpose');
  if (url.searchParams.has('_rsc')) hints.push('_rsc');
  if (headers.rsc?.trim() === '1') hints.push('rsc');
  return {
    phase,
    path: normalizedPath(url.pathname),
    sameOrigin: url.origin === origin,
    method: request.method(),
    resourceType: request.resourceType(),
    selectedHeaders,
    hints,
  };
}

function isRouteRequest(request) {
  // WebKit classifies the document's PWA manifest as "other". It is required
  // metadata, not an unrelated application route or navigation warmup.
  return request.path !== '/manifest.webmanifest'
    && !request.path.startsWith('/_next/') && !/^\/api(?:\/|$)/.test(request.path)
    && ['document', 'fetch', 'xhr', 'other'].includes(request.resourceType);
}

/** Actual local authenticated traffic; cold dashboard, navigation/history and intent-only warmup. */
export async function auditPrivatePrefetchBrowser(browser, { base, engine, storageState, outputPath } = {}) {
  const target = new URL(base);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Private prefetch QA requires an isolated loopback target');
  assert.ok(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password, 'Private prefetch QA requires a local HTTP origin without URL credentials');
  assert.ok(storageState && ['string', 'object'].includes(typeof storageState), 'Private prefetch QA requires synthetic authenticated storageState');

  const viewport = { width: 1280, height: 900 };
  const requests = [], checks = [], scenarios = [], pageErrors = [], contexts = [];
  const initialScripts = [], initialScriptMeasurements = [];
  const guards = { externalRequestsBlocked: 0, localMutationsBlocked: 0, webSocketsBlocked: 0 };
  const result = {
    engine: engine || browser.browserType().name(),
    scope: 'fresh isolated-loopback authenticated desktop dashboard; untouched baseline, real sidebar navigation and refresh/history, then fresh-context invoice pointer/focus intent with normal/SaveData/2G/slow-2G hints; external requests, non-GET/HEAD mutations and WebSockets blocked',
    limitations: ['Three-second settled baseline and constrained-intent observation; network-connection hints are browser overrides, not physical cellular throughput or latency.', 'Script gzipEstimateBytes is local gzip of decoded response bodies, not wire compression; request.sizes is separately recorded when available.'],
    viewport,
    observationMs: 3000,
    requests,
    checks,
    scenarios,
    pageErrors,
    guards,
    initialScripts,
  };
  let context, phase = 'dashboard-load';
  const guardedContext = async (connectionHint) => {
    const fresh = await browser.newContext({ baseURL: target.origin, storageState, viewport, serviceWorkers: 'block' });
    contexts.push(fresh);
    fresh.setDefaultTimeout(15000);
    fresh.setDefaultNavigationTimeout(30000);
    await fresh.addInitScript(origin => {
      // The initializer also runs in the fresh opaque about:blank document.
      // Seed only the actual target origin; do not mask any page errors.
      if (location.origin === origin) localStorage.setItem('fakturo_onboarding_completed_v2', 'true');
    }, target.origin);
    if (connectionHint) await fresh.addInitScript(hint => Object.defineProperty(navigator, 'connection', { configurable: true, value: hint }), connectionHint);
    fresh.on('page', page => page.on('pageerror', error => pageErrors.push({ phase, message: error.message })));
    fresh.on('request', request => requests.push(requestEvidence(request, target.origin, phase)));
    await fresh.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== target.origin) {
        guards.externalRequestsBlocked++;
        await route.abort();
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        guards.localMutationsBlocked++;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await fresh.routeWebSocket('**/*', socket => { guards.webSocketsBlocked++; socket.close(); });
    return fresh;
  };
  const assertNoErrors = () => assert.deepEqual(pageErrors, [], 'Private prefetch audit must fail on every live browser page error');
  const loadDashboard = async page => {
    const response = await page.goto('/dashboard', { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'Dashboard must render a real successful response');
    await expect(page).toHaveURL(url => normalizedPath(url.pathname) === '/dashboard');
    await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
    await expect(page.locator('main').getByRole('heading', { name: 'Przegląd', exact: true })).toBeVisible();
  };
  const navigationRoutes = entries => entries.filter(request => request.sameOrigin && isRouteRequest(request));
  const addScenario = scenario => {
    scenarios.push(scenario);
    recordBrowserScenario({ engine: result.engine, viewport }, scenario.name, scenario);
  };
  try {
    context = await guardedContext();
    context.on('response', response => {
      const request = response.request();
      if (!['dashboard-load', 'dashboard-settled'].includes(phase) || request.resourceType() !== 'script') return;
      const item = { path: new URL(response.url()).pathname, status: response.status(), contentEncoding: response.headers()['content-encoding'] || null };
      initialScripts.push(item);
      initialScriptMeasurements.push((async () => {
        try {
          const body = await response.body();
          item.decodedBytes = body.length;
          item.gzipEstimateBytes = gzipSync(body).length;
          item.observedResponseBodyBytes = (await request.sizes()).responseBodySize;
        } catch (error) { item.measurementError = error.message; }
      })());
    });

    const page = await context.newPage();
    await loadDashboard(page);
    const sidebar = page.locator('aside').getByRole('navigation', { name: 'Menu główne', exact: true });
    await expect(sidebar).toBeVisible();
    const analyticsLink = sidebar.locator('a[href="/analytics"]');
    await expect(analyticsLink).toBeVisible();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('a[href]') !== null), false, 'Baseline must not focus a navigation link');

    // No pointer movement, focus or control activation occurs before this snapshot.
    phase = 'dashboard-settled';
    await page.waitForTimeout(result.observationMs);
    await expect(page).toHaveURL(url => normalizedPath(url.pathname) === '/dashboard');
    const baselineRequests = requests.slice();
    const unrelated = navigationRoutes(baselineRequests).filter(request => request.path !== '/dashboard');
    result.backgroundRouteRequests = unrelated;
    assertNoErrors();
    assert.deepEqual(unrelated, [], 'Untouched dashboard must not fetch unrelated routes, including requests without RSC/prefetch hints');
    await Promise.all(initialScriptMeasurements);
    assert.deepEqual(initialScripts.filter(item => item.measurementError), [], 'Every initial script must have real response-body byte evidence');
    result.initialScriptSummary = { requests: initialScripts.length, uniquePaths: new Set(initialScripts.map(item => item.path)).size, decodedBytes: initialScripts.reduce((sum, item) => sum + item.decodedBytes, 0), gzipEstimateBytes: initialScripts.reduce((sum, item) => sum + item.gzipEstimateBytes, 0), observedResponseBodyBytes: initialScripts.reduce((sum, item) => sum + item.observedResponseBodyBytes, 0) };
    checks.push('Real authenticated desktop dashboard loaded without navigation intent or browser page errors');
    checks.push('Dashboard load and three-second settled observation fetched no unrelated navigation routes, with or without prefetch hints');
    const baseline = { name: 'private-dashboard-no-background-route-prefetch', route: '/dashboard', observationMs: result.observationMs, intentionalInteractions: 0, observedRequests: baselineRequests.length, unrelatedRoutePrefetchRequests: unrelated.length, pageErrors: pageErrors.length };
    addScenario(baseline);

    // This request is allowed only after the baseline has passed and a user clicks.
    phase = 'user-navigation';
    const navigationStart = requests.length;
    await analyticsLink.click();
    await expect(page).toHaveURL(url => normalizedPath(url.pathname) === '/analytics');
    await expect(page.locator('main').getByRole('heading', { name: 'Analityka', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const navigationRequests = requests.slice(navigationStart).filter(request => request.sameOrigin && request.path === '/analytics' && isRouteRequest(request));
    assert.ok(navigationRequests.length > 0, 'Sidebar navigation must request the real analytics route after the click');
    assertNoErrors();
    checks.push('One actual desktop sidebar click loaded analytics with a new route request and no browser page errors');
    const navigation = { name: 'private-sidebar-user-navigation-without-background-preload', routes: ['/dashboard', '/analytics'], destinationRequests: navigationRequests.length, destinationHeadingVisible: true, pageErrors: pageErrors.length };
    addScenario(navigation);

    // Keep listeners attached throughout the exact refresh/history sequence that
    // previously exposed canceled background RSC errors in WebKit.
    const historySteps = [];
    for (let iteration = 1; iteration <= 3; iteration++) {
      for (const [name, action, expectedPath] of [
        ['dashboard-goto', () => page.goto('/dashboard'), '/dashboard'],
        ['dashboard-reload', () => page.reload(), '/dashboard'],
        ['invoices-goto', () => page.goto('/invoices'), '/invoices'],
        ['back-dashboard', () => page.goBack(), '/dashboard'],
        ['forward-invoices', () => page.goForward(), '/invoices'],
      ]) {
        phase = `history-${iteration}-${name}`;
        await action();
        await expect(page).toHaveURL(url => normalizedPath(url.pathname) === expectedPath);
        await expect(page.locator('main h1').first()).toBeVisible();
        // SSR headings can appear before React starts the page's effects.
        // Wait for the existing hydration signal before measuring settled
        // traffic or leaving this document during the next history step.
        await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
        await page.waitForLoadState('networkidle');
        assertNoErrors();
        historySteps.push({ iteration, name, path: expectedPath, headingVisible: true, hydrationReady: true, pageErrors: pageErrors.length });
      }
    }
    addScenario({ name: 'private-refresh-back-forward-without-browser-errors', route: '/dashboard', steps: historySteps, pageErrors: pageErrors.length });
    checks.push('Three actual dashboard reload/invoices/back/forward cycles completed with no live browser errors');

    await context.close();
    context = undefined;
    assertNoErrors();

    for (const [mode, hint, expectedWarmup] of [
      ['normal', { saveData: false, effectiveType: '4g' }, true],
      ['save-data', { saveData: true, effectiveType: '4g' }, false],
      ['2g', { saveData: false, effectiveType: '2g' }, false],
      ['slow-2g', { saveData: false, effectiveType: 'slow-2g' }, false],
    ]) for (const intent of ['pointer', 'focus']) {
      phase = `invoice-intent-${mode}-${intent}-load`;
      context = await guardedContext(hint);
      const freshPage = await context.newPage(), loadStart = requests.length;
      await loadDashboard(freshPage);
      await freshPage.waitForLoadState('networkidle');
      const invoiceLink = freshPage.locator('aside').getByRole('link', { name: 'Wystaw fakturę', exact: true });
      await expect(invoiceLink).toBeVisible();
      assert.deepEqual(await freshPage.evaluate(() => ({ saveData: navigator.connection.saveData, effectiveType: navigator.connection.effectiveType })), hint, 'Browser must expose the actual tested connection hint');
      const beforeIntent = navigationRoutes(requests.slice(loadStart)).filter(request => request.path !== '/dashboard');
      assert.deepEqual(beforeIntent, [], `${mode}/${intent}: a fresh dashboard must not warm any unrelated route before user intent`);
      assertNoErrors();
      phase = `invoice-intent-${mode}-${intent}`;
      const intentStart = requests.length, responseStatuses = [];
      freshPage.on('response', response => {
        if (normalizedPath(new URL(response.url()).pathname) === '/invoices/new') responseStatuses.push(response.status());
      });
      if (intent === 'pointer') await invoiceLink.hover();
      else { await invoiceLink.focus(); await expect(invoiceLink).toBeFocused(); }
      if (expectedWarmup) {
        await expect.poll(() => navigationRoutes(requests.slice(intentStart)).filter(request => request.path === '/invoices/new').length).toBeGreaterThan(0);
        await expect.poll(() => responseStatuses.length).toBeGreaterThan(0);
      } else await freshPage.waitForTimeout(result.observationMs);
      await freshPage.waitForLoadState('networkidle');
      const intentRoutes = navigationRoutes(requests.slice(intentStart));
      const invoiceRequests = intentRoutes.filter(request => request.path === '/invoices/new');
      assert.deepEqual(intentRoutes.filter(request => request.path !== '/invoices/new'), [], `${mode}/${intent}: user intent must not warm unrelated destinations`);
      if (expectedWarmup) {
        assert.ok(invoiceRequests.length > 0, `${mode}/${intent}: actual user intent must request the invoice-form route`);
        assert.ok(responseStatuses.length > 0 && responseStatuses.every(status => status === 200), 'Invoice warmup must receive successful real route responses');
      } else assert.deepEqual(invoiceRequests, [], `${mode}/${intent}: constrained hints must skip invoice warmup`);
      assertNoErrors();
      const scenario = { name: `private-invoice-${intent}-warmup-${mode}`, route: '/dashboard', destination: '/invoices/new', mode, intent, connectionHint: hint, expectedWarmup, warmupRequests: invoiceRequests.length, responseStatuses, pageErrors: pageErrors.length };
      addScenario(scenario);
      checks.push(`${mode}/${intent}: real invoice-form route warmup ${expectedWarmup ? 'succeeded' : 'was skipped'} without unrelated requests or live errors`);
      await context.close();
      context = undefined;
      assertNoErrors();
    }
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[private-prefetch-browser] PASS ${result.engine}: ${scenarios.length} actual baseline/navigation/history/intent scenarios; ${result.initialScriptSummary.gzipEstimateBytes} B estimated initial script gzip`);
    return result;
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    for (const existing of contexts) await existing.close();
  }
}

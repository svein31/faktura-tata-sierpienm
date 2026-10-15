// Small read-only browser lab for named public production pages, never a load test.
// Run serially while builds, integration tests and other browser labs are stopped.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { options, numberOption, reportJson } from './metrics.mjs';

const args = options();
if (args.help) {
  console.log(`Public page loading lab (not CrUX, field CWV, Lighthouse or an SLA).
Usage: node scripts/performance/public-page-speed.mjs [options]
  --url https://fakturaprosto.pl     Named production site or its Netlify preview
  --phase before|after              Report label (default before)
  --profile primary-mobile         primary-mobile | mobile-slow | desktop-native
  --runs 3                         Cold trials per route (primary default 3, extras 1)
  --paths /,/cennik                 Subset of the four named public routes
  --expected-revision SHA           Stop before measuring an unexpected deployment
  --output artifacts/report.json   JSON result path

Equivalent PERF_BASE, PERF_PHASE, PERF_PROFILE, PERF_RUNS, PERF_PATHS,
PERF_EXPECTED_REVISION and PERF_OUTPUT environment variables are accepted.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH selects an installed Chromium; otherwise
Playwright's normal Chromium installation is used. Requires curl for read-only
health probes. Inherited HTTP(S) proxy and normal certificate trust are preserved.
CDP provides CPU/network throttling, cache control and telemetry blocking; this
script never disables TLS validation, changes HOME or installs certificates.
No performance threshold is used as a CI pass/fail gate.`);
  process.exit(0);
}

const publicPaths = ['/', '/cennik', '/program-do-faktur', '/narzedzia/kalkulator-vat'];
const base = args.url || process.env.PERF_BASE || 'https://fakturaprosto.pl';
assert.match(base, /^https:\/\/(fakturaprosto\.pl|deploy-preview-\d+--prostafv\.netlify\.app)$/, 'Only the named public site and its deployment previews are in scope');
const phase = args.phase || process.env.PERF_PHASE || 'before';
assert.match(phase, /^[a-zA-Z0-9_-]+$/, 'Phase must be a simple report label');
const profile = args.profile || process.env.PERF_PROFILE || 'primary-mobile';
assert.ok(['primary-mobile', 'mobile-slow', 'desktop-native'].includes(profile), 'Unknown profile');
const paths = (args.paths || process.env.PERF_PATHS || publicPaths.join(',')).split(',');
assert.ok(paths.length > 0 && paths.every(path => publicPaths.includes(path)), 'Paths must be a subset of the four named public routes');
assert.equal(new Set(paths).size, paths.length, 'Duplicate paths are not allowed');
const runs = numberOption(args.runs ?? process.env.PERF_RUNS, profile === 'primary-mobile' ? 3 : 1, 1, 5, 'runs');
const expectedRevision = args['expected-revision'] || process.env.PERF_EXPECTED_REVISION;
const output = args.output || process.env.PERF_OUTPUT || `artifacts/performance/public-page-${profile}-${phase}.json`;
const mobile = profile !== 'desktop-native';
const network = profile === 'mobile-slow'
  ? { latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750 }
  : { latencyMs: 80, downloadBytesPerSecond: 1250000, uploadBytesPerSecond: 625000 };
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const rounded = value => Number.isFinite(value) ? Math.round(value) : null;
const range = values => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
};

function health() {
  const raw = execFileSync('curl', ['--silent', '--show-error', '--max-time', '30', base + '/api/health'], { encoding: 'utf8' });
  const data = JSON.parse(raw);
  assert.ok(typeof data.revision === 'string' && data.revision, 'Health response lacks a revision');
  assert.equal(data.ok, true, 'Health response is not healthy');
  return { ok: data.ok, db: data.db, revision: data.revision, timestamp: data.timestamp };
}

async function measure(browser, path, run) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    // Blocking with CDP avoids writes and does not implicitly disable cache as
    // Playwright route() interception would. No consent choice is fabricated.
    await cdp.send('Network.setBlockedURLs', { urls: [base + '/api/pilot/events*'] });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (mobile) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: network.latencyMs,
        downloadThroughput: network.downloadBytesPerSecond,
        uploadThroughput: network.uploadBytesPerSecond,
        connectionType: profile === 'mobile-slow' ? 'cellular3g' : 'cellular4g',
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(() => {
      window.__publicSpeedLab = { lcps: [], shifts: [], tasks: [], reactHandlerMs: null };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__publicSpeedLab.lcps.push({
          at: entry.startTime, size: entry.size, tag: entry.element?.tagName,
          text: entry.element?.textContent?.slice(0, 150), url: entry.url || null,
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__publicSpeedLab.shifts.push({ at: entry.startTime, value: entry.value });
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__publicSpeedLab.tasks.push({ at: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
      const timer = setInterval(() => {
        const hasReactHandler = [...document.querySelectorAll('button')].some(element =>
          Object.keys(element).some(key => key.startsWith('__reactProps$') && typeof element[key]?.onClick === 'function'));
        if (hasReactHandler) {
          window.__publicSpeedLab.reactHandlerMs = performance.now();
          clearInterval(timer);
        }
      }, 100);
    });
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failures.push({
      url: request.url(), error: request.failure()?.errorText,
      deliberatelyBlockedTelemetry: request.url().startsWith(base + '/api/pilot/events'),
    }));
    const response = await page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
    assert.equal(response?.status(), 200, `Unexpected document status for ${path}`);
    // Keep late content candidates, including the default pending cookie banner.
    // No scrolling, clicking, consent dismissal, stored consent or keypress occurs.
    await page.waitForTimeout(5000);
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0], state = window.__publicSpeedLab;
      const lcp = state.lcps.at(-1) || null;
      let cls = 0, session = 0, first = 0, last = 0;
      for (const shift of state.shifts) {
        if (shift.at - last > 1000 || shift.at - first > 5000) { session = 0; first = shift.at; }
        session += shift.value; last = shift.at; cls = Math.max(cls, session);
      }
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      const resources = performance.getEntriesByType('resource').map(entry => ({
        url: entry.name, kind: entry.initiatorType, startMs: entry.startTime,
        durationMs: entry.duration, transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize, decodedBodyBytes: entry.decodedBodySize,
        renderBlocking: entry.renderBlockingStatus,
      }));
      // Include Next preloads and scripts such as Netlify HUD without a .js URL.
      const scripts = resources.filter(resource => resource.kind === 'script' || /\.js(?:\?|$)/.test(resource.url));
      const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);
      const bytes = items => ({
        transferBytes: sum(items, 'transferBytes'), encodedBodyBytes: sum(items, 'encodedBodyBytes'),
        decodedBodyBytes: sum(items, 'decodedBodyBytes'),
      });
      return {
        title: document.title,
        nextBuildMarker: [...document.childNodes].find(node => node.nodeType === Node.COMMENT_NODE)?.textContent ?? null,
        documentScriptSources: [...document.scripts].map(script => script.src).filter(Boolean),
        observedUntilMs: performance.now(), ttfbMs: nav.responseStart,
        serverWaitMs: nav.responseStart - nav.requestStart, responseEndMs: nav.responseEnd,
        domContentLoadedMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd,
        document: { transferBytes: nav.transferSize, encodedBodyBytes: nav.encodedBodySize, decodedBodyBytes: nav.decodedBodySize },
        fcpMs: fcp, lcpMs: lcp?.at ?? null, lcp, lcpCandidates: state.lcps, cls,
        reactInteractiveHandlerDetectedMs: state.reactHandlerMs,
        observedPostFcpBlockingMs: state.tasks.filter(task => task.at >= (fcp || 0))
          .reduce((total, task) => total + Math.max(0, task.duration - 50), 0),
        longTasks: state.tasks, resources, javaScript: { count: scripts.length, ...bytes(scripts) },
        allResourceBytes: bytes(resources),
        skeletonsAtObservationEnd: document.querySelectorAll('[data-slot="skeleton"],.animate-pulse,[aria-busy="true"]').length,
        cookieTextPresent: document.body.innerText.includes('Cookies niezbędne'),
      };
    });
    return {
      path, profile, cache: 'cold-browser', run, status: response.status(), measuredAt: new Date().toISOString(),
      headers: Object.fromEntries(['cache-control', 'content-encoding', 'age', 'x-nextjs-cache', 'x-nf-request-id']
        .map(name => [name, response.headers()[name] ?? null])),
      ...metrics, errors, failures,
    };
  } finally { await context.close(); }
}

const measuredAt = new Date().toISOString();
const healthBefore = health();
if (expectedRevision) assert.equal(healthBefore.revision, expectedRevision, 'Unexpected deployment before measurement');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, proxy: proxyServer ? { server: proxyServer } : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const measurements = [];
const method = {
  type: 'Remote browser laboratory; not CrUX, field CWV, Lighthouse or an SLA', profile,
  viewport: mobile ? '390x844' : '1440x1000', cpuSlowdown: mobile ? 4 : 1,
  network: mobile ? network : 'Native transport, no added throttling',
  networkPath: proxyServer ? 'Inherited HTTP(S) proxy with normal verified certificate trust -> CDN' : 'Native verified HTTPS -> CDN',
  cache: 'Fresh browser context per cold trial; browser cache explicitly disabled; CDN may be warm',
  serviceWorkers: 'Blocked',
  cookieConsent: 'New visitor default pending, untouched and visible; no stored consent or choice',
  sampling: '5 seconds after load; no scroll, click or keypress; all observed LCP candidates retained, including late consent text',
  hydration: 'First React onClick property found on a button, sampled every 100ms; approximation, not application data readiness or a field metric',
  transfer: 'Actual ResourceTiming: encodedBodySize=compressed CDN body; decodedBodySize=raw uncompressed body; transferSize=browser network bytes including response overhead. JavaScript includes all observed script initiators and .js preloads, not just initial HTML scripts.',
  exclusions: 'No PDF, KSeF, login, mail, customer data or business writes. Automatic /api/pilot/events* telemetry blocked identically by CDP before and after.',
  statistic: 'Median and range for each named profile/path; a few lab trials are not a real-user percentile or timing guarantee',
};
try {
  for (const path of paths) for (let run = 1; run <= runs; run++) {
    const item = await measure(browser, path, run);
    measurements.push(item);
    console.log(JSON.stringify({
      path, profile, run, status: item.status, ttfbMs: rounded(item.ttfbMs),
      fcpMs: rounded(item.fcpMs), lcpMs: rounded(item.lcpMs), loadMs: rounded(item.loadMs),
      reactHandlerMs: rounded(item.reactInteractiveHandlerDetectedMs),
      javaScriptEncodedBytes: item.javaScript.encodedBodyBytes, javaScriptRawBytes: item.javaScript.decodedBodyBytes,
      errors: item.errors.length, unexpectedFailures: item.failures.filter(failure => !failure.deliberatelyBlockedTelemetry).length,
    }));
    await reportJson(output, { incomplete: true, phase, measuredAt, base, method, healthBefore, measurements });
  }
  const summary = paths.map(path => {
    const data = measurements.filter(item => item.path === path);
    return {
      path, profile, cache: 'cold-browser', runs: data.length,
      ...Object.fromEntries(['ttfbMs', 'serverWaitMs', 'fcpMs', 'lcpMs', 'domContentLoadedMs', 'loadMs', 'reactInteractiveHandlerDetectedMs', 'observedPostFcpBlockingMs', 'cls']
        .map(name => [name, median(data.map(item => item[name]))])),
      fcpRangeMs: range(data.map(item => item.fcpMs)), lcpRangeMs: range(data.map(item => item.lcpMs)),
      javaScriptEncodedBytes: median(data.map(item => item.javaScript.encodedBodyBytes)),
      javaScriptRawBytes: median(data.map(item => item.javaScript.decodedBodyBytes)),
    };
  });
  const healthAfter = health();
  const revisionStable = healthBefore.revision === healthAfter.revision;
  const buildMarkers = [...new Set(measurements.map(item => item.nextBuildMarker))];
  const buildStable = buildMarkers.length === 1 && typeof buildMarkers[0] === 'string';
  await reportJson(output, {
    schemaVersion: 2, incomplete: false, phase, measuredAt, completedAt: new Date().toISOString(),
    base, browser: browser.version(), healthBefore, healthAfter, revisionStable, buildMarkers, buildStable, method, summary, measurements,
  });
  if (!revisionStable || !buildStable) console.warn('Deployment revision or public build marker changed/missing. Do not use this report as a confirmed comparable baseline.');
  console.log(JSON.stringify({ output, revisionStable, buildStable, summary }));
} finally { await browser.close(); }

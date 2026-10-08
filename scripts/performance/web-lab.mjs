// A cold-browser lab measurement, not production Core Web Vitals or a Lighthouse score.
import { chromium } from '@playwright/test';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { options, numberOption, assertLoopback, rounded, percentile, reportJson } from './metrics.mjs';

const args = options();
const base = assertLoopback(args.url || 'http://127.0.0.1:3001');
const runs = numberOption(args.runs, 3, 1, 10, 'runs');
const path = args.path || '/';
if (!path.startsWith('/') || path.startsWith('//')) throw new Error('--path must be an origin-relative path');
const reportPath = args.output || 'artifacts/performance/web-lab.json';
const compression = buffer => ({ rawBytes: buffer.length, gzipBytes: gzipSync(buffer, { level: 9 }).length, brotliBytes: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length });
const firstRequest = performance.now();
const htmlResponse = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
const originTtfbMs = performance.now() - firstRequest;
if (!htmlResponse.ok) throw new Error(`Unexpected document status ${htmlResponse.status}`);
const html = await htmlResponse.text();
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
// Next emits a nomodule fallback. Modern mobile browsers do not download it.
const scriptPaths = [...new Set(scriptTags.filter(match => !/\bnomodule\b|\bnoModule\b/.test(match[0])).map(match => match[1].replaceAll('&amp;', '&')))];
const legacyPaths = [...new Set(scriptTags.filter(match => /\bnomodule\b|\bnoModule\b/.test(match[0])).map(match => match[1].replaceAll('&amp;', '&')))];
const cssPaths = [...new Set([...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match => match[1]))];
async function assetSizes(paths) {
  return Promise.all(paths.map(async path => {
    const url = new URL(path, base);
    if (url.origin !== base) return { path, external: true };
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Asset ${path}: HTTP ${response.status}`);
    return { path, ...compression(Buffer.from(await response.arrayBuffer())), cacheControl: response.headers.get('cache-control'), contentEncoding: response.headers.get('content-encoding') };
  }));
}
const scripts = await assetSizes(scriptPaths), stylesheets = await assetSizes(cssPaths), legacyScripts = await assetSizes(legacyPaths);
const browser = await chromium.launch({ headless: true });
const measurements = [];
try {
  for (let index = 0; index < runs; index++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular3g' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__lab = { lcp: null, shifts: [], events: [], longTasks: [] };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lab.lcp = { startTime: entry.startTime, size: entry.size, element: entry.element?.tagName, text: entry.element?.textContent?.slice(0, 80) }; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__lab.shifts.push({ at: entry.startTime, value: entry.value }); }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lab.events.push({ name: entry.name, duration: entry.duration, start: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, interactionId: entry.interactionId }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lab.longTasks.push({ at: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
    });
    const responses = [], responseTasks = [];
    page.on('response', response => {
      const kind = response.request().resourceType();
      if (!['script', 'stylesheet', 'font', 'image'].includes(kind)) return;
      responseTasks.push((async () => {
        try { responses.push({ url: response.url().replace(base, ''), kind, status: response.status(), ...compression(await response.body()) }); } catch { /* Resource canceled by deliberate context teardown. */ }
      })());
    });
    await page.goto(base + path, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);
    const cookieButton = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
    let interaction = 'none';
    if (await cookieButton.isVisible()) { await cookieButton.tap(); interaction = 'cookie consent rejection'; }
    await page.waitForTimeout(1000);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0], state = window.__lab;
      let maxSession = 0, session = 0, first = 0, last = 0;
      for (const shift of state.shifts) {
        if (shift.at - last > 1000 || shift.at - first > 5000) { session = 0; first = shift.at; }
        session += shift.value; last = shift.at; maxSession = Math.max(maxSession, session);
      }
      return {
        ttfbMs: navigation.responseStart - navigation.startTime,
        documentTransferBytes: navigation.transferSize, domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd, lcpMs: state.lcp?.startTime ?? null, lcpElement: state.lcp,
        cls: maxSession,
        maxObservedInteractionDurationMs: Math.max(0, ...state.events.filter(event => event.interactionId > 0).map(event => event.duration)),
        interactionEntries: state.events, longTasks: state.longTasks,
        postFcpBlockingMs: state.longTasks.filter(task => task.at >= (performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0)).reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
        resourceTimings: performance.getEntriesByType('resource').map(entry => ({ path: entry.name.replace(location.origin, ''), initiatorType: entry.initiatorType, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize, startMs: entry.startTime, durationMs: entry.duration, renderBlockingStatus: entry.renderBlockingStatus })),
      };
    });
    await Promise.allSettled(responseTasks);
    const javaScript = responses.filter(resource => resource.kind === 'script');
    const measured = { run: index + 1, interaction, ...metrics, resources: responses, pageErrors: [...pageErrors], loadedDuringObservationJavaScript: { count: javaScript.length, gzipBytes: javaScript.reduce((sum, resource) => sum + resource.gzipBytes, 0) } };
    measurements.push(measured);
    console.log(`[performance] Run ${index + 1}: TTFB ${rounded(metrics.ttfbMs)} ms; LCP ${rounded(metrics.lcpMs)} ms; CLS ${metrics.cls}; sampled interaction ${metrics.maxObservedInteractionDurationMs} ms`);
    await context.close();
  }
} finally { await browser.close(); }
let revision = 'unknown', buildId = 'unknown';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim(); } catch { /* Metadata is optional for archives. */ }
const report = {
  schemaVersion: 1, measuredAt: new Date().toISOString(), revision, buildId, base, path,
  method: { browser: 'Chromium', viewport: '390x844', cpuSlowdown: 4, network: { latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750 }, cache: 'disabled', serviceWorkers: 'blocked', runs, interactionNote: 'Maximum observed EventTiming duration from one scripted interaction; this is a lab sample, not field INP. 0 means no qualifying >=16 ms entry was observed.', compressionNote: 'gzip level 9 / Brotli quality 11 sizes are computed from decoded source; they are potential CDN transfer sizes, not claims about deployed encoding.' },
  originProbe: { ttfbMs: rounded(originTtfbMs), headers: Object.fromEntries(['cache-control', 'content-encoding', 'content-type', 'vary', 'x-nextjs-cache'].map(name => [name, htmlResponse.headers.get(name)])), html: compression(Buffer.from(html)) },
  initialDocumentScripts: { count: scripts.length, rawBytes: scripts.reduce((sum, item) => sum + (item.rawBytes || 0), 0), gzipBytes: scripts.reduce((sum, item) => sum + (item.gzipBytes || 0), 0), brotliBytes: scripts.reduce((sum, item) => sum + (item.brotliBytes || 0), 0), resources: scripts },
  legacyNomoduleScripts: legacyScripts,
  initialDocumentStylesheets: { count: stylesheets.length, gzipBytes: stylesheets.reduce((sum, item) => sum + (item.gzipBytes || 0), 0), resources: stylesheets },
  median: { ttfbMs: percentile(measurements.map(item => item.ttfbMs), .5), lcpMs: percentile(measurements.map(item => item.lcpMs), .5), cls: percentile(measurements.map(item => item.cls), .5), maxObservedInteractionDurationMs: percentile(measurements.map(item => item.maxObservedInteractionDurationMs), .5) },
  measurements,
};
await reportJson(reportPath, report);
console.log(`[performance] Initial document JS: ${rounded(report.initialDocumentScripts.gzipBytes / 1024)} KiB gzip; CSS: ${rounded(report.initialDocumentStylesheets.gzipBytes / 1024)} KiB gzip`);
if (measurements.some(measurement => measurement.pageErrors.length)) process.exitCode = 1;

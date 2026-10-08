// Lighthouse is deliberately an optional external tool, not a production dependency.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { options, numberOption, assertLoopback, percentile, reportJson } from './metrics.mjs';

const args = options();
const base = assertLoopback(args.url || 'http://127.0.0.1:3001');
const runs = numberOption(args.runs, 3, 1, 10, 'runs');
const output = args.output || 'artifacts/performance/lighthouse-mobile.json';
const binary = resolve(args.binary || '/tmp/faktura-performance-tools/node_modules/lighthouse/cli/index.js');
const rawDirectory = resolve(args['raw-dir'] || dirname(output) + '/lighthouse-raw');
try { await access(binary); } catch { throw new Error('Install optional Lighthouse outside the project: npm install --prefix /tmp/faktura-performance-tools --ignore-scripts --no-package-lock --no-audit --no-fund lighthouse'); }
await mkdir(rawDirectory, { recursive: true });
const measurements = [];
for (let run = 1; run <= runs; run++) {
  const path = `${rawDirectory}/run-${run}.json`;
  const child = spawn(process.execPath, [binary, base + '/', '--only-categories=performance', '--form-factor=mobile', '--throttling-method=simulate', '--output=json', `--output-path=${path}`, '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage', '--quiet'], { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: ['ignore', 'inherit', 'inherit'], timeout: 180000 });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Lighthouse exited ${code}`);
  const raw = JSON.parse(await readFile(path, 'utf8'));
  if (raw.runtimeError) throw new Error(`Lighthouse failed: ${raw.runtimeError.message}`);
  const metric = key => raw.audits[key]?.numericValue ?? null;
  const measurement = {
    run, measuredAt: raw.fetchTime, lighthouseVersion: raw.lighthouseVersion, performanceScore: Math.round(raw.categories.performance.score * 100),
    fcpMs: metric('first-contentful-paint'), lcpMs: metric('largest-contentful-paint'), speedIndexMs: metric('speed-index'), tbtMs: metric('total-blocking-time'), cls: metric('cumulative-layout-shift'),
    serverResponseTimeMs: metric('server-response-time'), warnings: raw.runWarnings,
    environment: raw.environment, configuration: raw.configSettings,
    diagnostics: Object.fromEntries(Object.entries(raw.audits).filter(([, audit]) => audit.details?.type === 'opportunity' || audit.score !== null && audit.score < .9).map(([id, audit]) => [id, { title: audit.title, displayValue: audit.displayValue, numericValue: audit.numericValue, score: audit.score, details: audit.details }])),
    rawReport: path,
  };
  measurements.push(measurement);
  console.log(`[performance] Lighthouse run ${run}: ${measurement.performanceScore}/100; LCP ${Math.round(measurement.lcpMs)} ms; TBT ${Math.round(measurement.tbtMs)} ms; CLS ${measurement.cls}`);
}
await reportJson(output, {
  schemaVersion: 1, measuredAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(), base,
  method: { tool: 'Lighthouse', formFactor: 'mobile', throttling: 'simulated (Lighthouse defaults, recorded per run)', cache: 'fresh browser per CLI run', note: 'This score is a local lab result. It does not measure production edge latency, cold serverless functions, field INP or the distribution of real devices.' },
  median: Object.fromEntries(['performanceScore', 'fcpMs', 'lcpMs', 'speedIndexMs', 'tbtMs', 'cls', 'serverResponseTimeMs'].map(key => [key, percentile(measurements.map(item => item[key]).filter(Number.isFinite), .5)])), measurements,
});

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function options(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    assert.ok(argv[index].startsWith('--'), 'Arguments must use --name value');
    const key = argv[index].slice(2);
    result[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

export function numberOption(value, fallback, min, max, name) {
  const parsed = value === undefined ? fallback : Number(value);
  assert.ok(Number.isInteger(parsed) && parsed >= min && parsed <= max, `${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

export function assertLoopback(value) {
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Measurements accept only loopback URLs; never run this load generator against production');
  assert.equal(url.username + url.password, '', 'Credentials must not be supplied in URLs');
  return url.origin;
}

export const rounded = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = values.toSorted((left, right) => left - right);
  return rounded(sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)]);
}

export function summary(samples, elapsedMs) {
  const successful = samples.filter(sample => sample.ok);
  return {
    requests: samples.length, successful: successful.length, errors: samples.length - successful.length,
    errorRate: Number((samples.length ? (samples.length - successful.length) / samples.length : 0).toFixed(6)),
    requestsPerSecond: rounded(samples.length * 1000 / elapsedMs),
    latencyMs: { p50: percentile(samples.map(sample => sample.elapsedMs), 0.5), p95: percentile(samples.map(sample => sample.elapsedMs), 0.95), p99: percentile(samples.map(sample => sample.elapsedMs), 0.99), max: rounded(samples.reduce((maximum, sample) => Math.max(maximum, sample.elapsedMs), 0)) },
    ttfbMs: { p50: percentile(samples.map(sample => sample.ttfbMs).filter(Number.isFinite), 0.5), p95: percentile(samples.map(sample => sample.ttfbMs).filter(Number.isFinite), 0.95) },
    bytes: samples.reduce((sum, sample) => sum + (sample.bytes || 0), 0),
    statusCounts: Object.fromEntries([...new Set(samples.map(sample => String(sample.status)))].map(status => [status, samples.filter(sample => String(sample.status) === status).length])),
  };
}

export async function reportJson(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.log(`[performance] Report: ${path}`);
}

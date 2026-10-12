import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertLoopback, percentile, summary } from './metrics.mjs';

test('load measurement rejects remote and credential-bearing targets', () => {
  assert.equal(assertLoopback('http://127.0.0.1:3001/path'), 'http://127.0.0.1:3001');
  assert.throws(() => assertLoopback('https://fakturaprosto.pl'), /only loopback/);
  assert.throws(() => assertLoopback('http://localhost.attacker.example'), /only loopback/);
  assert.throws(() => assertLoopback('http://secret@localhost'), /Credentials/);
  const child = spawnSync(process.execPath, ['scripts/performance/load-isolated.mjs', '--url', 'https://fakturaprosto.pl'], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /production URLs\/databases are forbidden/);
});

test('percentiles include failing requests and report their status separately', () => {
  assert.equal(percentile([], .95), null);
  assert.equal(percentile([1, 2, 50, 100], .5), 2);
  const result = summary([{ ok: true, status: 200, elapsedMs: 10, ttfbMs: 5, bytes: 10 }, { ok: false, status: 500, elapsedMs: 90, ttfbMs: 80, bytes: 20 }], 1000);
  assert.equal(result.errors, 1); assert.equal(result.errorRate, .5);
  assert.equal(result.latencyMs.p95, 90); assert.equal(result.requestsPerSecond, 2);
  assert.deepEqual(result.statusCounts, { 200: 1, 500: 1 });
  const large = summary(Array.from({ length: 1000 }, (_, index) => ({ ok: index > 0, status: index > 0 ? 200 : 500, elapsedMs: 10, ttfbMs: 5, bytes: 1 })), 1000);
  assert.equal(large.errors, 1); assert.equal(large.errorRate, .001, 'Low error rates must not round down to a false zero');
  const outlier = summary(Array.from({ length: 1000 }, (_, index) => ({ ok: true, status: 200, elapsedMs: index === 0 ? 1000 : 10, ttfbMs: 5, bytes: 1 })), 1000);
  assert.equal(outlier.latencyMs.p99, 10, 'Percentiles can conceal a latency-budget violation');
  assert.equal(outlier.oneSecondBudget.atOrAbove, 1); assert.equal(outlier.oneSecondBudget.below, 999);
  assert.equal(outlier.oneSecondBudget.exceededFraction, .001); assert.equal(outlier.oneSecondBudget.allRequestsBelow, false, 'Exactly one second does not satisfy the strict user target');
  assert.equal(summary([], 1000).oneSecondBudget.allRequestsBelow, false, 'An empty run is not a verified latency goal');
});

test('isolated server preload blocks both HTTP clients and fetch before dispatch', () => {
  const child = spawnSync(process.execPath, ['--require', './scripts/performance/loopback-only.cjs', '-e', `
    const assert = require('node:assert/strict');
    assert.throws(() => require('node:https').get('https://api.stripe.com'), /blocked/);
    assert.throws(() => require('node:http').request({ hostname: 'api.ksef.mf.gov.pl' }), /blocked/);
    assert.throws(() => new (require('node:net').Socket)().connect({ host: 'smtp.example.com', port: 587 }), /blocked/);
    assert.throws(() => fetch('https://fakturaprosto.pl'), /blocked/);
  `], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});

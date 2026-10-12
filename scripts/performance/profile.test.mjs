import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseProcessStat, processDelta, counterDelta, queryProfileSummary } from './profile.mjs';

test('Linux process accounting handles parenthesized names and refuses PID recycling', () => {
  const fields = Array.from({ length: 22 }, () => '0');
  fields[0] = 'S'; fields[11] = '125'; fields[12] = '25'; fields[19] = '1234'; fields[21] = '20';
  assert.deepEqual(parseProcessStat('12 (next-server (test)) ' + fields.join(' ')), { userTicks: 125, systemTicks: 25, startTicks: 1234, rssPages: 20 });
  assert.throws(() => parseProcessStat('12 (broken) S'), /Incomplete/);
  const before = { application: { available: true, pid: 12, startTicks: 1234, measuredAtMs: 1000, userTicks: 100, systemTicks: 10, rssPages: 10 } };
  const after = { application: { available: true, pid: 12, startTicks: 1234, measuredAtMs: 2000, userTicks: 125, systemTicks: 15, rssPages: 20 } };
  const result = processDelta(before, after, { clockTicksPerSecond: 100, pageBytes: 4096 }).application;
  assert.equal(result.cpuMs.total, 300); assert.equal(result.cpuPercentOfOneCore, 30);
  assert.deepEqual(result.rssBytes, { before: 40960, after: 81920 });
  assert.equal(processDelta(before, { application: { ...after.application, startTicks: 9999 } }, { clockTicksPerSecond: 100, pageBytes: 4096 }).application.available, false);
});

test('Mongo profiling exposes operation costs without commands, tenant filters or credentials', () => {
  const result = queryProfileSummary([
    { ns: 'isolated.Session', op: 'command', millis: 2, docsExamined: 1, keysExamined: 1, nreturned: 1, planSummary: 'IXSCAN { sessionToken: 1 }', command: { aggregate: 'Session', pipeline: [{ $match: { sessionToken: 'secret-bearer' } }] } },
    { ns: 'isolated.Session', op: 'command', millis: 3, docsExamined: 1, keysExamined: 1, nreturned: 1, command: { aggregate: 'Session' } },
    { ns: 'isolated.system.profile', op: 'query', millis: 1, command: { find: 'system.profile' } },
  ]);
  assert.equal(result.recordedOperations, 2); assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].serverMillis, 5); assert.equal(result.groups[0].documentsExamined, 2);
  assert.equal(result.groups[0].operation, 'aggregate');
  assert.ok(!JSON.stringify(result).includes('secret-bearer')); assert.ok(!JSON.stringify(result).includes('pipeline'));
  assert.deepEqual(counterDelta({ query: 10, getmore: 5 }, { query: 15, getmore: 7 }), { query: 5, getmore: 2 });
});

test('diagnostic preload stays inert outside an explicitly enabled IPC harness', () => {
  const child = spawnSync(process.execPath, ['--require', './scripts/performance/process-telemetry.cjs', '-e', 'console.log("done")'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), 'done');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cpuProfileSummary, cpuProfileCommand } from './profile.mjs';

test('CPU summary weights samples and distinguishes self from inclusive CPU', () => {
  const profile = {
    startTime: 1000, endTime: 7000,
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1, columnNumber: -1 }, children: [2] },
      { id: 2, callFrame: { functionName: 'parent', url: 'app.js', lineNumber: 2, columnNumber: 0 }, children: [3] },
      { id: 3, callFrame: { functionName: 'hot', url: 'app.js', lineNumber: 3, columnNumber: 4 } },
    ],
    samples: [3, 2, 3], timeDeltas: [1000, 2000, 3000],
  };
  const summary = cpuProfileSummary(profile);
  assert.equal(summary.samples, 3); assert.equal(summary.sampledDurationMs, 6);
  assert.equal(summary.topSelf[0].function, 'hot'); assert.equal(summary.topSelf[0].sampledMs, 4);
  assert.equal(summary.topSelf[0].line, 4); assert.equal(summary.topSelf[0].column, 5);
  assert.equal(summary.topInclusive.find(frame => frame.function === 'parent').sampledMs, 6);
  assert.equal(cpuProfileSummary({ ...profile, timeDeltas: undefined }).sampledDurationMs, 6);
  assert.equal(cpuProfileSummary({ ...profile, samples: [] }).sampledDurationMs, 0);
});

test('CPU preload stays inert without both explicit enablement and harness IPC', () => {
  for (const enabled of [undefined, '1']) {
    const child = spawnSync(process.execPath, ['--require', './scripts/performance/process-cpu-profile.cjs', '-e', 'console.log("done")'], { encoding: 'utf8', env: { PATH: process.env.PATH, ...(enabled ? { ISOLATED_PERFORMANCE_CPU_PROFILE: enabled, ISOLATED_PERFORMANCE_CPU_DIRECTORY: tmpdir() } : {}) } });
    assert.ifError(child.error); assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), 'done');
  }
});

test('native inspector records real per-segment files without opening a network port', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isolated-cpu-test-'));
  const child = spawn(process.execPath, ['--require', './scripts/performance/process-cpu-profile.cjs', '-e', `
    function measuredWork() { const end = Date.now() + 5; while (Date.now() < end) Math.sqrt(Math.random()); }
    setInterval(measuredWork, 10);
    process.send({ ready: true, inspectorUrl: require('node:inspector').url() });
  `], { env: { PATH: process.env.PATH, ISOLATED_PERFORMANCE_CPU_PROFILE: '1', ISOLATED_PERFORMANCE_CPU_DIRECTORY: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  try {
    const [message] = await once(child, 'message');
    assert.equal(message.ready, true); assert.equal(message.inspectorUrl, undefined);
    await cpuProfileCommand(child, 'start');
    await assert.rejects(cpuProfileCommand(child, 'start'), /already active/);
    await new Promise(resolve => setTimeout(resolve, 70));
    await assert.rejects(cpuProfileCommand(child, 'stop', '../escape.cpuprofile'), /local basename/);
    const first = await cpuProfileCommand(child, 'stop', 'worker-1-stage-1.cpuprofile');
    const profile = JSON.parse(await readFile(first.filePath, 'utf8'));
    assert.ok(profile.samples.length > 0); assert.ok(cpuProfileSummary(profile).durationMs > 0);
    assert.ok(profile.nodes.some(node => node.callFrame.functionName === 'measuredWork'));
    await assert.rejects(cpuProfileCommand(child, 'stop', 'worker-1-stage-2.cpuprofile'), /No isolated CPU profile/);
    await cpuProfileCommand(child, 'start');
    await new Promise(resolve => setTimeout(resolve, 30));
    const second = await cpuProfileCommand(child, 'stop', 'worker-1-stage-2.cpuprofile');
    assert.notEqual(second.filePath, first.filePath);
    assert.ok(JSON.parse(await readFile(second.filePath, 'utf8')).samples.length > 0);
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    await rm(directory, { recursive: true, force: true });
  }
});

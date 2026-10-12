import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { rounded } from './metrics.mjs';

export function parseProcessStat(text) {
  // Linux comm is parenthesized and may itself contain spaces and parentheses.
  const fields = text.slice(text.lastIndexOf(')') + 1).trim().split(/\s+/);
  if (fields.length < 22) throw new Error('Incomplete Linux process stat');
  const values = { userTicks: Number(fields[11]), systemTicks: Number(fields[12]), startTicks: Number(fields[19]), rssPages: Number(fields[21]) };
  if (!Object.values(values).every(Number.isFinite)) throw new Error('Invalid Linux process stat');
  return values;
}

export function processUnits() {
  if (process.platform !== 'linux') return null;
  try {
    const clockTicksPerSecond = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
    const pageBytes = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }).trim());
    return clockTicksPerSecond > 0 && pageBytes > 0 ? { clockTicksPerSecond, pageBytes } : null;
  } catch { return null; }
}

export async function processSnapshot(pids, units) {
  return Object.fromEntries(await Promise.all(Object.entries(pids).map(async ([name, pid]) => {
    if (!units || !Number.isInteger(pid)) return [name, { available: false }];
    try { return [name, { available: true, pid, measuredAtMs: performance.now(), ...parseProcessStat(await readFile(`/proc/${pid}/stat`, 'utf8')) }]; }
    catch { return [name, { available: false, pid }]; }
  })));
}

export function processDelta(before, after, units) {
  return Object.fromEntries(Object.keys(before).map(name => {
    const start = before[name], end = after[name];
    if (!units || !start?.available || !end?.available || start.pid !== end.pid || start.startTicks !== end.startTicks) return [name, { available: false }];
    const elapsedMs = end.measuredAtMs - start.measuredAtMs;
    const userMs = (end.userTicks - start.userTicks) * 1000 / units.clockTicksPerSecond;
    const systemMs = (end.systemTicks - start.systemTicks) * 1000 / units.clockTicksPerSecond;
    return [name, { available: true, elapsedMs: rounded(elapsedMs), cpuMs: { user: rounded(userMs), system: rounded(systemMs), total: rounded(userMs + systemMs) }, cpuPercentOfOneCore: rounded((userMs + systemMs) * 100 / elapsedMs), rssBytes: { before: start.rssPages * units.pageBytes, after: end.rssPages * units.pageBytes } }];
  }));
}

export function counterDelta(before, after) {
  return Object.fromEntries(Object.keys(after || {}).filter(key => typeof after[key] === 'number' && typeof before?.[key] === 'number').map(key => [key, after[key] - before[key]]));
}

export function queryProfileSummary(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const collection = String(entry.ns || '').split('.').slice(1).join('.');
    if (!collection || collection === 'system.profile') continue;
    const command = entry.command || {}, operation = entry.op === 'command' ? ['aggregate', 'find', 'getMore', 'insert', 'update', 'delete', 'findAndModify', 'count', 'commitTransaction', 'abortTransaction'].find(key => Object.hasOwn(command, key)) || entry.op : entry.op;
    const key = `${collection}:${operation}`;
    const group = groups.get(key) || { collection, operation, operations: 0, serverMillis: 0, documentsExamined: 0, keysExamined: 0, documentsReturned: 0, planSummaries: new Set() };
    group.operations++; group.serverMillis += Number(entry.millis || 0);
    group.documentsExamined += Number(entry.docsExamined || 0); group.keysExamined += Number(entry.keysExamined || 0); group.documentsReturned += Number(entry.nreturned || 0);
    if (typeof entry.planSummary === 'string') group.planSummaries.add(entry.planSummary);
    groups.set(key, group);
  }
  return { recordedOperations: [...groups.values()].reduce((sum, group) => sum + group.operations, 0), groups: [...groups.values()].map(group => ({ ...group, planSummaries: [...group.planSummaries] })).sort((left, right) => right.operations - left.operations), limitation: 'Serial preflight only; profiler disabled during warm-up and load phases. Mongo command milliseconds do not include Prisma/application CPU or network waiting. Raw commands, filters, documents and credentials are never included.' };
}

export function cpuProfileSummary(profile, limit = 25) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
  const samples = profile.samples || [], fallbackMicros = samples.length ? (profile.endTime - profile.startTime) / samples.length : 0;
  const durations = samples.map((id, index) => Number.isFinite(profile.timeDeltas?.[index]) && profile.timeDeltas[index] >= 0 ? profile.timeDeltas[index] : fallbackMicros);
  const totalMicros = durations.reduce((sum, value) => sum + value, 0), self = new Map(), inclusive = new Map();
  for (let index = 0; index < samples.length; index++) {
    const id = samples[index], duration = durations[index];
    self.set(id, (self.get(id) || 0) + duration);
    const visited = new Set();
    for (let ancestor = id; ancestor !== undefined && !visited.has(ancestor); ancestor = parents.get(ancestor)) {
      visited.add(ancestor); inclusive.set(ancestor, (inclusive.get(ancestor) || 0) + duration);
    }
  }
  function frames(timing) {
    const groups = new Map();
    for (const [id, micros] of timing) {
      const frame = nodes.get(id)?.callFrame || {}, key = JSON.stringify([frame.functionName, frame.url, frame.lineNumber, frame.columnNumber]);
      const group = groups.get(key) || { function: frame.functionName || '(anonymous)', url: frame.url || '', line: Number.isInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null, column: Number.isInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber + 1 : null, micros: 0 };
      group.micros += micros; groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => right.micros - left.micros).slice(0, limit).map(({ micros, ...frame }) => ({ ...frame, sampledMs: rounded(micros / 1000), percentOfSampledTime: rounded(totalMicros ? micros * 100 / totalMicros : 0) }));
  }
  return { samples: samples.length, durationMs: rounded((profile.endTime - profile.startTime) / 1000), sampledDurationMs: rounded(totalMicros / 1000), topSelf: frames(self), topInclusive: frames(inclusive), limitation: 'Inspector samples this application worker JavaScript thread, including idle/GC time. Inclusive frames overlap and aggregated recursive frames may exceed 100%. CPU outside the sampled thread, including native Prisma workers/subprocesses, database, load generator and HTTP proxy, is excluded. Profiling changes timing; this is diagnostic evidence, not the primary capacity result.' };
}

let cpuRequestSequence = 0;
export function cpuProfileCommand(child, command, fileName) {
  if (!child.connected || child.exitCode !== null || child.signalCode !== null) return Promise.reject(new Error('Isolated application worker is unavailable for CPU profiling'));
  return new Promise((resolve, reject) => {
    const requestId = `${process.pid}-${++cpuRequestSequence}`;
    const timeout = setTimeout(() => finish(new Error('Isolated CPU profiler acknowledgement timed out')), 15000);
    let finished = false;
    function finish(error, result) { if (finished) return; finished = true; clearTimeout(timeout); child.off('message', onMessage); child.off('exit', onExit); error ? reject(error) : resolve(result); }
    function onExit() { finish(new Error('Isolated application worker exited during CPU profiling')); }
    function onMessage(message) {
      if (message?.type === 'isolated-performance-cpu-result' && message.requestId === requestId) finish(message.ok ? null : new Error(message.error), message);
    }
    child.on('message', onMessage); child.once('exit', onExit);
    child.send({ type: 'isolated-performance-cpu-control', command, requestId, ...(fileName ? { fileName } : {}) }, error => { if (error) finish(error); });
  });
}

// Closed-model local capacity experiment: a fresh Mongo replica set and production Next build.
// No URL/database options are accepted. DATABASE_URL is always replaced, never inherited.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { resolve, dirname, basename, relative } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { MongoClient, ObjectId } from 'mongodb';
import { migrateData } from '../migrate-data.mjs';
import { options, numberOption, rounded, summary, reportJson } from './metrics.mjs';
import { processUnits, processSnapshot, processDelta, counterDelta, queryProfileSummary, cpuProfileSummary, cpuProfileCommand } from './profile.mjs';
import { startRoundRobinProxy } from './isolated-routing.mjs';

const args = options();
assert.ok(Object.keys(args).every(key => ['users', 'invoices-per-user', 'seconds', 'concurrency', 'output', 'read-only', 'profile', 'cpu-profile', 'instances', 'probes-only'].includes(key)), 'Only isolated fixture/load options are accepted; production URLs/databases are forbidden');
assert.ok(args.profile === undefined || args.profile === true, '--profile is an isolated diagnostic flag without a value');
const profile = args.profile === true, units = profile ? processUnits() : null;
assert.ok(args['cpu-profile'] === undefined || args['cpu-profile'] === true, '--cpu-profile is an isolated diagnostic flag without a value');
const cpuProfile = args['cpu-profile'] === true;
assert.ok(args.instances === undefined || ['1', '2', '4'].includes(args.instances), '--instances must explicitly be 1, 2 or 4; multiple instances are a separate horizontal experiment');
const instances = numberOption(args.instances, 1, 1, 4, 'instances');
assert.ok(args['probes-only'] === undefined || args['probes-only'] === true, '--probes-only is a flag without a value');
const probesOnly = args['probes-only'] === true;
assert.ok(!probesOnly || profile, '--probes-only requires --profile and never measures capacity');
const userCount = numberOption(args.users, 10, 1, 1000, 'users');
const invoicesPerUser = numberOption(args['invoices-per-user'], 300, 1, 2000, 'invoices-per-user');
assert.ok(userCount * invoicesPerUser <= 200000, 'Maximum fixture is 200,000 invoices');
const seconds = numberOption(args.seconds, 8, 2, 60, 'seconds');
const concurrency = String(args.concurrency || '1,5,20').split(',').map(value => numberOption(value, 1, 1, 500, 'concurrency'));
assert.ok(concurrency.length <= 8, 'Maximum eight ramp stages');
const reportPath = args.output || 'artifacts/performance/load-isolated.json';
const startedAt = new Date().toISOString();
const cpuDirectory = cpuProfile ? resolve(dirname(reportPath), `${basename(reportPath, '.json')}-cpu-${startedAt.replace(/[^0-9]/g, '')}-${process.pid}`) : null;
const buildIdAtStart = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const systemEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
let mongo, mongoClient, prisma, proxy, serverLogs = '';
const servers = [], serverOrigins = [], cpuProfiles = [];
const phases = [], probes = [], fixtures = [], successfulCreateNumbers = new Set(), telemetry = [];
async function freePort() { const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port; }
async function childExit(child) { const [code] = await once(child, 'exit'); assert.equal(code, 0, 'Database schema initialization failed'); }
function planSummary(explain) {
  const cursor = explain.stages?.find(stage => stage.$cursor)?.$cursor || explain;
  const stats = cursor.executionStats;
  return { winningPlan: cursor.queryPlanner?.winningPlan, executionTimeMs: stats?.executionTimeMillis, returned: stats?.nReturned, keysExamined: stats?.totalKeysExamined, documentsExamined: stats?.totalDocsExamined, ...(explain.stages ? { aggregationStages: explain.stages.map(stage => Object.keys(stage)[0]) } : {}) };
}
async function containerLimits() {
  const result = {};
  for (const [key, file] of [['cpuQuota', '/sys/fs/cgroup/cpu.max'], ['memoryLimitBytes', '/sys/fs/cgroup/memory.max']]) {
    try { result[key] = (await readFile(file, 'utf8')).trim(); } catch { /* Bare-metal and non-Linux runners have no cgroup files. */ }
  }
  return result;
}
try {
  if (cpuProfile) await mkdir(cpuDirectory, { recursive: true });
  console.log('[performance] Starting an isolated Mongo replica set; no production services');
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: process.platform !== 'win32' ? [{ args: ['--nounixsocket'] }] : [] });
  const databaseUrl = mongo.getUri('fakturaprosto_performance');
  mongoClient = await MongoClient.connect(databaseUrl);
  const raw = mongoClient.db('fakturaprosto_performance');
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await childExit(spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: { ...systemEnv, DATABASE_URL: databaseUrl }, stdio: ['ignore', 'inherit', 'inherit'], timeout: 60000 }));
  await migrateData(raw, 'up');
  console.log(`[performance] Seeding ${userCount} tenants and ${userCount * invoicesPerUser} invoices`);
  const lines = Array.from({ length: 3 }, (_, index) => ({ id: `line-${index}`, name: 'Syntetyczna usługa testowa', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }));
  for (let index = 0; index < userCount; index++) {
    const user = await prisma.user.create({ data: { email: `performance-${index}@example.invalid`, name: `Synthetic user ${index}`, password: '$2a$12$not-a-real-login-credential', termsAcceptedAt: new Date(), termsAcceptedVersion: 'synthetic-fixture' } });
    const company = await prisma.companyProfile.create({ data: { userId: user.id, nip: '5260301706', companyName: `Synthetic tenant ${index}`, isDefault: true } });
    const contractor = await prisma.contractor.create({ data: { userId: user.id, companyId: company.id, name: 'Synthetic buyer', nip: '5250001003', address: { street: 'Testowa 1', city: 'Warszawa', postal: '00-001', country: 'PL' } } });
    await prisma.subscription.create({ data: { userId: user.id, plan: 'yearly', status: 'active', accessSource: 'complimentary', stripeCustomerId: `cus_synthetic_${index}`, stripeSubscriptionId: `sub_synthetic_${index}`, currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const bearer = randomBytes(32).toString('base64url');
    await prisma.session.create({ data: { userId: user.id, sessionToken: 'sha256:' + createHash('sha256').update(bearer).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    const invoices = Array.from({ length: invoicesPerUser }, (_, invoiceIndex) => {
      const day = new Date(Date.UTC(2026, 0, 1 + invoiceIndex % 280)).toISOString().slice(0, 10), createdAt = new Date(Date.UTC(2026, 0, 1) + invoiceIndex * 1000);
      return { _id: new ObjectId(), userId: new ObjectId(user.id), sellerCompanyId: new ObjectId(company.id), contractorId: contractor.id, number: `LOAD/${index}/${invoiceIndex}`, type: 'sale', status: 'issued', documentStatus: 'issued', ksefStatus: 'none', paymentStatus: 'unpaid', version: 1, currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14, issueDate: day, saleDate: day, dueDate: '2026-10-30', lines, totalNet: 300, totalVat: 69, totalGross: 369, totalNetPln: 300, totalVatPln: 69, totalGrossPln: 369, paidAmount: 0, nip: '', isCorrection: false, isOffline: false, isRecurring: false, isProforma: false, gtuCodes: [], jpkProcedures: [], ksefXml: '<synthetic-fixture>' + 'x'.repeat(6000) + '</synthetic-fixture>', notes: 'Synthetic performance fixture — not an accounting document', createdAt, updatedAt: createdAt };
    });
    await raw.collection('Invoice').insertMany(invoices);
    fixtures.push({ userId: user.id, companyId: company.id, contractorId: contractor.id, invoiceIds: invoices.slice(0, 10).map(invoice => String(invoice._id)), cookie: `auth_session=${bearer}`, lines });
  }
  // Reserve generated loopback ports only. The normal one-process path has no proxy.
  while (serverOrigins.length < instances) {
    const origin = `http://127.0.0.1:${await freePort()}`;
    if (!serverOrigins.includes(origin)) serverOrigins.push(origin);
  }
  if (instances > 1) proxy = await startRoundRobinProxy(serverOrigins);
  const base = proxy?.origin || serverOrigins[0];
  const applicationEnv = { ...systemEnv, DATABASE_URL: databaseUrl, NODE_ENV: 'production', COOKIE_SECURE: 'false', NEXTAUTH_SECRET: 'isolated-performance-auth-secret-long-enough', NEXTAUTH_URL: base, APP_URL: base, URL: base, CRON_SECRET: 'isolated-performance-cron', KSEF_QUEUE_SECRET: 'isolated-performance-queue', KSEF_PAUSE_DISPATCH: 'true', KSEF_TOKEN: '', KSEF_NIP: '', KSEF_ENV: 'test', KSEF_ENVIRONMENT: 'test', KSEF_OFFLINE_SIGNERS_JSON: '', RESEND_API_KEY: '', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', EMAIL_FROM: 'performance@example.invalid', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRICE_ID_MONTHLY: '', STRIPE_PRICE_ID_YEARLY: '', MFA_ENCRYPTION_KEY: '', WEBHOOK_ENCRYPTION_KEY: '22'.repeat(32), GUS_API_KEY: '', GUS_ENV: 'test', OCR_SPACE_API_KEY: '', DOCUMENT_SCAN_URL: '', DOCUMENT_SCAN_TOKEN: '', DOCUMENT_SCAN_REQUIRED: 'false', BACKUP_MONITOR_SECRET: '' };
  for (let instance = 0; instance < instances; instance++) {
    const port = new URL(serverOrigins[instance]).port;
    const server = spawn(process.execPath, ['--require', resolve('scripts/performance/loopback-only.cjs'), ...(profile ? ['--require', resolve('scripts/performance/process-telemetry.cjs')] : []), ...(cpuProfile ? ['--require', resolve('scripts/performance/process-cpu-profile.cjs')] : []), 'node_modules/next/dist/bin/next', 'start', '-p', port, '-H', '127.0.0.1'], { env: { ...applicationEnv, ...(profile ? { ISOLATED_PERFORMANCE_TELEMETRY: '1' } : {}), ...(cpuProfile ? { ISOLATED_PERFORMANCE_CPU_PROFILE: '1', ISOLATED_PERFORMANCE_CPU_DIRECTORY: cpuDirectory } : {}) }, stdio: ['ignore', 'pipe', 'pipe', ...(profile || cpuProfile ? ['ipc'] : [])] });
    servers.push(server);
    if (profile) server.on('message', message => { if (message?.type === 'isolated-performance-telemetry') telemetry.push({ receivedAtMs: performance.now(), instance: instance + 1, ...message }); });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLogs = (serverLogs + `[worker ${instance + 1}] ` + chunk).slice(-50000); });
  }
  await Promise.all(servers.map(async (server, instance) => {
    let ready = false;
    for (let index = 0; index < 120; index++) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Local server exited: ' + serverLogs);
      try { ready = (await fetch(serverOrigins[instance] + '/api/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Startup. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, `Local worker ${instance + 1} did not start: ` + serverLogs);
  }));
  async function startCpuProfiles() { if (cpuProfile) await Promise.all(servers.map(server => cpuProfileCommand(server, 'start'))); }
  async function stopCpuProfiles(label) {
    if (!cpuProfile) return [];
    const results = await Promise.all(servers.map(async (server, index) => {
      const { filePath } = await cpuProfileCommand(server, 'stop', `worker-${index + 1}-${label}.cpuprofile`);
      return { instance: index + 1, segment: label, file: relative(process.cwd(), filePath), ...cpuProfileSummary(JSON.parse(await readFile(filePath, 'utf8'))) };
    }));
    cpuProfiles.push(...results); return results;
  }
  let sequence = 0;
  function scenario(kind, fixture) {
    if (kind === 'bootstrap') return { method: 'GET', path: '/api/data?invoiceMode=list' };
    if (kind === 'fullBootstrap') return { method: 'GET', path: '/api/data' };
    if (kind === 'nextNumber') return { method: 'GET', path: `/api/invoices/next-number?companyId=${fixture.companyId}&date=2026-10-08&type=sale` };
    if (kind === 'list') return { method: 'GET', path: `/api/invoices/search?companyId=${fixture.companyId}&type=all` };
    if (kind === 'search') return { method: 'GET', path: `/api/invoices/search?companyId=${fixture.companyId}&type=all&search=LOAD` };
    if (kind === 'detail') return { method: 'GET', path: `/api/invoices/${fixture.invoiceIds[sequence % fixture.invoiceIds.length]}` };
    if (kind === 'pdf' || kind === 'pdfWarm') return { method: 'GET', path: `/api/invoices/${fixture.invoiceIds[0]}/pdf` };
    if (kind === 'create') return { method: 'POST', path: '/api/invoices', body: { number: `LOAD/NEW/${++sequence}`, type: 'sale', status: 'issued', sellerCompanyId: fixture.companyId, contractorId: fixture.contractorId, issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14, lines: fixture.lines } };
    throw new Error('Unknown scenario');
  }
  async function request(kind, fixture, destination = base) {
    const route = scenario(kind, fixture), start = performance.now();
    try {
      const response = await fetch(destination + route.path, { method: route.method, headers: { Cookie: fixture.cookie, Origin: base, 'Content-Type': 'application/json' }, body: route.body ? JSON.stringify(route.body) : undefined, signal: AbortSignal.timeout(15000) });
      const ttfbMs = performance.now() - start, body = await response.arrayBuffer();
      if (kind === 'create' && response.ok) successfulCreateNumbers.add(route.body.number);
      return { kind, status: response.status, ok: response.ok, elapsedMs: performance.now() - start, ttfbMs, bytes: body.byteLength, ...(response.ok ? {} : { error: new TextDecoder().decode(body).slice(0, 200) }) };
    } catch (error) { return { kind, status: 'network_error', ok: false, elapsedMs: performance.now() - start, ttfbMs: null, bytes: 0, error: error.name }; }
  }
  // Comparison probes run serially and include the first PDF render. Warm ramp uses cached PDF.
  await startCpuProfiles();
  for (const kind of ['bootstrap', 'nextNumber', 'fullBootstrap', 'list', 'search', 'detail', 'create', 'pdf', ...(probesOnly ? ['pdfWarm'] : [])]) {
    if (profile) {
      // The profiler is capped; Mongo forbids deleting individual entries from it.
      // This is a fresh isolated database, and profiling is disabled between probes.
      try { await raw.collection('system.profile').drop(); } catch (error) { if (error.code !== 26) throw error; }
      await raw.command({ profile: 2 });
    }
    // Keep the serial cold/warm PDF pair on the same cache-bearing worker.
    const pinnedPdf = instances > 1 && (kind === 'pdf' || kind === 'pdfWarm');
    const sample = await request(kind, fixtures[0], pinnedPdf ? serverOrigins[0] : base);
    if (pinnedPdf) sample.applicationInstance = 1;
    probes.push(sample);
    if (profile) {
      await raw.command({ profile: 0 });
      sample.databaseProfile = queryProfileSummary(await raw.collection('system.profile').find({}).toArray());
    }
    // Old builds have no number-preview route; keep baseline comparisons usable.
    if (kind === 'nextNumber' && sample.status === 404) { sample.unavailableInThisBuild = true; continue; }
    assert.ok(sample.ok, `Preflight ${kind} failed: ${JSON.stringify(sample)}\n${serverLogs}`);
  }
  await stopCpuProfiles('serial-probes');
  let warmedPdfRequests = 0;
  if (!probesOnly) {
    // Every cache belongs to a worker process; warm every tenant on every worker.
    // The first tenant on the one-worker default was already warmed by the PDF probe.
    for (let instance = 0; instance < instances; instance++) for (const fixture of instances === 1 ? fixtures.slice(1) : fixtures) {
      const sample = await request('pdf', fixture, serverOrigins[instance]);
      assert.ok(sample.ok, `PDF warm-up on worker ${instance + 1} failed: ${JSON.stringify(sample)}`); warmedPdfRequests++;
    }
  }
  const mix = args['read-only'] ? ['bootstrap', 'list', 'list', 'list', 'search', 'detail', 'detail', 'pdf'] : ['bootstrap', 'list', 'list', 'list', 'search', 'detail', 'detail', 'create', 'pdf', 'pdf'];
  for (const workers of probesOnly ? [] : concurrency) {
    const pids = { ...Object.fromEntries(servers.map((server, index) => [instances === 1 ? 'application' : `application${index + 1}`, server.pid])), database: mongo.servers[0]?.instanceInfo?.instance?.mongodProcess?.pid, generator: process.pid };
    const resourcesBefore = profile ? await processSnapshot(pids, units) : null;
    const databaseBefore = profile ? await raw.admin().serverStatus() : null;
    const assignmentsBefore = proxy?.assignments();
    await startCpuProfiles();
    const samples = [], stageStart = performance.now(), deadline = stageStart + seconds * 1000;
    await Promise.all(Array.from({ length: workers }, async (_, worker) => {
      let position = worker;
      while (performance.now() < deadline) {
        const fixture = fixtures[(worker + position) % fixtures.length], kind = mix[position++ % mix.length];
        samples.push(await request(kind, fixture));
      }
    }));
    const elapsedMs = performance.now() - stageStart;
    const stageEnd = performance.now();
    const phaseCpuProfiles = await stopCpuProfiles(`stage-${phases.length + 1}-workers-${workers}`);
    const resourcesAfter = profile ? await processSnapshot(pids, units) : null;
    const databaseAfter = profile ? await raw.admin().serverStatus() : null;
    const phase = { workers, elapsedMs: rounded(elapsedMs), ...summary(samples, elapsedMs), byScenario: Object.fromEntries(mix.filter((kind, index) => mix.indexOf(kind) === index).map(kind => [kind, summary(samples.filter(sample => sample.kind === kind), elapsedMs)])), errorSamples: samples.filter(sample => !sample.ok).slice(0, 20) };
    if (proxy) phase.applicationAssignments = proxy.assignments().map((count, index) => ({ instance: index + 1, requests: count - assignmentsBefore[index] }));
    if (cpuProfile) phase.cpuProfiles = phaseCpuProfiles;
    if (profile) phase.profile = { processes: processDelta(resourcesBefore, resourcesAfter, units), database: { operationCounters: counterDelta(databaseBefore.opcounters, databaseAfter.opcounters), connections: databaseAfter.connections }, applicationSamples: telemetry.filter(sample => sample.receivedAtMs >= stageStart && sample.receivedAtMs <= stageEnd).map(({ receivedAtMs, type, ...sample }) => ({ ...sample, receivedAtPhaseMs: rounded(receivedAtMs - stageStart) })), limitation: 'CPU counters are measured around the phase, including diagnostic commands and, when enabled, CPU-profiler start/stop and profile-file processing. Each IPC event-loop sample covers its preceding ~1 second and may overlap a phase boundary. Profiling incurs overhead; compare primary load metrics with --profile and --cpu-profile omitted.' };
    phases.push(phase);
    console.log(`[performance] ${workers} workers: ${phase.requestsPerSecond} req/s; p95 ${phase.latencyMs.p95} ms; errors ${phase.errors}`);
  }
  const companyId = new ObjectId(fixtures[0].companyId), collection = raw.collection('Invoice');
  const queryPlans = {
    companyPage: planSummary(await collection.find({ sellerCompanyId: companyId }).sort({ issueDate: -1, _id: -1 }).limit(30).explain('executionStats')),
    companyBootstrap: planSummary(await collection.find({ sellerCompanyId: companyId }).sort({ createdAt: -1 }).explain('executionStats')),
    invoiceNumberLookup: planSummary(await collection.find({ sellerCompanyId: companyId, number: 'LOAD/0/1' }).limit(1).explain('executionStats')),
    companyContactIds: planSummary(await collection.aggregate([{ $match: { sellerCompanyId: companyId } }, { $group: { _id: '$contractorId' } }]).explain('executionStats')),
  };
  const serverStatus = await raw.admin().serverStatus();
  const createdInvoices = await collection.find({ number: /^LOAD\/NEW\// }, { projection: { number: 1 } }).toArray();
  const createdClaims = await raw.collection('InvoiceNumberClaim').countDocuments({ _id: /^[a-f0-9]{24}:LOAD\/NEW\// });
  const fixtureIntegrity = {
    successfulCreateResponses: successfulCreateNumbers.size, persistedCreatedInvoices: createdInvoices.length, persistedNumberClaims: createdClaims,
    exactlyOnce: createdInvoices.length === successfulCreateNumbers.size && createdClaims === createdInvoices.length && new Set(createdInvoices.map(invoice => invoice.number)).size === createdInvoices.length && createdInvoices.every(invoice => successfulCreateNumbers.has(invoice.number)),
  };
  const report = {
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim(),
    method: { isolatedDatabase: true, externalProviderCalls: 'blocked by process preload; credentials replaced', model: probesOnly ? 'serial diagnostic probes only; no ramp and no capacity/SLA inference' : 'closed-model concurrent workers, no think time', coordinatedOmission: 'Latency does not include time waiting before a worker can issue its next request. This test measures local saturation, not a fixed arrival-rate production SLA.', userCount, invoicesPerUser, syntheticXmlBytesPerInvoice: Buffer.byteLength('<synthetic-fixture>' + 'x'.repeat(6000) + '</synthetic-fixture>'), warmPdf: !probesOnly, requestMix: probesOnly ? [] : mix, secondsPerStage: probesOnly ? null : seconds, diagnosticProfiling: profile, cpuProfiling: cpuProfile, probesOnly, instanceConfiguration: { count: instances, comparisonRole: instances > 1 ? 'separate horizontal experiment; do not compare as a primary single-process optimization result' : profile || cpuProfile ? 'single-process diagnostic; profiling incurs overhead' : 'primary single-process capacity measurement', routing: proxy ? 'fixed round-robin per request through a loopback-only HTTP proxy in the load-generator process' : 'direct loopback connection', sameFreshDatabase: true, applicationPids: servers.map(server => server.pid), proxyPid: proxy ? process.pid : null, warmedPdfOnAllWorkers: !probesOnly, explicitWorkerPdfWarmups: warmedPdfRequests, ...(proxy ? { totalProxyAssignments: proxy.assignments() } : {}) }, ...(profile ? { processCounterUnits: units } : {}), machine: { logicalCpus: cpus().length, totalMemoryBytes: totalmem(), node: process.version, ...await containerLimits() }, databaseAndAppLocation: 'same host; no CDN, serverless cold start or internet RTT', productionCapacityNote: 'Worker count and seeded user count do not imply the application supports that many simultaneous real users. Repeat in a matching staging environment before increasing public traffic.' },
    probes: probes.map(sample => ({ ...sample, elapsedMs: rounded(sample.elapsedMs), ttfbMs: rounded(sample.ttfbMs) })), phases, queryPlans,
    database: { invoiceCount: await collection.countDocuments(), indexes: await collection.listIndexes().toArray(), connections: serverStatus.connections, operationCounters: serverStatus.opcounters },
    fixtureIntegrity, ...(cpuProfile ? { cpuProfiles } : {}), passed: phases.every(phase => phase.errors === 0) && fixtureIntegrity.exactlyOnce,
  };
  assert.equal(report.buildId, buildIdAtStart, 'Application build changed during measurement');
  const serverLogPath = reportPath.replace(/\.json$/i, '') + '-server.log';
  await mkdir(dirname(serverLogPath), { recursive: true });
  await writeFile(serverLogPath, serverLogs, { flag: 'wx', mode: 0o600 });
  report.retainedServerLog = { path: serverLogPath, sha256: createHash('sha256').update(serverLogs).digest('hex'), maximumCapturedCharacters: 50000, availability: 'LOCAL_WORKSPACE_ONLY: synthetic fixture server log; do not publish raw' };
  await reportJson(reportPath, report);
  if (!report.passed) process.exitCode = 1;
} finally {
  await proxy?.close();
  await Promise.all(servers.map(async server => {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
  }));
  await prisma?.$disconnect(); await mongoClient?.close(); await mongo?.stop();
}

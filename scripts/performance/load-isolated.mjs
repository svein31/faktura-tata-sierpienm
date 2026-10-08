// Closed-model local capacity experiment: a fresh Mongo replica set and production Next build.
// No URL/database options are accepted. DATABASE_URL is always replaced, never inherited.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { MongoClient, ObjectId } from 'mongodb';
import { migrateData } from '../migrate-data.mjs';
import { options, numberOption, rounded, summary, reportJson } from './metrics.mjs';

const args = options();
assert.ok(Object.keys(args).every(key => ['users', 'invoices-per-user', 'seconds', 'concurrency', 'output', 'read-only'].includes(key)), 'Only isolated fixture/load options are accepted; production URLs/databases are forbidden');
const userCount = numberOption(args.users, 10, 1, 1000, 'users');
const invoicesPerUser = numberOption(args['invoices-per-user'], 300, 1, 2000, 'invoices-per-user');
assert.ok(userCount * invoicesPerUser <= 200000, 'Maximum fixture is 200,000 invoices');
const seconds = numberOption(args.seconds, 8, 2, 60, 'seconds');
const concurrency = String(args.concurrency || '1,5,20').split(',').map(value => numberOption(value, 1, 1, 500, 'concurrency'));
assert.ok(concurrency.length <= 8, 'Maximum eight ramp stages');
const reportPath = args.output || 'artifacts/performance/load-isolated.json';
const startedAt = new Date().toISOString();
const systemEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
let mongo, mongoClient, prisma, server, serverLogs = '';
const phases = [], probes = [], fixtures = [], successfulCreateNumbers = new Set();
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
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const applicationEnv = { ...systemEnv, DATABASE_URL: databaseUrl, NODE_ENV: 'production', COOKIE_SECURE: 'false', NEXTAUTH_SECRET: 'isolated-performance-auth-secret-long-enough', NEXTAUTH_URL: base, APP_URL: base, URL: base, CRON_SECRET: 'isolated-performance-cron', KSEF_QUEUE_SECRET: 'isolated-performance-queue', KSEF_PAUSE_DISPATCH: 'true', KSEF_TOKEN: '', KSEF_NIP: '', KSEF_ENV: 'test', KSEF_ENVIRONMENT: 'test', KSEF_OFFLINE_SIGNERS_JSON: '', RESEND_API_KEY: '', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', EMAIL_FROM: 'performance@example.invalid', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRICE_ID_MONTHLY: '', STRIPE_PRICE_ID_YEARLY: '', MFA_ENCRYPTION_KEY: '', WEBHOOK_ENCRYPTION_KEY: '22'.repeat(32), GUS_API_KEY: '', GUS_ENV: 'test', OCR_SPACE_API_KEY: '', DOCUMENT_SCAN_URL: '', DOCUMENT_SCAN_TOKEN: '', DOCUMENT_SCAN_REQUIRED: 'false', BACKUP_MONITOR_SECRET: '' };
  server = spawn(process.execPath, ['--require', resolve('scripts/performance/loopback-only.cjs'), 'node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], { env: applicationEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLogs = (serverLogs + chunk).slice(-50000); });
  let ready = false;
  for (let index = 0; index < 120; index++) {
    if (server.exitCode !== null) throw new Error('Local server exited: ' + serverLogs);
    try { ready = (await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Startup. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Local server did not start: ' + serverLogs);
  let sequence = 0;
  function scenario(kind, fixture) {
    if (kind === 'bootstrap') return { method: 'GET', path: '/api/data?invoiceMode=list' };
    if (kind === 'fullBootstrap') return { method: 'GET', path: '/api/data' };
    if (kind === 'nextNumber') return { method: 'GET', path: `/api/invoices/next-number?companyId=${fixture.companyId}&date=2026-10-08&type=sale` };
    if (kind === 'list') return { method: 'GET', path: `/api/invoices/search?companyId=${fixture.companyId}&type=all` };
    if (kind === 'search') return { method: 'GET', path: `/api/invoices/search?companyId=${fixture.companyId}&type=all&search=LOAD` };
    if (kind === 'detail') return { method: 'GET', path: `/api/invoices/${fixture.invoiceIds[sequence % fixture.invoiceIds.length]}` };
    if (kind === 'pdf') return { method: 'GET', path: `/api/invoices/${fixture.invoiceIds[0]}/pdf` };
    if (kind === 'create') return { method: 'POST', path: '/api/invoices', body: { number: `LOAD/NEW/${++sequence}`, type: 'sale', status: 'issued', sellerCompanyId: fixture.companyId, contractorId: fixture.contractorId, issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14, lines: fixture.lines } };
    throw new Error('Unknown scenario');
  }
  async function request(kind, fixture) {
    const route = scenario(kind, fixture), start = performance.now();
    try {
      const response = await fetch(base + route.path, { method: route.method, headers: { Cookie: fixture.cookie, Origin: base, 'Content-Type': 'application/json' }, body: route.body ? JSON.stringify(route.body) : undefined, signal: AbortSignal.timeout(15000) });
      const ttfbMs = performance.now() - start, body = await response.arrayBuffer();
      if (kind === 'create' && response.ok) successfulCreateNumbers.add(route.body.number);
      return { kind, status: response.status, ok: response.ok, elapsedMs: performance.now() - start, ttfbMs, bytes: body.byteLength, ...(response.ok ? {} : { error: new TextDecoder().decode(body).slice(0, 200) }) };
    } catch (error) { return { kind, status: 'network_error', ok: false, elapsedMs: performance.now() - start, ttfbMs: null, bytes: 0, error: error.name }; }
  }
  // Comparison probes run serially and include the first PDF render. Warm ramp uses cached PDF.
  for (const kind of ['bootstrap', 'nextNumber', 'fullBootstrap', 'list', 'search', 'detail', 'create', 'pdf']) {
    const sample = await request(kind, fixtures[0]); probes.push(sample);
    // Old builds have no number-preview route; keep baseline comparisons usable.
    if (kind === 'nextNumber' && sample.status === 404) { sample.unavailableInThisBuild = true; continue; }
    assert.ok(sample.ok, `Preflight ${kind} failed: ${JSON.stringify(sample)}\n${serverLogs}`);
  }
  for (const fixture of fixtures.slice(1)) { const sample = await request('pdf', fixture); assert.ok(sample.ok, `PDF warm-up failed: ${JSON.stringify(sample)}`); }
  const mix = args['read-only'] ? ['bootstrap', 'list', 'list', 'list', 'search', 'detail', 'detail', 'pdf'] : ['bootstrap', 'list', 'list', 'list', 'search', 'detail', 'detail', 'create', 'pdf', 'pdf'];
  for (const workers of concurrency) {
    const samples = [], stageStart = performance.now(), deadline = stageStart + seconds * 1000;
    await Promise.all(Array.from({ length: workers }, async (_, worker) => {
      let position = worker;
      while (performance.now() < deadline) {
        const fixture = fixtures[(worker + position) % fixtures.length], kind = mix[position++ % mix.length];
        samples.push(await request(kind, fixture));
      }
    }));
    const elapsedMs = performance.now() - stageStart;
    const phase = { workers, elapsedMs: rounded(elapsedMs), ...summary(samples, elapsedMs), byScenario: Object.fromEntries(mix.filter((kind, index) => mix.indexOf(kind) === index).map(kind => [kind, summary(samples.filter(sample => sample.kind === kind), elapsedMs)])), errorSamples: samples.filter(sample => !sample.ok).slice(0, 20) };
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
    method: { isolatedDatabase: true, externalProviderCalls: 'blocked by process preload; credentials replaced', model: 'closed-model concurrent workers, no think time', coordinatedOmission: 'Latency does not include time waiting before a worker can issue its next request. This test measures local saturation, not a fixed arrival-rate production SLA.', userCount, invoicesPerUser, syntheticXmlBytesPerInvoice: Buffer.byteLength('<synthetic-fixture>' + 'x'.repeat(6000) + '</synthetic-fixture>'), warmPdf: true, requestMix: mix, secondsPerStage: seconds, machine: { logicalCpus: cpus().length, totalMemoryBytes: totalmem(), node: process.version, ...await containerLimits() }, databaseAndAppLocation: 'same host; no CDN, serverless cold start or internet RTT', productionCapacityNote: 'Worker count and seeded user count do not imply the application supports that many simultaneous real users. Repeat in a matching staging environment before increasing public traffic.' },
    probes: probes.map(sample => ({ ...sample, elapsedMs: rounded(sample.elapsedMs), ttfbMs: rounded(sample.ttfbMs) })), phases, queryPlans,
    database: { invoiceCount: await collection.countDocuments(), indexes: await collection.listIndexes().toArray(), connections: serverStatus.connections, operationCounters: serverStatus.opcounters },
    fixtureIntegrity, passed: phases.every(phase => phase.errors === 0) && fixtureIntegrity.exactlyOnce,
  };
  await reportJson(reportPath, report);
  if (!report.passed) process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); if (server.exitCode === null) server.kill('SIGKILL'); }
  await prisma?.$disconnect(); await mongoClient?.close(); await mongo?.stop();
}

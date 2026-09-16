import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { MongoClient, ObjectId } from 'mongodb';
import { migrateData } from './migrate-data.mjs';

// Always an isolated replica set; never use an inherited production database URL.
console.log('[integration] Starting isolated MongoDB replica set');
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const databaseUrl = mongo.getUri('fakturo_integration');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const port = 41000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const mongoClient = new MongoClient(databaseUrl);
let server, logs = '';
async function api(method, path, body, cookie) {
  console.log(`[integration] ${method} ${path}`);
  const res = await fetch(base + path, { signal: AbortSignal.timeout(15000), method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { res, data: await res.json(), cookie: res.headers.getSetCookie().find(c => c.startsWith('auth_session='))?.split(';')[0] };
}
try {
  await mongoClient.connect();
  const migrationDb = mongoClient.db('migration_checks');
  const fixtureOwner = new ObjectId(), fixtureCompany = new ObjectId(), fixtureContact = new ObjectId();
  await migrationDb.collection('CompanyProfile').insertOne({ _id: fixtureCompany, userId: fixtureOwner });
  await migrationDb.collection('Contractor').insertOne({ _id: fixtureContact, userId: fixtureOwner, name: 'Preserved' });
  await migrateData(migrationDb); await migrateData(migrationDb);
  assert.equal(String((await migrationDb.collection('Contractor').findOne({ _id: fixtureContact })).companyId), String(fixtureCompany));
  await migrationDb.collection('Contractor').updateOne({ _id: fixtureContact }, { $set: { name: 'Edited after migration' } });
  await migrateData(migrationDb, 'down', '001-company-catalog');
  const rolledBack = await migrationDb.collection('Contractor').findOne({ _id: fixtureContact });
  assert.equal(Object.hasOwn(rolledBack, 'companyId'), false); assert.equal(rolledBack.name, 'Edited after migration');
  await migrateData(migrationDb);
  console.log('[integration] PASS migrations up/up/down/up preserve business data');
  console.log('[integration] Initializing test database');
  const push = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', timeout: 60000 });
  const [pushCode] = await once(push, 'exit');
  assert.equal(pushCode, 0, 'Test schema initialization must succeed');
  console.log('[integration] Starting application');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], { env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'production', COOKIE_SECURE: 'false', CRON_SECRET: 'integration-cron-secret', MFA_ENCRYPTION_KEY: '11'.repeat(32) }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { logs += data; });
  server.stderr.on('data', data => { logs += data; });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Application must start');
  assert.equal((await api('GET', '/api/data')).res.status, 401);
  const a = await api('POST', '/api/auth/register', { name: 'Owner', email: 'a@example.com', password: 'Integration123!', acceptTerms: true });
  const b = await api('POST', '/api/auth/register', { name: 'Other', email: 'b@example.com', password: 'Integration123!', acceptTerms: true });
  assert.equal(a.res.status, 201, JSON.stringify(a.data)); assert.equal(b.res.status, 201, JSON.stringify(b.data));
  assert.ok(a.cookie); assert.ok(b.cookie);
  const login = await api('POST', '/api/auth/login', { email: 'a@example.com', password: 'Integration123!' });
  assert.equal(login.res.status, 200); assert.ok(login.cookie);
  const bootstrap = await api('GET', '/api/data', undefined, a.cookie);
  assert.equal(bootstrap.res.status, 200); assert.deepEqual(bootstrap.data.invoices, []);
  const company = await api('POST', '/api/companies', { companyName: 'Firma A', nip: '5260301706' }, a.cookie);
  assert.equal(company.res.status, 201, JSON.stringify(company.data));
  const companyId = company.data.company.id;
  const contractor = await api('POST', '/api/contractors', { name: 'Nabywca', nip: '5250001003', address: { street: 'Testowa 1', city: 'Warszawa', postal: '00-001', country: 'PL' } }, a.cookie);
  assert.equal(contractor.res.status, 201, JSON.stringify(contractor.data));
  const invoice = await api('POST', '/api/invoices', {
    number: 'FS/2026/1', type: 'sale', status: 'draft', sellerCompanyId: companyId, contractorId: contractor.data.contractor.id,
    issueDate: '2026-09-15', saleDate: '2026-09-15', dueDate: '2026-09-29', currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14,
    lines: [{ id: 'line-1', name: 'Usługa', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }],
  }, a.cookie);
  assert.equal(invoice.res.status, 201, JSON.stringify(invoice.data));
  const invoiceId = invoice.data.invoice.id;
  assert.equal((await api('GET', `/api/invoices/${invoiceId}`, undefined, a.cookie)).res.status, 200);
  assert.equal((await api('GET', `/api/invoices/${invoiceId}`, undefined, b.cookie)).res.status, 404);
  assert.equal((await api('GET', '/api/data', undefined, b.cookie)).data.invoices.length, 0);
  const company2 = await api('POST', '/api/companies', { companyName: 'Firma prywatna', nip: '5250001003' }, a.cookie);
  assert.equal(company2.res.status, 201);
  const privateContact = await api('POST', '/api/contractors', { name: 'Prywatny', nip: '5250001003', companyId: company2.data.company.id }, a.cookie);
  assert.equal(privateContact.res.status, 201);
  const sharedContact = await api('POST', '/api/contractors', { name: 'Firmowy', nip: '5250001003', companyId }, a.cookie);
  assert.equal(sharedContact.res.status, 201);
  await db.companyMember.create({ data: { companyId, userId: b.data.user.id, role: 'viewer', canIssueInvoices: false } });
  const visible = (await api('GET', '/api/data', undefined, b.cookie)).data;
  assert.ok(visible.contractors.some(c => c.id === sharedContact.data.contractor.id));
  assert.ok(visible.contractors.some(c => c.id === contractor.data.contractor.id));
  assert.ok(!visible.contractors.some(c => c.id === privateContact.data.contractor.id));
  const listed = await api('GET', '/api/companies', undefined, b.cookie);
  assert.deepEqual(listed.data.companies.map(c => c.id), [companyId]);
  assert.equal((await api('GET', `/api/companies/${companyId}`, undefined, b.cookie)).res.status, 200);
  assert.equal((await api('GET', `/api/companies/${company2.data.company.id}`, undefined, b.cookie)).res.status, 404);
  assert.equal((await api('PUT', `/api/contractors/${sharedContact.data.contractor.id}`, { name: 'Forbidden' }, b.cookie)).res.status, 403);
  assert.equal((await api('POST', '/api/contractors', { name: 'Forbidden', nip: '5250001003', companyId }, b.cookie)).res.status, 403);
  const crossCompany = await api('POST', '/api/invoices', { ...invoice.data.invoice, number: 'FORBIDDEN', contractorId: privateContact.data.contractor.id }, a.cookie);
  assert.equal(crossCompany.res.status, 400);

  assert.equal((await api('GET', `/api/invoices/${invoiceId}`, undefined, b.cookie)).res.status, 200);
  assert.equal((await api('PUT', `/api/invoices/${invoiceId}`, { version: 1, notes: 'Forbidden' }, b.cookie)).res.status, 403);
  assert.equal((await api('POST', '/api/ksef/queue', { invoiceId, environment: 'demo' }, b.cookie)).res.status, 403);
  await db.companyMember.deleteMany({ where: { companyId, userId: b.data.user.id } });
  assert.equal((await api('GET', `/api/invoices/${invoiceId}`, undefined, b.cookie)).res.status, 404);
  const audit = await api('GET', `/api/audit?companyId=${companyId}`, undefined, a.cookie);
  assert.ok(audit.data.logs.some(log => log.action === 'invoice_created'));
  const concurrent = await Promise.all([1, 2].map(() => api('POST', '/api/ksef/queue', { invoiceId, environment: 'demo' }, a.cookie)));
  assert.ok(concurrent.some(result => result.res.status === 200));
  assert.ok(concurrent.every(result => [200, 409].includes(result.res.status)));
  assert.equal(await db.ksefQueueTask.count({ where: { invoiceId } }), 1);
  const again = await api('POST', '/api/ksef/queue', { invoiceId, environment: 'demo' }, a.cookie);
  assert.equal(again.data.alreadyQueued, true);
  // Legacy MongoDB tasks may omit optional fields entirely (not the same as null).
  await db.ksefQueueTask.updateMany({ where: { invoiceId }, data: { lockedUntil: { unset: true }, nextAttemptAt: { unset: true } } });
  const processed = await api('POST', '/api/ksef/queue/process', {}, a.cookie);
  assert.equal(processed.res.status, 200, JSON.stringify(processed.data));
  const accepted = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.equal(accepted.ksefStatus, 'accepted'); assert.ok(accepted.ksefNumber);
  assert.equal(await db.ksefQueueTask.count({ where: { invoiceId } }), 1);
  console.log('PASS: MongoDB HTTP auth, CRUD, roles/revocation, isolation, audit and KSeF demo queue');
} catch (error) { console.error(logs); throw error; }
finally {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000); await stopped; clearTimeout(timer); }
  await db.$disconnect(); await mongoClient.close(); await mongo.stop();
}

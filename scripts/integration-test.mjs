import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { MongoClient, ObjectId } from 'mongodb';
import { migrateData } from './migrate-data.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const { totpAt } = require('../src/lib/totp.ts');

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
  await migrateData(migrationDb, 'up', '001-company-catalog'); await migrateData(migrationDb, 'up', '001-company-catalog');
  assert.equal(String((await migrationDb.collection('Contractor').findOne({ _id: fixtureContact })).companyId), String(fixtureCompany));
  await migrationDb.collection('Contractor').updateOne({ _id: fixtureContact }, { $set: { name: 'Edited after migration' } });
  await migrateData(migrationDb, 'down', '001-company-catalog');
  const rolledBack = await migrationDb.collection('Contractor').findOne({ _id: fixtureContact });
  assert.equal(Object.hasOwn(rolledBack, 'companyId'), false); assert.equal(rolledBack.name, 'Edited after migration');
  await migrateData(migrationDb, 'up', '001-company-catalog');
  await migrateData(migrationDb, 'up', '002-user-mfa');
  await migrateData(migrationDb, 'up', '002-user-mfa');
  await migrationDb.collection('UserMfa').insertOne({ userId: fixtureOwner, enabledAt: new Date(), encryptedSecret: 'preserve' });
  await assert.rejects(migrateData(migrationDb, 'down', '002-user-mfa'), /Disable MFA/);
  await migrationDb.collection('UserMfa').updateOne({ userId: fixtureOwner }, { $set: { enabledAt: null } });
  await migrateData(migrationDb, 'down', '002-user-mfa');
  assert.equal((await migrationDb.collection('UserMfa').findOne({ userId: fixtureOwner })).encryptedSecret, 'preserve');
  await migrateData(migrationDb, 'up', '002-user-mfa');
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
  const historic = await db.auditLog.create({ data: { companyId, userId: b.data.user.id, documentId: invoiceId, action: 'fixture_previous_access', entityType: 'invoice', entityId: invoiceId } });
  await db.companyMember.deleteMany({ where: { companyId, userId: b.data.user.id } });
  assert.ok(!(await api('GET', '/api/audit', undefined, b.cookie)).data.logs.some(log => log.id === historic.id));
  assert.equal((await api('GET', `/api/audit?documentId=${invoiceId}`, undefined, b.cookie)).data.logs.length, 0);
  assert.equal((await api('GET', `/api/invoices/${invoiceId}`, undefined, b.cookie)).res.status, 404);
  const audit = await api('GET', `/api/audit?companyId=${companyId}`, undefined, a.cookie);
  assert.ok(audit.data.logs.some(log => log.action === 'invoice_created'));
  const edits = await Promise.all(['A', 'B'].map(notes => api('PUT', `/api/invoices/${invoiceId}`, { ...invoice.data.invoice, notes, version: 1 }, a.cookie)));
  assert.deepEqual(edits.map(result => result.res.status).sort(), [200, 409]);
  const filteredAudit = await api('GET', `/api/audit?companyId=${companyId}&documentId=${invoiceId}&limit=1`, undefined, a.cookie);
  assert.equal(filteredAudit.data.logs.length, 1); assert.equal(filteredAudit.data.logs[0].documentId, invoiceId);
  assert.ok(filteredAudit.data.nextCursor);
  const olderAudit = await api('GET', `/api/audit?companyId=${companyId}&documentId=${invoiceId}&limit=1&cursor=${filteredAudit.data.nextCursor}`, undefined, a.cookie);
  assert.notEqual(olderAudit.data.logs[0].id, filteredAudit.data.logs[0].id);
  const emptyCompany = await api('POST', '/api/companies', { companyName: 'Do usunięcia', nip: '5260301706' }, b.cookie);
  assert.equal(emptyCompany.res.status, 201);
  assert.equal((await api('DELETE', `/api/companies/${emptyCompany.data.company.id}`, undefined, b.cookie)).res.status, 200);
  assert.ok(await db.auditLog.count({ where: { entityId: emptyCompany.data.company.id } }) >= 2);

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
  const fx = await api('POST', '/api/invoices', { ...invoice.data.invoice, number: 'FX/1', currency: 'EUR', exchangeRateRule: 'manual', exchangeRate: 4.25, exchangeRateJustification: 'Kurs dokumentu źródłowego', totalGrossPln: 1 }, a.cookie);
  assert.equal(fx.res.status, 201, JSON.stringify(fx.data)); assert.equal(fx.data.invoice.totalGrossPln, 522.75);
  const invalidFx = await api('POST', '/api/invoices', { ...invoice.data.invoice, number: 'FX/2', currency: 'USD', exchangeRateRule: 'manual', exchangeRate: 4.25 }, a.cookie);
  assert.equal(invalidFx.res.status, 400); assert.equal(await db.invoice.count({ where: { number: 'FX/2' } }), 0);
  const credentials = { email: 'a@example.com', password: 'Integration123!' };
  const setupMfa = await api('POST', '/api/auth/mfa', { action: 'setup', password: credentials.password }, a.cookie);
  assert.equal(setupMfa.res.status, 200, JSON.stringify(setupMfa.data));
  assert.ok(setupMfa.data.qrDataUrl.startsWith('data:image/png;base64,'));
  const activationCode = totpAt(setupMfa.data.secret, Date.now());
  const enabledMfa = await api('POST', '/api/auth/mfa', { action: 'enable', password: credentials.password, code: activationCode }, a.cookie);
  assert.equal(enabledMfa.res.status, 200, JSON.stringify(enabledMfa.data));
  assert.equal(enabledMfa.data.recoveryCodes.length, 8);
  const storedMfa = await db.userMfa.findUniqueOrThrow({ where: { userId: a.data.user.id } });
  assert.notEqual(storedMfa.encryptedSecret, setupMfa.data.secret);
  assert.ok(!storedMfa.recoveryHashes.includes(enabledMfa.data.recoveryCodes[0]));
  assert.equal((await api('GET', '/api/data', undefined, login.cookie)).res.status, 401);
  assert.equal((await api('GET', '/api/data', undefined, a.cookie)).res.status, 200);
  const invite = await db.teamInvitation.create({ data: { companyId: company2.data.company.id, userId: b.data.user.id, email: credentials.email, role: 'viewer', token: 'mfa-invitation-fixture', expiresAt: new Date(Date.now() + 60000) } });
  const invitedLogin = await api('POST', '/api/invite/mfa-invitation-fixture', { password: credentials.password });
  assert.equal(invitedLogin.data.code, 'MFA_REQUIRED');
  assert.equal((await db.teamInvitation.findUniqueOrThrow({ where: { id: invite.id } })).status, 'pending');

  await db.session.create({ data: { userId: a.data.user.id, sessionToken: 'unverified-session-fixture', expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await api('GET', '/api/data', undefined, 'auth_session=unverified-session-fixture')).res.status, 401);
  const needMfa = await api('POST', '/api/auth/login', credentials);
  assert.equal(needMfa.data.code, 'MFA_REQUIRED'); assert.equal(needMfa.cookie, undefined);
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: 'invalid' })).res.status, 401);
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: activationCode })).res.status, 401);
  const freshCode = totpAt(setupMfa.data.secret, Date.now() + 30000);
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: freshCode })).res.status, 200);
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: freshCode })).res.status, 401);
  const recovery = enabledMfa.data.recoveryCodes;
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: recovery[0] })).res.status, 200);
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: recovery[0] })).res.status, 401);
  for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login', { ...credentials, code: 'invalid' });
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: recovery[1] })).res.status, 429);
  // Advance the persisted cooldown in this isolated test database.
  await db.userMfa.update({ where: { userId: a.data.user.id }, data: { lockedUntil: new Date(0) } });
  assert.equal((await api('POST', '/api/auth/login', { ...credentials, code: recovery[1] })).res.status, 200);
  const disabledMfa = await api('POST', '/api/auth/mfa', { action: 'disable', password: credentials.password, code: recovery[2] }, a.cookie);
  assert.equal(disabledMfa.res.status, 200); assert.equal(disabledMfa.data.enabled, false);
  assert.equal((await api('POST', '/api/auth/login', credentials)).res.status, 200);
  const mfaAudit = JSON.stringify(await db.auditLog.findMany({ where: { action: { startsWith: 'mfa_' } } }));
  assert.ok(!mfaAudit.includes(setupMfa.data.secret)); assert.ok(!mfaAudit.includes(recovery[0]));
  console.log('PASS: MongoDB HTTP auth/MFA, CRUD, roles/revocation, isolation, audit and KSeF demo queue');
} catch (error) { console.error(logs); throw error; }
finally {
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000); await stopped; clearTimeout(timer); }
  await db.$disconnect(); await mongoClient.close(); await mongo.stop();
}

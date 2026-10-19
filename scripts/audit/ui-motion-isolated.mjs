/** Verify real UI animations on a disposable, loopback-only synthetic database.
 * Requires a production build. No production URL, database or provider is used.
 * Usage: node scripts/audit/ui-motion-isolated.mjs [built-app-root] [output-dir]
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';

const appRoot = resolve(process.argv[2] || '.');
const out = resolve(process.argv[3] || `artifacts/ui-motion/${process.env.MOTION_ENGINE || 'chromium'}`);
const require = createRequire(appRoot + '/package.json');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { MongoClient, ObjectId } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const { chromium, webkit, expect } = require('@playwright/test');
const { migrateData } = await import(pathToFileURL(appRoot + '/scripts/migrate-data.mjs'));
const inherit = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const errors = [], blocked = [];
let mongo, db, native, browser, server, logs = '';
await mkdir(out, { recursive: true });
try {
  mongo = await MongoMemoryReplSet.create({ binary: { ...(process.env.MONGOMS_SYSTEM_BINARY ? {systemBinary:process.env.MONGOMS_SYSTEM_BINARY} : {}), version:'7.0.14' }, replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
  const uri = mongo.getUri('fakturaprosto_product_film_synthetic');
  const schema = spawn(process.execPath, [appRoot + '/node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { cwd: appRoot, env: { ...inherit, DATABASE_URL: uri }, stdio: 'inherit' });
  assert.equal((await once(schema, 'exit'))[0], 0);
  native = await MongoClient.connect(uri); await migrateData(native.db(), 'up');
  db = new PrismaClient({ datasources: { db: { url: uri } } });
  const terms = (await readFile(appRoot + '/src/lib/legal/config.ts', 'utf8')).match(/terms:\s*"([^"]+)"/)[1];
  const consent = (await readFile(appRoot + '/src/lib/cookie-consent.ts', 'utf8')).match(/COOKIE_CONSENT_VERSION\s*=\s*"([^"]+)"/)[1];
  const user = await db.user.create({ data: { email: 'demo-film@example.invalid', name: 'Anna · konto demonstracyjne', password: 'unusable-film-fixture', termsAcceptedAt: new Date(), termsAcceptedVersion: terms } });
  const company = await db.companyProfile.create({ data: { userId: user.id, nip: '5260301706', companyName: 'Studio Aurora · DEMO', street: 'Przykładowa', buildingNumber: '12', city: 'Warszawa', postalCode: '00-001', isDefault: true } });
  const buyer = await db.contractor.create({ data: { userId: user.id, companyId: company.id, name: 'Pracownia Forma · DEMO', nip: '5250001003', address: { street: 'Demonstracyjna 8', city: 'Kraków', postal: '30-001', country: 'PL' }, country: 'PL', taxIdType: 'nip', email: 'klient@example.invalid' } });
  await db.subscription.create({ data: { userId: user.id, plan: 'yearly', status: 'active', accessSource: 'complimentary', currentPeriodEnd: new Date(Date.now() + 86400000) } });
  const token = randomBytes(32).toString('base64url');
  await db.session.create({ data: { userId: user.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) } });
  const today = new Date().toISOString().slice(0, 10), day = new Date();
  const docs = Array.from({ length: 14 }, (_, i) => {
    const cost = i % 4 === 0, net = cost ? 450 + i * 25 : 1200 + i * 160, vat = net * .23;
    const d = new Date(day); d.setUTCDate(Math.max(1, day.getUTCDate() - i * 2));
    const due = new Date(d); due.setUTCDate(d.getUTCDate() + 14);
    return { _id: new ObjectId(), userId: new ObjectId(user.id), sellerCompanyId: new ObjectId(company.id), contractorId: buyer.id, number: `${cost ? 'FZ' : 'FV'}/${String(i + 1).padStart(2, '0')}/${today.slice(5, 7)}/${today.slice(0, 4)}`, type: cost ? 'purchase' : 'sale', status: 'issued', documentStatus: 'issued', ksefStatus: 'none', paymentStatus: i % 3 === 0 ? 'paid' : 'unpaid', version: 1, currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14, issueDate: d.toISOString().slice(0, 10), saleDate: d.toISOString().slice(0, 10), dueDate: due.toISOString().slice(0, 10), lines: [{ id: `line-${i}`, name: cost ? 'Materiały do projektu · DEMO' : 'Projekt identyfikacji wizualnej · DEMO', quantity: 1, unit: 'usł.', netPrice: net, vatRate: '23', discount: 0 }], totalNet: net, totalVat: vat, totalGross: net + vat, totalNetPln: net, totalVatPln: vat, totalGrossPln: net + vat, paidAmount: i % 3 === 0 ? net + vat : 0, nip: '', isCorrection: false, isOffline: false, isRecurring: false, isProforma: false, gtuCodes: [], jpkProcedures: [], createdAt: new Date(day.getTime() - i * 3600000), updatedAt: new Date() };
  });
  await native.db().collection('Invoice').insertMany(docs);
  
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = socket.address().port; await new Promise(r => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  const env = { ...inherit, DATABASE_URL: uri, NODE_ENV: 'production', COOKIE_SECURE: 'false', NEXTAUTH_SECRET: 'isolated-product-film-auth-secret-long-enough', NEXTAUTH_URL: base, APP_URL: base, URL: base, CRON_SECRET: 'isolated-film-cron-secret', KSEF_QUEUE_SECRET: 'isolated-film-queue-secret', KSEF_PAUSE_DISPATCH: 'true', KSEF_TOKEN: '', KSEF_NIP: '', KSEF_ENV: 'test', KSEF_ENVIRONMENT: 'test', RESEND_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', MFA_ENCRYPTION_KEY: '', GUS_API_KEY: '', PILOT_METRICS_SECRET: '' };
  server = spawn(process.execPath, ['--require', appRoot + '/scripts/performance/loopback-only.cjs', appRoot + '/node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
  let healthy = false;
  for (let i = 0; i < 160; i++) {
    assert.equal(server.exitCode, null, logs);
    try { const r = await fetch(base + '/api/health'); const h = await r.json(); healthy = r.ok && h.ok && h.db === 'ok'; } catch { /* startup */ }
    if (healthy) break; await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(healthy, 'Local synthetic app must start');
  const isWebkit=process.env.MOTION_ENGINE === 'webkit'; browser = await (isWebkit?webkit:chromium).launch({ executablePath: isWebkit?process.env.WEBKIT_EXECUTABLE:process.env.CHROMIUM_EXECUTABLE, headless:true,env:{...process.env,TMPDIR:'/tmp'} });
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', serviceWorkers: 'block', extraHTTPHeaders: { Origin: base } });
  await context.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }, { name: 'fakturo_consent', value: encodeURIComponent(JSON.stringify({ version: consent, essential: true, functional: false, analytics: false, marketing: false, timestamp: new Date().toISOString() })), url: base, sameSite: 'Lax' }]);
  await context.addInitScript(({ userId, companyId }) => {
    if (location.hostname !== '127.0.0.1') return;
    for (const preference of ['guide-seen', 'banner-dismissed']) {
      localStorage.setItem(`fakturo_onboarding_v3:${preference}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`, 'true');
    }
    localStorage.setItem('fakturaprosto-theme', 'light');
  }, { userId: user.id, companyId: company.id });
  await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.origin !== base || (/^\/api\/ksef\//.test(u.pathname) && route.request().method() !== 'GET')) { blocked.push({ origin: u.origin === base ? 'local' : 'external', path: u.pathname }); return route.abort(); } return route.continue(); });
  await context.addInitScript(() => { window.print = () => {}; window.close = () => {}; });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const { auditUiMotion } = await import(pathToFileURL(appRoot + '/scripts/audit/ui-motion-browser.mjs'));
  await auditUiMotion({page,context,base,companyId:company.id,out,expect,engine:process.env.MOTION_ENGINE || 'chromium'});
  assert.deepEqual(errors, []);
  assert.equal(blocked.length, 0);
  console.log('[ui-motion] PASS no page errors or external provider calls');
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000); await stopped; clearTimeout(timer); }
  await native?.close(); await db?.$disconnect(); await mongo?.stop(); await writeFile(out + '/capture-server.log', logs);
}

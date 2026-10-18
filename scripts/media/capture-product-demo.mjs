/** Capture the real app on a disposable, loopback-only synthetic database.
 * Requires a production build. No production URL, database or provider is used.
 * Usage: node scripts/media/capture-product-demo.mjs [built-app-root] [output-dir]
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
const out = resolve(process.argv[3] || 'artifacts/product-demo');
const require = createRequire(appRoot + '/package.json');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { MongoClient, ObjectId } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const { chromium, expect } = require('@playwright/test');
const { migrateData } = await import(pathToFileURL(appRoot + '/scripts/migrate-data.mjs'));
const build = JSON.parse(await readFile(appRoot + '/.next/required-server-files.json', 'utf8'));
const inherit = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const errors = [], blocked = [];
let mongo, db, native, browser, server, logs = '';
await mkdir(out, { recursive: true });
try {
  mongo = await MongoMemoryReplSet.create({ binary: { systemBinary: process.env.MONGOMS_SYSTEM_BINARY || '/workspace/.cache/faktura-runtime/mongodb/mongod', version: '7.0.14' }, replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
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
  const original = docs.find(d => d.type === 'sale');
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true });
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1680, height: 880 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { Origin: base } });
  await context.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }, { name: 'fakturo_consent', value: encodeURIComponent(JSON.stringify({ version: consent, essential: true, functional: false, analytics: false, marketing: false, timestamp: new Date().toISOString() })), url: base, sameSite: 'Lax' }]);
  await context.addInitScript(({ userId, companyId }) => {
    if (location.hostname !== '127.0.0.1') return;
    for (const preference of ['guide-seen', 'banner-dismissed']) {
      localStorage.setItem(`fakturo_onboarding_v3:${preference}:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`, 'true');
    }
    localStorage.setItem('fakturaprosto-theme', 'dark');
  }, { userId: user.id, companyId: company.id });
  await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.origin !== base || /^\/api\/ksef\//.test(u.pathname)) { blocked.push({ origin: u.origin === base ? 'local' : 'external', path: u.pathname }); return route.abort(); } return route.continue(); });
  let page;
  const go = async path => { if (page) await page.close(); page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(path, { waitUntil: 'networkidle' }); await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true'); await page.evaluate(() => document.fonts.ready); };
  const shot = async name => { await page.mouse.move(3, 3); await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' }); console.log('[product-film] captured ' + name); };
  await go('/dashboard'); await expect(page.getByRole('heading', { name: 'Przegląd', exact: true })).toBeVisible(); await shot('01-dashboard');
  await go('/settings/companies'); await page.getByTitle('Edytuj dane firmy', { exact: true }).click(); await expect(page.locator('#company-name')).toHaveValue(company.companyName); await shot('02-company');
  await go('/invoices/new'); await page.locator('#invoice-contractorId').click(); await page.getByRole('option', { name: /Pracownia Forma/ }).click();
  await page.getByRole('textbox', { name: 'Nazwa pozycji 1', exact: true }).fill('Projekt identyfikacji wizualnej · DEMO'); await page.getByRole('spinbutton', { name: 'Cena netto pozycji 1', exact: true }).fill('2400');
  await expect(page.locator('.invoice-paper')).toContainText(/2\s?952,00/); await shot('03-first-invoice');
  await page.locator('.invoice-paper').screenshot({ path: `${out}/04-live-preview.png`, animations: 'disabled' });
  await go(`/invoices/${original._id}`); await expect(page.locator('.invoice-paper')).toContainText(original.number); await shot('05-invoice-detail');
  const pdf = await context.request.get(`/api/invoices/${original._id}/pdf`); assert.ok(pdf.ok()); const bytes = await pdf.body(); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); await writeFile(out + '/demo-invoice.pdf', bytes);
  await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click(); await expect(page.getByRole('heading', { name: '2 Pozycje po korekcie', exact: true })).toBeVisible();
  await page.getByLabel('Przyczyna korekty (pole wymagane w schemacie FA(3)) *', { exact: true }).fill('Zmniejszenie zakresu projektu · dane demonstracyjne');
  await page.getByRole('spinbutton', { name: 'Cena netto pozycji 1', exact: true }).fill(String(original.totalNet / 2)); await expect(page.getByTestId('correction-difference')).toContainText('-');
  await page.getByText('Przygotowano korektę', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 }); await shot('06-correction');
  await go('/invoices'); await expect(page.locator('tbody tr').first()).toBeVisible(); await shot('07-invoices');
  await go('/calendar'); await expect(page.locator('main').getByRole('heading', { name: 'Terminarz płatności & Podatki', exact: true })).toBeVisible(); await shot('08-calendar');
  assert.equal(await native.db().collection('Invoice').countDocuments(), docs.length, 'Recording must not issue or transmit an invoice');
  assert.deepEqual(errors, []);
  await writeFile(out + '/capture-manifest.json', JSON.stringify({ at: new Date().toISOString(), appRevision: build.config.env.APP_BUILD_REVISION, scope: 'Disposable local synthetic account only', providerCalls: 'Blocked; no KSeF transmission, email, billing or real customer data', invoiceCountUnchanged: docs.length, pageErrors: errors, blockedRequests: blocked, browser: browser.version(), viewport: { width: 1680, height: 880 } }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000); await stopped; clearTimeout(timer); }
  await native?.close(); await db?.$disconnect(); await mongo?.stop(); await writeFile(out + '/capture-server.log', logs);
}

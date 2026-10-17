// Isolated real-Next private UI benchmark. No supplied URL or DB is accepted.
// Usage: node scripts/performance/private-page-speed.mjs --app-root . --output artifacts/performance/private-page-speed.json --runs 3
// Optional: --cpu-rate 1 --cold-only --diagnostic (separate diagnostic profile).
// Binaries: --mongo-binary or MONGOMS_SYSTEM_BINARY; --chromium or CHROMIUM_EXECUTABLE_PATH.
// No URL, database, credential, PDF or KSeF action options are accepted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { options, numberOption } from './metrics.mjs';
const args = options();
const acceptedOptions = ['app-root', 'output', 'runs', 'cpu-rate', 'cold-only', 'diagnostic', 'mongo-binary', 'chromium'];
assert.ok(Object.keys(args).every(key => acceptedOptions.includes(key)), 'Only isolated fixture options are accepted; remote URLs/databases/credentials are forbidden');
for (const key of ['cold-only', 'diagnostic'])
    assert.ok(args[key] === undefined || args[key] === true, '--' + key + ' is a flag without a value');
for (const key of ['app-root', 'output', 'mongo-binary', 'chromium'])
    assert.ok(args[key] === undefined || typeof args[key] === 'string', '--' + key + ' requires a value');
const repo = resolve(args['app-root'] || process.cwd()), output = resolve(args.output || 'artifacts/performance/private-page-speed.json');
const repetitionsCount = numberOption(args.runs, 3, 1, 5, 'runs'), cpuRate = numberOption(args['cpu-rate'], 4, 1, 8, 'cpu-rate');
const coldOnly = args['cold-only'] === true, diagnostic = args.diagnostic === true;
const mongoBinary = args['mongo-binary'] || process.env.MONGOMS_SYSTEM_BINARY;
const chromiumPath = args.chromium || process.env.CHROMIUM_EXECUTABLE_PATH;
const require = createRequire(resolve(repo, 'package.json'));
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { PrismaClient } = require('@prisma/client');
const { MongoClient, ObjectId } = require('mongodb');
const { chromium } = require('@playwright/test');
const { migrateData } = await import(pathToFileURL(resolve(repo, 'scripts/migrate-data.mjs')));
const inherited = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
const round = x => Number(x.toFixed(1));
let mongo, native, db, browser, server, serverLogs = '';
const samples = [], backend = [];
async function stopServer() { if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
} server = null; }
const revisionCommand = spawn('git', ['rev-parse', 'HEAD'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
let revision = '';
revisionCommand.stdout.on('data', d => revision += d);
assert.equal((await once(revisionCommand, 'exit'))[0], 0, 'Git revision failed');
const buildConfig=JSON.parse(await readFile(resolve(repo,'.next/required-server-files.json'),'utf8'));
const buildRevision=buildConfig.config?.env?.APP_BUILD_REVISION;
assert.match(buildRevision,/^[a-f\d]{40}$/i,'Production build must record APP_BUILD_REVISION');
const report = { nodeVersion: process.version, schemaVersion: 1, diagnostic, coldOnly, at: new Date().toISOString(), revision: buildRevision, buildRevision, checkoutRevision: revision.trim(), buildId: (await readFile(resolve(repo, '.next/BUILD_ID'), 'utf8')).trim(), conditions: { application: 'real production Next build; synthetic isolated Mongo replica set; one tenant/300 invoices; no production credentials', viewport: '390x844, Chromium mobile/touch', cpuSlowdown: cpuRate, network: { latencyMs: 80, downloadMbps: 10, uploadMbps: 5 }, cold: 'new Next process (health-only readiness probe) plus new browser context/cache, each route independently; process startup excluded', warm: 'same browser/store/process: client link to other route then return, with assets cached', skeleton: 'first rAF-visible skeleton DOM; not a guaranteed paint timestamp', ready: 'first rendered action section (dashboard) or nonloading 30-row result table with detail link (invoices)', ttfb: 'Navigation/Resource Timing requestStart to responseStart; separate unthrottled direct API serial samples', limits: 'Small controlled laboratory sample, no production geography/concurrency/real-user percentile claim; app warm-up, CPU contention and browser emulation affect results. PDF and KSeF endpoints/provider actions excluded.' }, samples, backend };
report.conditions["skeleton"] = "First requestAnimationFrame callback where a main aria-busy skeleton or route status skeleton has a visible DOM layout. This is not a guaranteed paint timestamp: rAF precedes paint and a later long task may delay paint. Use FCP separately.";
report.conditions["ready"] = "First rAF callback where the data-derived dashboard action section, or all 30 visible-layout invoice detail links without loading status, exist in DOM. Not a guaranteed paint timestamp or completion of optional charts. Server-rendered data may become ready before hydration; controls readiness is measured separately.";
report.conditions.controlsReady = 'First rAF-visible dashboard refresh button with its natural React onClick prop, or invoice search input with its natural React onChange prop. A hydration signal, not an executed action or a guaranteed paint timestamp. Data-and-controls readiness is the maximum of readyMs and controlsReadyMs.';
report.measurementVersion = 2;
report.conditions.observerWork = 'Read-only rAF probes scan only pending metrics: data rows stop being inspected after first data-ready, all layout probes stop after data and controls are ready, and a warm route reset starts them again. The first-ready criteria are unchanged. Earlier version-1 runs kept scanning settled rows during hydration; timings across these versions are not directly paired.';
report.conditions.warmHydrationGuard = 'Each collection waits for both data and control hydration before continuing. Before warm navigation, the visible Next link must also have its natural React onClick prop. Every warm navigation must preserve a unique document identity; full reloads fail the benchmark. Earlier reports without this guard measured warm navigation after client-rendered data readiness.';
report.conditions["fcp"] = "Navigation Paint Timing first-contentful-paint, measured separately from DOM skeleton and data readiness; navigation values only apply to cold document entries.";
report.conditions["host"] = "Browser, application server and MongoDB are co-located. Run without concurrent builds/browser benchmarks. Host limits are recorded separately when available. A laboratory relative comparison, not a real-user loading SLO.";
report.conditions.providerGuard='Next uses loopback-only.cjs; Chromium uses a non-listening external proxy plus resolver isolation, and CDP Network.setBlockedURLs blocks KSeF/PDF/export-pack requests before navigation. No Playwright routing is installed, so normal HTTP caching remains enabled. Baseline had zero requests matching these additional CDP guards.';
report.conditions["navigationTiming"] = "Navigation Timing belongs only to cold-entry document navigation. Warm-client records retain the original document navigation entry; use their route ready/skeleton measurements and API Resource Timing separately.";
report.nodeVersion = process.version;
report.workerChecks=[];
report.hostLimits = {};
for (const [key, path] of [['cpuQuota', '/sys/fs/cgroup/cpu.max'], ['memoryLimitBytes', '/sys/fs/cgroup/memory.max']]) {
    try {
        report.hostLimits[key] = (await readFile(path, 'utf8')).trim();
    }
    catch { }
}
try {
    mongo = await MongoMemoryReplSet.create({ binary: mongoBinary ? { systemBinary: mongoBinary } : undefined, replSet: { count: 1 }, instanceOpts: [{ args: ['--nounixsocket'] }] });
    const uri = mongo.getUri('fakturaprosto_private_speed');
    const schema = spawn(process.execPath, [resolve(repo, 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], { cwd: repo, env: { ...inherited, DATABASE_URL: uri }, stdio: ['ignore', 'pipe', 'pipe'] });
    let schemaLog = '';
    schema.stdout.on('data', d => schemaLog += d);
    schema.stderr.on('data', d => schemaLog += d);
    assert.equal((await once(schema, 'exit'))[0], 0, 'Schema failed ' + schemaLog);
    native = await MongoClient.connect(uri);
    await migrateData(native.db(), 'up');
    db = new PrismaClient({ datasources: { db: { url: uri } } });
    const legal = (await readFile(resolve(repo, 'src/lib/legal/config.ts'), 'utf8')).match(/terms:\s*"([^"]+)"/)[1];
    const user = await db.user.create({ data: { email: 'speed@example.invalid', name: 'Synthetic speed user', password: 'not-a-real-login-credential', termsAcceptedAt: new Date(), termsAcceptedVersion: legal } });
    const company = await db.companyProfile.create({ data: { userId: user.id, nip: '5260301706', companyName: 'Synthetic speed tenant', isDefault: true } });
    const contractor = await db.contractor.create({ data: { userId: user.id, companyId: company.id, name: 'Synthetic buyer', nip: '5250001003', address: { street: 'Testowa 1', city: 'Warszawa', postal: '00-001', country: 'PL' } } });
    await db.subscription.create({ data: { userId: user.id, plan: 'yearly', status: 'active', accessSource: 'complimentary', currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const bearer = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: user.id, sessionToken: 'sha256:' + createHash('sha256').update(bearer).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    const lines = [{ id: 'line', name: 'Synthetic test service', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23', discount: 0 }];
    const invoices = Array.from({ length: 300 }, (_, i) => { const day = new Date(Date.UTC(2026, 0, 1 + i % 280)).toISOString().slice(0, 10), createdAt = new Date(Date.UTC(2026, 0, 1) + i * 1000); return { _id: new ObjectId(), userId: new ObjectId(user.id), sellerCompanyId: new ObjectId(company.id), contractorId: contractor.id, number: `SPEED/${String(i + 1).padStart(3, '0')}`, type: 'sale', status: 'issued', documentStatus: 'issued', ksefStatus: 'none', paymentStatus: 'unpaid', version: 1, currency: 'PLN', language: 'PL', paymentMethod: 'transfer', paymentTermDays: 14, issueDate: day, saleDate: day, dueDate: '2026-10-30', lines, totalNet: 100, totalVat: 23, totalGross: 123, totalNetPln: 100, totalVatPln: 23, totalGrossPln: 123, paidAmount: 0, nip: '', isCorrection: false, isOffline: false, isRecurring: false, isProforma: false, gtuCodes: [], jpkProcedures: [], notes: 'Synthetic fixture, not accounting document', createdAt, updatedAt: createdAt }; });
    await native.db().collection('Invoice').insertMany(invoices);
    async function startServer() {
        const socket = createServer();
        socket.listen(0, '127.0.0.1');
        await once(socket, 'listening');
        const port = socket.address().port;
        await new Promise(r => socket.close(r));
        const base = `http://127.0.0.1:${port}`;
        const env = { ...inherited, DATABASE_URL: uri, NODE_ENV: 'production', COOKIE_SECURE: 'false', NEXTAUTH_SECRET: 'isolated-private-ui-benchmark-auth-secret', NEXTAUTH_URL: base, APP_URL: base, URL: base, CRON_SECRET: 'isolated-benchmark-cron', KSEF_QUEUE_SECRET: 'isolated-benchmark-queue', KSEF_PAUSE_DISPATCH: 'true', KSEF_TOKEN: '', KSEF_NIP: '', KSEF_ENV: 'test', KSEF_ENVIRONMENT: 'test', RESEND_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', MFA_ENCRYPTION_KEY: '', GUS_API_KEY: '', GUS_ENV: 'test', PILOT_METRICS_SECRET: '' };
        serverLogs = '';
        server = spawn(process.execPath, ['--require', resolve(repo, 'scripts/performance/loopback-only.cjs'), resolve(repo, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', d => serverLogs = (serverLogs + d).slice(-12000));
        server.stderr.on('data', d => serverLogs = (serverLogs + d).slice(-12000));
        for (let i = 0; i < 120; i++) {
            assert.equal(server.exitCode, null, 'Next server exited ' + serverLogs);
            try {
                const response=await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
                if (response.ok) {
                    const health=await response.json();
                    assert.equal(health.revision,buildRevision,'Worker health revision must match the recorded production build');
                    assert.equal(health.ok,true);
                    report.workerChecks.push({revision:health.revision,db:health.db});
                    return base;
                }
            }
            catch(error) { if(error.code==='ERR_ASSERTION') throw error; }
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('Next did not become ready');
    }
    browser = await chromium.launch({ ...(chromiumPath ? { executablePath: chromiumPath } : {}), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
    report.browserVersion = browser.version();
    for (const route of ['/dashboard', '/invoices'])
        for (let iteration = 1; iteration <= repetitionsCount; iteration++) {
            const base = await startServer();
            const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
            context.setDefaultTimeout(30000);
            await context.addCookies([{ name: 'auth_session', value: bearer, url: base, httpOnly: true, sameSite: 'Lax' }]);
            const blocked = [];
            context.on('request', r => { const url = new URL(r.url()); if (url.origin !== base || /\/api\/ksef|\/pdf|\/api\/invoices\/export|\/api\/accountant\/export-pack/i.test(url.pathname))
                blocked.push(url.origin === base ? url.pathname : 'external'); });
            await context.addInitScript(({ diagnostic }) => {
                if (diagnostic) {
                    window.__speedLongTasks = [];
                    new PerformanceObserver(list => window.__speedLongTasks.push(...list.getEntries().map(e => ({ startMs: e.startTime, durationMs: e.duration, name: e.name })))).observe({ type: 'longtask', buffered: true });
                }
                localStorage.setItem('fakturo_onboarding_completed_v2', 'true');
                window.__speedDocumentId = `${performance.timeOrigin}:${Math.random()}`;
                window.__speed = { route: location.pathname, start: 0, skeletonMs: null, shellMs: null, headingMs: null, readyMs: null, controlsReadyMs: null };
                window.__speedReset = route => window.__speed = { route, start: performance.now(), skeletonMs: null, shellMs: null, headingMs: null, readyMs: null, controlsReadyMs: null };
                // Read React's naturally attached DOM props; never install handlers or dispatch actions to mark hydration.
                window.__speedHasReactHandler = function hasReactHandler(node, handler) {
                    return !!node && Object.getOwnPropertyNames(node).some(key => key.startsWith('__reactProps$') && typeof node[key]?.[handler] === 'function');
                };
                const visible = node => {
                    if (!node || node.getClientRects().length === 0) return false;
                    const style = getComputedStyle(node);
                    return style.visibility !== 'hidden' && Number(style.opacity) > 0;
                };
                const tick = () => {
                    const m = window.__speed, t = performance.now() - m.start;
                    // Stop probing settled measurements. Re-reading every row's
                    // layout while waiting for hydration perturbs the thing we
                    // measure; a route reset starts the same criteria again.
                    if (location.pathname === m.route && (m.readyMs === null || m.controlsReadyMs === null)) {
                        const main = document.querySelector('main');
                        if (m.shellMs === null && visible(main))
                            m.shellMs = t;
                        const skeleton = document.querySelector('main [aria-busy="true"], [role="status"][aria-busy="true"]');
                        if (m.skeletonMs === null && visible(skeleton))
                            m.skeletonMs = t;
                        if (m.headingMs === null && visible(document.querySelector('main h1')))
                            m.headingMs = t;
                        if (m.readyMs === null) {
                            const invoiceLinks = m.route === '/invoices'
                                ? [...document.querySelectorAll('main a')].filter(a => a.textContent.trim() === 'Szczegóły dokumentu' && visible(a))
                                : [];
                            const ready = m.route === '/dashboard' ? document.querySelector('[aria-label="Sprawy wymagające działania"]') : invoiceLinks.length === 30 ? invoiceLinks[0] : null;
                            const loading = [...document.querySelectorAll('main [role="status"]')].some(n => n.textContent.includes('Ładowanie…'));
                            if (visible(ready) && !loading) m.readyMs = t;
                        }
                        if (m.controlsReadyMs === null) {
                            const control = m.route === '/dashboard'
                                ? document.querySelector('main button[aria-label="Odśwież przegląd"]')
                                : document.querySelector('main input[placeholder="Szukaj: numer, kontrahent, NIP, numer KSeF…"]');
                            if (visible(control) && window.__speedHasReactHandler(control, m.route === '/dashboard' ? 'onClick' : 'onChange'))
                                m.controlsReadyMs = t;
                        }
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }, { diagnostic });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', e => errors.push(e.message));
            const cdp = await context.newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
            await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs',{urls:['*/api/ksef*','*/pdf*','*/api/invoices/export*','*/api/accountant/export-pack*']});
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 10 * 1000000 / 8, uploadThroughput: 5 * 1000000 / 8 });
            let documentIdentity;
            async function collect(kind, target, navigate) {
                await navigate();
                await page.waitForFunction(() => window.__speed && window.__speed.readyMs !== null && window.__speed.controlsReadyMs !== null, {}, { timeout: 45000 });
                const currentDocumentIdentity = await page.evaluate(() => window.__speedDocumentId);
                assert.equal(typeof currentDocumentIdentity, 'string', 'Document identity marker must exist');
                if (kind === 'cold-entry')
                    documentIdentity = currentDocumentIdentity;
                else
                    assert.equal(currentDocumentIdentity, documentIdentity, 'Warm client navigation must not reload the document');
                const record = await page.evaluate(() => { const m = window.__speed; return { ...m, ...(window.__speedLongTasks ? { longTasks: window.__speedLongTasks, allResources: performance.getEntriesByType('resource').map(r => ({ path: new URL(r.name).pathname, initiator: r.initiatorType, startMs: r.startTime, requestStartMs: r.requestStart, responseStartMs: r.responseStart, responseEndMs: r.responseEnd, bytes: r.encodedBodySize })) } : {}), navigation: performance.getEntriesByType('navigation').map(n => ({ ttfbMs: n.responseStart - n.requestStart, responseMs: n.responseEnd - n.requestStart, documentRawBytes: n.decodedBodySize, documentWireBytes: n.encodedBodySize, documentTransferBytes: n.transferSize, dclMs: n.domContentLoadedEventEnd, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime })), resources: performance.getEntriesByType('resource').filter(r => r.startTime >= m.start && new URL(r.name).pathname.startsWith('/api/')).map(r => ({ path: new URL(r.name).pathname, startMs: r.startTime - m.start, requestStartMs: r.requestStart - m.start, responseStartMs: r.responseStart - m.start, ttfbMs: r.responseStart - r.requestStart, endMs: r.responseEnd - m.start, bytes: r.encodedBodySize })) }; });
                assert.equal(record.route, target, 'Readiness must belong to the requested route');
                record.dataAndControlsReadyMs = Math.max(record.readyMs, record.controlsReadyMs);
                for (const key of ['skeletonMs', 'shellMs', 'headingMs', 'readyMs', 'controlsReadyMs', 'dataAndControlsReadyMs'])
                    if (record[key] !== null)
                        record[key] = round(record[key]);
                delete record.start;
                record.kind = kind;
                record.iteration = iteration;
                record.coldEntry = route;
                record.route = target;
                record.jsErrors = errors.slice();
                record.blockedRequests = blocked.slice();
                record.domNavigation = kind === 'cold-entry';
                record.documentIdentity = currentDocumentIdentity;
                samples.push(record);
                console.log(JSON.stringify({ kind, route: target, iteration, skeletonMs: record.skeletonMs, readyMs: record.readyMs, controlsReadyMs: record.controlsReadyMs, dataAndControlsReadyMs: record.dataAndControlsReadyMs, api: record.resources.map(r => ({ path: r.path, ttfbMs: round(r.ttfbMs) })), jsErrors: errors.length, blocked: blocked.length }));
                return record;
            }
            await collect('cold-entry', route, () => page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 }));
            const other = route === '/dashboard' ? '/invoices' : '/dashboard';
            for (const target of coldOnly ? [] : [other, route])
                await collect('warm-client', target, async () => {
                    await page.waitForFunction(target => [...document.querySelectorAll(`a[href="${target}"]`)].some(anchor => anchor.getClientRects().length > 0 && window.__speedHasReactHandler(anchor, 'onClick')), target);
                    await page.evaluate(target => { window.__speedReset(target); const links = [...document.querySelectorAll(`a[href="${target}"]`)]; const anchor = links.find(a => a.getClientRects().length > 0); if (!anchor)
                    throw new Error('No visible app link for ' + target); anchor.click(); }, target); });
            for (const path of ['/api/data?invoiceMode=list', `/api/overview?companyId=${company.id}&months=6`, `/api/invoices/search?companyId=${company.id}&type=all`]) {
                const start = performance.now();
                const res = await fetch(base + path, { headers: { Cookie: `auth_session=${bearer}` }, signal: AbortSignal.timeout(15000) });
                const ttfbMs = performance.now() - start;
                const body = await res.arrayBuffer();
                assert.ok(res.ok, 'API benchmark failed ' + res.status);
                backend.push({ iteration, coldEntry: route, path: new URL(path, base).pathname, ttfbMs: round(ttfbMs), responseMs: round(performance.now() - start), bytes: body.byteLength, status: res.status, phase: 'serial warm backend probe; no browser throttling' });
            }
            assert.deepEqual(errors, [], 'Private UI JS errors');
            assert.deepEqual(blocked, [], 'Unexpected external/PDF/KSeF request');
            await context.close();
            await stopServer();
        }
    const stats = values => { values = values.filter(x => x !== null).sort((a, b) => a - b); return { n: values.length, min: values[0] ?? null, median: values.length ? round((values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2) : null, max: values.at(-1) ?? null }; };
    assert.equal(samples.length, repetitionsCount * (coldOnly ? 2 : 6), 'Missing route samples');
    assert.equal(backend.length, repetitionsCount * 6, 'Missing backend samples');
    report.summary = {};
    for (const route of ['/dashboard', '/invoices'])
        for (const kind of coldOnly ? ['cold-entry'] : ['cold-entry', 'warm-client']) {
            const group = samples.filter(s => s.route === route && s.kind === kind);
            report.summary[route + ' ' + kind] = { skeletonMs: stats(group.map(s => s.skeletonMs)), readyMs: stats(group.map(s => s.readyMs)), controlsReadyMs: stats(group.map(s => s.controlsReadyMs)), dataAndControlsReadyMs: stats(group.map(s => s.dataAndControlsReadyMs)), allReadyUnder2500: group.every(s => s.readyMs < 2500), allDataAndControlsReadyUnder4000: group.every(s => s.dataAndControlsReadyMs < 4000) };
        }
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log('Report ' + output);
    console.log(JSON.stringify(report.summary, null, 2));
}
catch (error) {
    console.error('Benchmark failed:', error.message);
    console.error(serverLogs);
    throw error;
}
finally {
    await stopServer();
    await browser?.close();
    await db?.$disconnect();
    await native?.close();
    await mongo?.stop();
}

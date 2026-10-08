const test = require('node:test'), assert = require('node:assert/strict');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { promisify } = require('node:util');
const { execFile, spawn } = require('node:child_process');
const https = require('node:https');
const { createHmac } = require('node:crypto');
const exec = promisify(execFile);
const queues = () => ({ ok: true, paused: false, generatedAt: new Date().toISOString(),
  ksef: { due: 0, verifyNeeded: 0, failed: 0, expiredProcessing: 0, oldestDueAgeSeconds: null },
  email: { due: 0, verifyNeeded: 0, failed: 0, expiredSending: 0, oldestDueAgeSeconds: null } });

test('operator queues flag starvation, ambiguity, expired leases and invalid metrics', async () => {
  const { queueProblems } = await import('../ops/check-health.mjs');
  assert.deepEqual(queueProblems(queues()), []);
  const overdue = queues(); overdue.ksef.due = 1; overdue.ksef.oldestDueAgeSeconds = 301;
  assert.ok(queueProblems(overdue).includes('KSeF queue is overdue'));
  overdue.email.verifyNeeded = 1; overdue.email.expiredSending = 1;
  assert.ok(queueProblems(overdue).includes('E-mail queue requires reconciliation'));
  assert.ok(queueProblems(overdue).includes('E-mail queue has expired leases'));
  const bad = queues(); bad.ksef.due = -1; assert.ok(queueProblems(bad).includes('KSeF queue metrics are invalid'));
  assert.deepEqual(queueProblems({ ...queues(), generatedAt: new Date(Date.now() - 600000).toISOString() }), ['Queue probe is invalid or stale']);
});
test('fresh local/offsite metadata cannot compensate for an unverified restore receipt', async () => {
  const { runHealthProbe } = await import('../ops/check-health.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'fakturo-probe-fixture-'));
  try {
    await writeFile(join(directory, 'synthetic.enc'), 'fixture');
    const env = { MONITOR_HEALTH_URL: 'https://example.test/api/health', MONITOR_BACKUP_DIR: directory,
      MONITOR_BACKUP_COPY_TARGET: 'fixture:encrypted', MONITOR_OPS_TOKEN: 's'.repeat(32), MONITOR_ALERT_WEBHOOK_URL: 'https://collector.test/' };
    const requested = [];
    const fetch = async (url, opts) => {
      requested.push({ url, opts });
      if (url.includes('/api/ops/queue-health')) return Response.json(queues());
      if (url.includes('/api/ops/readiness')) return Response.json({ ok: true, generatedAt: new Date().toISOString(), backup: { status: 'ok', offsiteStatus: 'ok', restoreStatus: 'unknown' } });
      if (url.includes('/api/health')) return Response.json({ ok: true, db: 'ok' });
      if (url.includes('api.nbp.pl')) return Response.json([{ effectiveDate: '2026-10-08', rates: [] }]);
      return new Response(null, { status: 404 });
    };
    const result = await runHealthProbe(env, { fetch, execFile: async () => ({ stdout: JSON.stringify([{ Name: 'synthetic.enc', Size: 7, ModTime: new Date().toISOString() }]) }) });
    assert.equal(result.ok, false); assert.equal(result.checks.receipts, 'unverified');
    assert.ok(result.problems.some(problem => problem.includes('restore drill')));
    for (const request of requested.filter(value => value.url.includes('/api/ops/'))) {
      assert.equal(request.opts.headers.Authorization, `Bearer ${env.MONITOR_OPS_TOKEN}`); assert.equal(request.opts.redirect, 'error');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('controlled alert drill reaches a real local HTTPS collector with a verifiable signature', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fakturo-https-alert-fixture-'));
  let server;
  try {
    const keyFile = join(directory, 'key.pem'), certFile = join(directory, 'cert.pem');
    await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certFile,
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { timeout: 10000 });
    let received;
    const secret = 'a'.repeat(32);
    server = https.createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (req, res) => {
      let body = ''; req.on('data', data => { body += data; }); req.on('end', () => {
        received = { body, signature: req.headers['x-monitor-signature'] }; res.writeHead(204); res.end();
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const result = await exec(process.execPath, ['scripts/ops/check-health.mjs', '--alert-drill'], { cwd: join(__dirname, '../..'),
      env: { ...process.env, NODE_EXTRA_CA_CERTS: certFile, MONITOR_ALERT_WEBHOOK_URL: `https://127.0.0.1:${server.address().port}/test-alert`, MONITOR_ALERT_SECRET: secret }, timeout: 15000 });
    assert.ok(received); assert.equal(received.signature, createHmac('sha256', secret).update(received.body).digest('hex'));
    const event = JSON.parse(received.body); assert.equal(event.kind, 'fakturo_alert_drill'); assert.ok(event.drillId);
    assert.ok(!('token' in event)); assert.ok(!('invoice' in event));
    assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).delivered, true);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

import { readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';
const execFileAsync = promisify(execFile);
const timeoutMs = 10000;
const httpsUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};

export function queueProblems(body, env = {}) {
  const issues = [];
  const seconds = (key, fallback) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isFinite(value) || value < 1) throw new Error('Invalid queue threshold');
    return value;
  };
  if (body?.ok !== true || !body.ksef || !body.email || !Number.isFinite(Date.parse(body.generatedAt))
    || Math.abs(Date.now() - Date.parse(body.generatedAt)) > 300000) return ['Queue probe is invalid or stale'];
  if (body.paused) issues.push('KSeF dispatch is paused');
  for (const [name, label, threshold] of [
    ['ksef', 'KSeF', seconds('MONITOR_KSEF_MAX_DUE_AGE_SECONDS', 300)],
    ['email', 'E-mail', seconds('MONITOR_EMAIL_MAX_DUE_AGE_SECONDS', 300)],
  ]) {
    const queue = body[name];
    if (['due', 'verifyNeeded', 'failed', name === 'ksef' ? 'expiredProcessing' : 'expiredSending'].some(key => !Number.isInteger(queue[key]) || queue[key] < 0)) {
      issues.push(`${label} queue metrics are invalid`); continue;
    }
    if (queue.due > 0 && (!Number.isFinite(queue.oldestDueAgeSeconds) || queue.oldestDueAgeSeconds > threshold)) issues.push(`${label} queue is overdue`);
    if (queue.verifyNeeded > 0) issues.push(`${label} queue requires reconciliation`);
    if (queue.failed > 0) issues.push(`${label} queue has failed jobs`);
    if (queue[name === 'ksef' ? 'expiredProcessing' : 'expiredSending'] > 0) issues.push(`${label} queue has expired leases`);
  }
  return issues;
}

export async function deliverAlert(event, env = process.env, fetchImpl = fetch) {
  if (!httpsUrl(env.MONITOR_ALERT_WEBHOOK_URL)) return { delivered: false, reason: 'Alert destination is not configured with HTTPS' };
  const body = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (env.MONITOR_ALERT_SECRET) {
    if (env.MONITOR_ALERT_SECRET.length < 32) return { delivered: false, reason: 'Alert signing secret is too short' };
    headers['X-Monitor-Signature'] = createHmac('sha256', env.MONITOR_ALERT_SECRET).update(body).digest('hex');
  }
  try {
    const response = await fetchImpl(env.MONITOR_ALERT_WEBHOOK_URL, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    return { delivered: response.ok, ...(response.ok ? {} : { reason: 'Alert destination rejected the event' }) };
  } catch { return { delivered: false, reason: 'Alert destination is unavailable' }; }
}

export async function runHealthProbe(env = process.env, deps = {}) {
  const fetchImpl = deps.fetch || fetch, exec = deps.execFile || execFileAsync;
  const endpoint = env.MONITOR_HEALTH_URL, directory = env.MONITOR_BACKUP_DIR, offsiteTarget = env.MONITOR_BACKUP_COPY_TARGET;
  const maxHours = Number(env.MONITOR_BACKUP_MAX_AGE_HOURS || '36');
  const ksefUrl = env.MONITOR_KSEF_URL || 'https://api-test.ksef.mf.gov.pl/v2';
  const problems = [], checks = {};
  if (!httpsUrl(endpoint)) problems.push('MONITOR_HEALTH_URL must use HTTPS');
  if (!directory || !isAbsolute(directory)) problems.push('MONITOR_BACKUP_DIR must be absolute');
  if (!Number.isFinite(maxHours) || maxHours <= 0) problems.push('Invalid backup age limit');
  if (!offsiteTarget || !/^[\w-]+:[^\s]+$/.test(offsiteTarget)) problems.push('MONITOR_BACKUP_COPY_TARGET must identify an offsite rclone directory');
  if (!/^https:\/\/api(?:-test|-demo)?\.ksef\.mf\.gov\.pl\/v2\/?$/.test(ksefUrl)) problems.push('Invalid KSeF gateway URL');
  const opsToken = env.MONITOR_OPS_TOKEN;
  if (!opsToken || opsToken.length < 24) problems.push('MONITOR_OPS_TOKEN is required to verify queues and restore receipts');
  if (!httpsUrl(env.MONITOR_ALERT_WEBHOOK_URL)) problems.push('Independent HTTPS alert destination is required');
  const getJson = async (url, headers) => {
    const response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Probe failed'); }
    return response.json();
  };
  const checksToRun = [];
  if (httpsUrl(endpoint)) {
    checksToRun.push((async () => {
      try { const body = await getJson(endpoint); checks.application = body.ok === true && body.db === 'ok' ? 'ok' : 'failed'; }
      catch { checks.application = 'failed'; }
      if (checks.application !== 'ok') problems.push('Application or database is unavailable');
    })());
    if (opsToken?.length >= 24) {
      const base = new URL(endpoint);
      for (const [path, key] of [['/api/ops/queue-health', 'queues'], ['/api/ops/readiness', 'receipts']]) {
        const override = key === 'queues' ? env.MONITOR_QUEUE_URL : env.MONITOR_READINESS_URL;
        const url = override || new URL(path, base).toString();
        checksToRun.push((async () => {
          if (!httpsUrl(url)) { problems.push(`Invalid ${key} probe URL`); return; }
          try {
            const body = await getJson(url, { Authorization: `Bearer ${opsToken}` });
            if (key === 'queues') { const issues = queueProblems(body, env); problems.push(...issues); checks.queues = issues.length ? 'failed' : 'ok'; }
            else {
              if (body.ok !== true || !body.backup || !Number.isFinite(Date.parse(body.generatedAt))
                || Math.abs(Date.now() - Date.parse(body.generatedAt)) > 300000) throw new Error('Invalid receipts');
              checks.receipts = ['status', 'offsiteStatus', 'restoreStatus'].every(key => body.backup[key] === 'ok') ? 'ok' : 'unverified';
              if (checks.receipts !== 'ok') problems.push('Backup, matching offsite copy or restore drill lacks a fresh receipt');
            }
          } catch { checks[key] = 'failed'; problems.push(`${key} probe unavailable`); }
        })());
      }
    }
  }
  if (/^https:\/\/api(?:-test|-demo)?\.ksef\.mf\.gov\.pl\/v2\/?$/.test(ksefUrl)) checksToRun.push((async () => {
    try {
      const response = await fetchImpl(ksefUrl, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      checks.ksefGateway = response.status < 500 ? 'reachable' : 'failed'; await response.body?.cancel();
    } catch { checks.ksefGateway = 'failed'; }
    if (checks.ksefGateway === 'failed') problems.push('KSeF gateway unavailable');
  })());
  checksToRun.push((async () => {
    try {
      const body = await getJson('https://api.nbp.pl/api/exchangerates/tables/A/?format=json');
      checks.nbp = Array.isArray(body) && body[0]?.effectiveDate && Array.isArray(body[0]?.rates) ? 'ok' : 'failed';
    } catch { checks.nbp = 'failed'; }
    if (checks.nbp !== 'ok') problems.push('NBP rates unavailable');
  })());
  if (directory && isAbsolute(directory) && Number.isFinite(maxHours) && maxHours > 0) checksToRun.push((async () => {
    try {
      const files = (await readdir(directory)).filter(file => file.endsWith('.enc'));
      const ages = await Promise.all(files.map(async file => {
        const info = await stat(resolve(directory, file)); return info.isFile() && info.size > 0 ? info.mtimeMs : 0;
      }));
      checks.localBackup = ages.some(time => time <= Date.now() + 300000 && Date.now() - time <= maxHours * 3600000) ? 'fresh' : 'stale';
    } catch { checks.localBackup = 'unreadable'; }
    if (checks.localBackup !== 'fresh') problems.push('Local encrypted backup is missing, unreadable or stale');
  })());
  if (offsiteTarget && /^[\w-]+:[^\s]+$/.test(offsiteTarget)) checksToRun.push((async () => {
    try {
      const { stdout } = await exec('rclone', ['lsjson', offsiteTarget, '--files-only', '--include', '*.enc'], { timeout: 12000, maxBuffer: 1024 * 1024 });
      const files = JSON.parse(stdout), now = Date.now();
      checks.offsite = Array.isArray(files) && files.some(file => file.Name?.endsWith('.enc') && file.Size > 0
        && Number.isFinite(Date.parse(file.ModTime)) && Date.parse(file.ModTime) <= now + 300000 && now - Date.parse(file.ModTime) <= maxHours * 3600000) ? 'fresh' : 'stale';
    } catch { checks.offsite = 'unreadable'; }
    if (checks.offsite !== 'fresh') problems.push('Offsite encrypted backup is missing, unreadable or stale');
  })());
  await Promise.all(checksToRun);
  return { kind: 'fakturo_health_check', ok: problems.length === 0, checkedAt: new Date().toISOString(), checks, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = process.argv.includes('--alert-drill')
    ? { kind: 'fakturo_alert_drill', ok: false, checkedAt: new Date().toISOString(), drillId: randomUUID(), problems: ['Controlled operator alert test; no production failure asserted'] }
    : await runHealthProbe();
  console.log(JSON.stringify(event));
  if (!event.ok) {
    const delivery = await deliverAlert(event);
    console.log(JSON.stringify({ kind: 'fakturo_alert_delivery', ...delivery, ...(event.drillId ? { drillId: event.drillId } : {}) }));
    process.exitCode = event.kind === 'fakturo_alert_drill' && delivery.delivered ? 0 : 1;
  }
}

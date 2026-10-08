import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { browserChecks } from './browser-checks.mjs';

// A separate browser regression entrypoint avoids rerunning the complete API suite.
// Neither the inherited DATABASE_URL nor an external target can be used.
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: process.platform === 'win32' ? [] : [{ args: ['--nounixsocket'] }] });
const uri = mongo.getUri('fakturo_browser_integration');
const db = new PrismaClient({ datasources: { db: { url: uri } } });
const port = 44000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
const guard = fileURLToPath(new URL('./performance/loopback-only.cjs', import.meta.url));
const env = { ...process.env, DATABASE_URL: uri, NODE_ENV: 'production', COOKIE_SECURE: 'false',
  NEXTAUTH_SECRET: 'isolated-browser-auth-secret-long-enough', CRON_SECRET: 'isolated-browser-cron-secret-long-enough',
  RESEND_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', PILOT_METRICS_SECRET: '', MFA_ENCRYPTION_KEY: '',
  NODE_OPTIONS: `--require=${JSON.stringify(guard)}` };
let server, logs = '';
try {
  const push = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env, stdio: 'inherit', timeout: 60000 });
  assert.equal((await once(push, 'exit'))[0], 0);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Isolated browser application must start');
  process.env.RUN_ALL_MOBILE_CHECKS = '1';
  if (process.env.RUN_WEBKIT_CHECKS === undefined) process.env.RUN_WEBKIT_CHECKS = '1';
  await browserChecks(base, db);
  console.log('[browser-isolated] PASS: browser/mobile checks with external providers blocked');
} catch (error) { console.error(logs); throw error; }
finally {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit'); server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    await stopped; clearTimeout(timer);
  }
  await db.$disconnect(); await mongo.stop();
}

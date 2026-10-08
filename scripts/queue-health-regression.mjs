import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const Module = require('node:module');

/** Real isolated Mongo aggregates: all accounts and rows, not the last 50 displayed in the panel. */
export async function checkQueueHealth(db) {
  const suffix = randomBytes(8).toString('hex');
  const user = await db.user.create({ data: { email: `queue-health-${suffix}@example.test`, password: 'synthetic-hash', role: 'owner' } });
  const other = await db.user.create({ data: { email: `queue-health-other-${suffix}@example.test`, password: 'synthetic-hash', role: 'owner' } });
  const path = require.resolve('../src/lib/ksef/queue-health.ts');
  const previousModule = require.cache[path];
  const originalLoad = Module._load;
  const now = new Date(), past = new Date(now.getTime() - 3600_000), future = new Date(now.getTime() + 3600_000);
  try {
    const contractor = await db.contractor.create({ data: { userId: user.id, name: 'Synthetic queue buyer', nip: '5250001003', address: {} } });
    const invoiceData = { contractorId: contractor.id, type: 'sale', status: 'ksef_active', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', lines: [] };
    const invoice = await db.invoice.create({ data: { ...invoiceData, userId: user.id, number: 'QUEUE-HEALTH/BASE' } });
    const taskBase = { userId: user.id, invoiceId: invoice.id, environment: 'test', status: 'queued' };
    await db.ksefQueueTask.createMany({ data: [
      ...Array.from({ length: 55 }, (_, i) => ({ ...taskBase, idempotencyKey: `health:${suffix}:${i}`, nextAttemptAt: now })),
      ...Array.from({ length: 6 }, (_, i) => ({ ...taskBase, userId: other.id, idempotencyKey: `health:${suffix}:other:${i}`, nextAttemptAt: i === 5 ? future : past })),
      { ...taskBase, idempotencyKey: `health:${suffix}:expired`, status: 'processing', lockedUntil: past },
      { ...taskBase, idempotencyKey: `health:${suffix}:inflight`, status: 'processing', lockedUntil: future },
      { ...taskBase, idempotencyKey: `health:${suffix}:verify`, status: 'verify_needed' },
      { ...taskBase, idempotencyKey: `health:${suffix}:failed`, status: 'failed' },
      { ...taskBase, idempotencyKey: `health:${suffix}:completed`, status: 'completed' },
    ] });
    const emailBase = { ...invoiceData, userId: user.id, autoSendEmailOnKsef: true, ksefStatus: 'accepted', ksefNumber: 'SYNTHETIC-KSEF-NUMBER', upoXml: '<UPO>synthetic</UPO>', ksef: { environment: 'production' }, autoKsefEmailStatus: 'queued' };
    await db.invoice.createMany({ data: [
      ...Array.from({ length: 55 }, (_, i) => ({ ...emailBase, number: `HEALTH-DEMO/${i}`, ksef: { environment: 'demo' }, updatedAt: past })),
      { ...emailBase, number: 'HEALTH-PROD', updatedAt: past },
      { ...emailBase, userId: other.id, number: 'HEALTH-TEST', ksef: { environment: 'test' }, autoKsefEmailStatus: 'retry', autoKsefEmailNextAttemptAt: now },
      { ...emailBase, number: 'HEALTH-FUTURE', autoKsefEmailStatus: 'retry', autoKsefEmailNextAttemptAt: future },
      { ...emailBase, number: 'HEALTH-SENDING', autoKsefEmailStatus: 'sending', autoKsefEmailLockedUntil: future },
      { ...emailBase, number: 'HEALTH-EXPIRED', autoKsefEmailStatus: 'sending', autoKsefEmailLockedUntil: past },
      { ...emailBase, number: 'HEALTH-VERIFY', autoKsefEmailStatus: 'verify_needed' },
      { ...emailBase, number: 'HEALTH-FAILED', autoKsefEmailStatus: 'failed' },
      { ...emailBase, number: 'HEALTH-NO-UPO', upoXml: null },
      { ...emailBase, number: 'HEALTH-CANCELLED', autoSendEmailOnKsef: false, autoKsefEmailStatus: 'cancelled' },
    ] });
    Module._load = function(request, parent, main) { if (request === '@/lib/db') return { prisma: db }; return originalLoad.call(this, request, parent, main); };
    delete require.cache[path];
    const { getQueueHealth } = require(path);
    Module._load = originalLoad;
    const metrics = await getQueueHealth(now);
    assert.equal(metrics.ksef.queued, 61); assert.equal(metrics.ksef.due, 60);
    assert.equal(metrics.ksef.processing, 2); assert.equal(metrics.ksef.expiredProcessing, 1);
    assert.equal(metrics.ksef.verifyNeeded, 1); assert.equal(metrics.ksef.failed, 1);
    assert.equal(metrics.ksef.oldestDueAt, past.toISOString()); assert.equal(metrics.ksef.oldestDueAgeSeconds, 3600);
    assert.equal(metrics.email.due, 2, 'Demo, future retry, missing UPO and cancelled mail are not ready deliveries');
    assert.equal(metrics.email.sending, 2); assert.equal(metrics.email.expiredSending, 1);
    assert.equal(metrics.email.verifyNeeded, 1); assert.equal(metrics.email.failed, 1);
    assert.equal(metrics.email.oldestDueAt, past.toISOString()); assert.equal(metrics.email.oldestDueAgeSeconds, 3600);
    const serialized = JSON.stringify(metrics);
    for (const sensitive of [user.id, other.id, invoice.id, user.email, 'SYNTHETIC-KSEF-NUMBER', '<UPO>']) assert.ok(!serialized.includes(sensitive));
    console.log('[integration] PASS queue health: global backlog beyond 50 rows, exact due/expired counts, oldest due across accounts and no document data');
  } finally {
    Module._load = originalLoad;
    if (previousModule) require.cache[path] = previousModule; else delete require.cache[path];
    await db.ksefQueueTask.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await db.user.delete({ where: { id: user.id } });
    await db.user.delete({ where: { id: other.id } });
  }
}

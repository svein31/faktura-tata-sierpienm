require('./register-ts.cjs');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { issuePilotCookie, pilotIdentity, persistPilotEvent, persistPilotVital, withdrawPilotMetrics, PILOT_COOKIE } = require('../src/lib/pilot-metrics.ts');
const uri = process.env.DATABASE_URL || '';
const parsed = new URL(uri);
if (process.env.PILOT_ISOLATED_TEST !== 'true' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)
  || !/fakturo.*(?:integration|test)/.test(parsed.pathname)) throw new Error('Pilot regression requires an explicitly isolated loopback test database.');
const client = new MongoClient(uri);
(async () => {
  await client.connect(); const db = client.db(), secret = process.env.PILOT_METRICS_SECRET;
  const cookie = issuePilotCookie(secret), identity = pilotIdentity(cookie, secret);
  const existingCookie = issuePilotCookie(secret), existingIdentity = pilotIdentity(existingCookie, secret);
  const request = new Request('https://example.test/api/pilot/events', { headers: { cookie: `${PILOT_COOKIE}=${cookie}` } });
  try {
    await Promise.all(Array.from({ length: 8 }, () => persistPilotEvent(cookie, 'visit')));
    await Promise.all(Array.from({ length: 8 }, () => persistPilotEvent(cookie, 'register')));
    const visitor = await db.collection('PilotMetric').findOne({ _id: identity.visitor });
    assert.equal(await db.collection('PilotMetric').countDocuments({ _id: identity.visitor }), 1);
    assert.ok(visitor.stages.visit instanceof Date); assert.ok(visitor.stages.register instanceof Date);
    assert.deepEqual(Object.keys(visitor).sort(), ['_id', 'createdAt', 'expiresAt', 'stages']);
    const sample = { metric: 'LCP', metricId: 'v5-page-001', value: 900, pageClass: 'public', device: 'mobile' };
    await Promise.all(Array.from({ length: 4 }, () => persistPilotVital(cookie, sample)));
    assert.equal(await db.collection('PilotVital').countDocuments({ visitor: identity.visitor }), 1);
    await persistPilotVital(cookie, { ...sample, value: 999 });
    const metric = await db.collection('PilotVital').findOne({ visitor: identity.visitor });
    assert.equal(metric.value, 999); assert.ok(!('metricId' in metric)); assert.ok(!JSON.stringify(metric).includes(cookie.split('.')[0]));
    await persistPilotVital(cookie, { ...sample, metricId: 'v5-page-002', value: 1500 });
    assert.equal(await db.collection('PilotVital').countDocuments({ visitor: identity.visitor }), 2);
    await persistPilotEvent(cookie, 'first_invoice'); await persistPilotEvent(cookie, 'pro');
    await persistPilotEvent(existingCookie, 'visit'); await persistPilotEvent(existingCookie, 'first_invoice'); await persistPilotEvent(existingCookie, 'pro');
    // Reporting fixture tests exact per-page p75 independently of a user's worst sample.
    await db.collection('PilotVital').insertMany(Array.from({ length: 200 }, (_, i) => ({
      _id: `${identity.visitor}:quantile-fixture-${i}`, visitor: identity.visitor, metric: 'LCP', value: i,
      pageClass: 'app', device: 'desktop', createdAt: new Date(), expiresAt: identity.expiresAt,
    })));
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/ops/pilot-report.mjs'], {
      env: { ...process.env, PILOT_REPORT_DATABASE_URL: uri }, timeout: 10000,
    });
    const report = JSON.parse(stdout);
    const quantile = report.fieldVitals.find(row => row.metric === 'LCP' && row.pageClass === 'app' && row.device === 'desktop');
    assert.equal(quantile.samples, 200); assert.equal(quantile.p75, 149); assert.equal(quantile.gate, 'passed');
    assert.equal(report.fieldVitals.find(row => row.pageClass === 'public').gate, 'insufficient_samples');
    assert.equal(report.counts.first_invoice, 1); assert.equal(report.observedStageCounts.first_invoice, 2);
    assert.equal(report.activationRate, 1); assert.equal(report.paidConversionRate, 1, 'Existing accounts cannot inflate a registration conversion above 100%');
    // Withdrawal races against queued callbacks; serialization must remove or reject every sample.
    await Promise.all([withdrawPilotMetrics(request), ...Array.from({ length: 8 }, (_, i) => persistPilotVital(cookie, { ...sample, metricId: `v5-race-${i}` }))]);
    await persistPilotVital(cookie, { ...sample, metricId: 'v5-late-event' });
    await persistPilotEvent(cookie, 'pro');
    assert.equal(await db.collection('PilotVital').countDocuments({ visitor: identity.visitor }), 0);
    const revoked = await db.collection('PilotMetric').findOne({ _id: identity.visitor });
    assert.equal(revoked.revoked, true); assert.ok(!('stages' in revoked)); assert.ok(!('createdAt' in revoked)); assert.ok(!('vitalFence' in revoked));
    assert.deepEqual(Object.keys(revoked).sort(), ['_id', 'expiresAt', 'revoked']);
    console.log('[integration] PASS pilot metrics deduplicate browser stages/page samples, report exact per-page p75 and fence late writes after consent withdrawal');
  } finally {
    await db.collection('PilotVital').deleteMany({ visitor: identity.visitor });
    await db.collection('PilotMetric').deleteOne({ _id: identity.visitor });
    await db.collection('PilotMetric').deleteOne({ _id: existingIdentity.visitor });
    await client.close(); if (globalThis.pilotMongo) await (await globalThis.pilotMongo).close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

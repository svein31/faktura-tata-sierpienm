import { MongoClient } from 'mongodb';
import { pilotFunnelGroup, pilotFunnelSummary, pilotFieldVitals } from './pilot-report-core.mjs';
const uri = process.env.PILOT_REPORT_DATABASE_URL;
if (!uri?.startsWith('mongodb')) { console.error('Set read-only PILOT_REPORT_DATABASE_URL; production access is never inherited from DATABASE_URL.'); process.exit(1); }
const days = Number(process.env.PILOT_REPORT_DAYS || 28);
if (!Number.isInteger(days) || days < 1 || days > 30) { console.error('PILOT_REPORT_DAYS must be an integer from 1 to 30.'); process.exit(1); }
const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const now = new Date(), from = new Date(now.getTime() - days * 86400000);
  const [totals] = await client.db().collection('PilotMetric').aggregate([
    { $match: { revoked: { $ne: true }, createdAt: { $gte: from, $lte: now }, expiresAt: { $gt: now } } },
    { $group: pilotFunnelGroup() },
    { $project: { _id: 0 } },
  ], { maxTimeMS: 5000 }).toArray();
  const funnel = pilotFunnelSummary(totals);
  const samples = new Map(); let totalSamples = 0;
  for await (const row of client.db().collection('PilotVital').find({ createdAt: { $gte: from, $lte: now }, expiresAt: { $gt: now } }, {
    projection: { _id: 0, metric: 1, value: 1, pageClass: 1, device: 1 }, maxTimeMS: 5000, batchSize: 500,
  }).limit(200001)) {
    if (++totalSamples > 200000) throw new Error('Narrow the report window');
    if (!['TTFB', 'LCP', 'INP', 'CLS'].includes(row.metric) || !['public', 'app'].includes(row.pageClass)
      || !['mobile', 'desktop'].includes(row.device) || !Number.isFinite(row.value) || row.value < 0
      || row.value > (row.metric === 'CLS' ? 100 : 120000)) continue;
    const key = `${row.pageClass}:${row.device}:${row.metric}`;
    if (!samples.has(key)) samples.set(key, []);
    samples.get(key).push(row.value);
  }
  const fieldVitals = pilotFieldVitals(samples);
  console.log(JSON.stringify({ event: 'pilot_funnel_report', generatedAt: now.toISOString(), from: from.toISOString(),
    unit: 'consenting_browser_cohort', fieldVitalsUnit: 'page_metric_samples', retentionDays: 30, ...funnel, fieldVitals,
    limitations: ['Only opt-in browser cohorts; different devices are separate.', 'KSeF and Pro count confirmed status polling; not every invoice or renewal.',
      'Funnel counts require prior stages in chronological order in this browser cohort; existing accounts without observed registration are excluded from conversion rates.',
      'Pro is a branch after registration and may precede the first invoice. An active Stripe subscription is an entitlement observation, not audited revenue or settlement.',
      'Activation time is the mean between observed registration and first issued sales invoice, not an account-lifetime median.',
      'First invoice means the first qualifying invoice observed for this browser, not the account lifetime.',
      'Counts are not unique customers and do not establish causal attribution.', 'Vitals are browser measurements; fewer than 200 samples per group do not pass a readiness gate.'] }));
} catch { console.error('Pilot report unavailable. No financial or personal records printed.'); process.exitCode = 1; }
finally { await client.close(); }

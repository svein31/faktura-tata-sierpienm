import { MongoClient } from 'mongodb';
const uri = process.env.PILOT_REPORT_DATABASE_URL;
if (!uri?.startsWith('mongodb')) { console.error('Set read-only PILOT_REPORT_DATABASE_URL; production access is never inherited from DATABASE_URL.'); process.exit(1); }
const days = Number(process.env.PILOT_REPORT_DAYS || 28);
if (!Number.isInteger(days) || days < 1 || days > 30) { console.error('PILOT_REPORT_DAYS must be an integer from 1 to 30.'); process.exit(1); }
const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const now = new Date(), from = new Date(now.getTime() - days * 86400000);
  const stages = ['visit', 'register', 'first_invoice', 'ksef', 'pro'];
  const required = { visit: ['visit'], register: ['visit','register'], first_invoice: ['visit','register','first_invoice'],
    ksef: ['visit','register','first_invoice','ksef'], pro: ['visit','register','pro'] };
  const sum = fields => ({ $sum: { $cond: [{ $and: fields.map(field => ({ $eq: [{ $type: `$stages.${field}` }, 'date'] })) }, 1, 0] } });
  const [totals] = await client.db().collection('PilotMetric').aggregate([
    { $match: { revoked: { $ne: true }, createdAt: { $gte: from, $lte: now }, expiresAt: { $gt: now } } },
    { $group: { _id: null, ...Object.fromEntries(stages.flatMap(stage => [[stage, sum(required[stage])], [`observed_${stage}`, sum([stage])]])) } },
    { $project: { _id: 0 } },
  ], { maxTimeMS: 5000 }).toArray();
  const counts = Object.fromEntries(stages.map(stage => [stage, totals?.[stage] || 0]));
  const observedStageCounts = Object.fromEntries(stages.map(stage => [stage, totals?.[`observed_${stage}`] || 0]));
  const samples = new Map(); let totalSamples = 0;
  for await (const row of client.db().collection('PilotVital').find({ createdAt: { $gte: from, $lte: now }, expiresAt: { $gt: now } }, {
    projection: { _id: 0, metric: 1, value: 1, pageClass: 1, device: 1 }, maxTimeMS: 5000, batchSize: 500,
  }).limit(200001)) {
    if (++totalSamples > 200000) throw new Error('Narrow the report window');
    if (!['TTFB', 'LCP', 'INP', 'CLS'].includes(row.metric) || !['public', 'app'].includes(row.pageClass)
      || !['mobile', 'desktop'].includes(row.device) || !Number.isFinite(row.value)) continue;
    const key = `${row.pageClass}:${row.device}:${row.metric}`;
    if (!samples.has(key)) samples.set(key, []);
    samples.get(key).push(row.value);
  }
  const fieldVitals = [...samples].map(([key, values]) => {
    values.sort((a, b) => a - b);
    const [pageClass, device, metric] = key.split(':');
    const p75 = values[Math.ceil(values.length * 0.75) - 1], threshold = metric === 'LCP' ? 1000 : metric === 'CLS' ? 0 : 100;
    return { pageClass, device, metric, samples: values.length, p75, target: threshold,
      gate: values.length < 200 ? 'insufficient_samples' : (metric === 'CLS' ? p75 === 0 : p75 < threshold) ? 'passed' : 'failed' };
  });
  console.log(JSON.stringify({ event: 'pilot_funnel_report', generatedAt: now.toISOString(), from: from.toISOString(),
    unit: 'consenting_browser_cohort', fieldVitalsUnit: 'page_metric_samples', retentionDays: 30, counts, observedStageCounts, fieldVitals,
    registrationRate: counts.visit ? counts.register / counts.visit : null,
    activationRate: counts.register ? counts.first_invoice / counts.register : null,
    paidConversionRate: counts.register ? counts.pro / counts.register : null,
    limitations: ['Only opt-in browser cohorts; different devices are separate.', 'KSeF and Pro count confirmed status polling; not every invoice or renewal.',
      'Funnel counts require prior stages in this browser cohort; existing accounts without observed registration are excluded from conversion rates.',
      'First invoice means the first qualifying invoice observed for this browser, not the account lifetime.',
      'Counts are not unique customers and do not establish causal attribution.', 'Vitals are browser measurements; fewer than 200 samples per group do not pass a readiness gate.'] }));
} catch { console.error('Pilot report unavailable. No financial or personal records printed.'); process.exitCode = 1; }
finally { await client.close(); }

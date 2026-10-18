export const PILOT_REPORT_STAGES = ['visit', 'register', 'first_invoice', 'ksef', 'pro'];
const required = {
  visit: ['visit'], register: ['visit', 'register'], first_invoice: ['visit', 'register', 'first_invoice'],
  ksef: ['visit', 'register', 'first_invoice', 'ksef'], pro: ['visit', 'register', 'pro'],
};

// Date order matters: an existing customer's earlier invoice is not a new signup's activation.
export function pilotStageCondition(fields) {
  return { $and: [
    ...fields.map(field => ({ $eq: [{ $type: `$stages.${field}` }, 'date'] })),
    ...fields.slice(1).map((field, index) => ({ $lte: [`$stages.${fields[index]}`, `$stages.${field}`] })),
  ] };
}

export function pilotFunnelGroup() {
  const sum = fields => ({ $sum: { $cond: [pilotStageCondition(fields), 1, 0] } });
  return { _id: null, ...Object.fromEntries(PILOT_REPORT_STAGES.flatMap(stage => [
    [stage, sum(required[stage])], [`observed_${stage}`, sum([stage])],
  ])), activationTotalMs: { $sum: { $cond: [pilotStageCondition(required.first_invoice),
    { $subtract: ['$stages.first_invoice', '$stages.register'] }, 0] } } };
}

export function pilotFunnelSummary(totals = {}) {
  const counts = Object.fromEntries(PILOT_REPORT_STAGES.map(stage => [stage, totals[stage] || 0]));
  const observedStageCounts = Object.fromEntries(PILOT_REPORT_STAGES.map(stage => [stage, totals[`observed_${stage}`] || 0]));
  const step = (from, to) => ({ from, to, eligible: counts[from], completed: counts[to],
    incomplete: counts[from] - counts[to], conversionRate: counts[from] ? counts[to] / counts[from] : null });
  return { counts, observedStageCounts,
    steps: [step('visit', 'register'), step('register', 'first_invoice'), step('first_invoice', 'ksef'), step('register', 'pro')],
    activationTime: { unit: 'ms', samples: counts.first_invoice,
      mean: counts.first_invoice ? totals.activationTotalMs / counts.first_invoice : null },
    registrationRate: counts.visit ? counts.register / counts.visit : null,
    activationRate: counts.register ? counts.first_invoice / counts.register : null,
    paidConversionRate: counts.register ? counts.pro / counts.register : null };
}

export function pilotFieldVitals(samples) {
  // Missing groups must be visibly insufficient, never absent or implicitly green.
  return ['public', 'app'].flatMap(pageClass => ['mobile', 'desktop'].flatMap(device => ['TTFB', 'LCP', 'INP', 'CLS'].map(metric => {
    const values = [...(samples.get(`${pageClass}:${device}:${metric}`) || [])].sort((a, b) => a - b);
    const p75 = values.length ? values[Math.ceil(values.length * 0.75) - 1] : null;
    const threshold = metric === 'LCP' ? 1000 : metric === 'CLS' ? 0 : 100;
    return { pageClass, device, metric, samples: values.length, p75, target: threshold,
      gate: values.length < 200 ? 'insufficient_samples' : (metric === 'CLS' ? p75 === 0 : p75 < threshold) ? 'passed' : 'failed' };
  })));
}

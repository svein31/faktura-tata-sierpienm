export const config = { schedule: '* * * * *' };
export default async function () {
  const base = process.env.APP_URL || process.env.URL;
  if (!base) throw new Error('KSeF schedule requires APP_URL or Netlify URL');
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('KSeF schedule requires CRON_SECRET in the Functions environment');
  const url = new URL('/api/ksef/queue/process', base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('KSeF schedule requires an HTTPS application URL');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`KSeF queue worker failed: ${response.status}`);
  const result = await response.json();
  if (result.success !== true) throw new Error('KSeF queue worker did not confirm a successful run');
  // Counts and runtime only. Never log document IDs, provider errors or recipient addresses.
  console.log(JSON.stringify({ kind: 'ksef_queue_run', processed: result.processedCount, verificationChecked: result.verificationChecked,
    emailChecked: result.autoEmail?.checked, emailAccepted: result.autoEmail?.accepted,
    elapsedMs: result.elapsedMs, budgetMs: result.budgetMs, budgetExhausted: result.budgetExhausted, deferredTasks: result.deferredTasks }));
  return new Response(null, { status: 204 });
}

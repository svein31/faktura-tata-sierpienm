// Runs only on the published site. See docs/IMPLEMENTATION.md for other hosts.
export const config = { schedule: '*/15 * * * *' };
export default async function handler() {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) throw new Error('APP_URL/URL and CRON_SECRET are required for the scheduler');
  const origin = new URL(base);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Scheduler requires an HTTPS application URL');
  for (const path of ['/api/integrations/process']) {
    const response = await fetch(new URL(path, origin), { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25000), redirect: 'error' });
    if (!response.ok) throw new Error(`Scheduled task ${path} returned HTTP ${response.status}`);
  }
}

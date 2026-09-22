export const config = { schedule: '* * * * *' };
export default async function () {
  const base = process.env.APP_URL || process.env.URL;
  if (!base || !process.env.CRON_SECRET) throw new Error('KSeF schedule requires APP_URL and CRON_SECRET');
  const url = new URL('/api/ksef/queue/process', base);
  if (url.protocol !== 'https:') throw new Error('HTTPS required');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(50000) });
  if (!response.ok) throw new Error(`KSeF queue worker failed: ${response.status}`);
  return new Response(null, { status: 204 });
}

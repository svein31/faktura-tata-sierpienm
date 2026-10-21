/** Independent of GitHub: usable from Netlify scheduling or any external Node 22 host. */
export async function availabilityProbe(base, fetchImpl = fetch) {
  const origin = new URL(base);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Availability monitor requires a credential-free HTTPS origin');
  const checks = [];
  for (const path of ['/', '/api/health']) {
    let ok = false, revision = 'unknown';
    try {
      const response = await fetchImpl(new URL(path, origin), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (path === '/api/health') { const body = await response.json(); ok = response.status === 200 && body.ok === true && body.db === 'ok'; revision = /^[a-f0-9]{7,64}$/.test(body.revision) ? body.revision : 'unknown'; }
      else { ok = response.status === 200 && (response.headers.get('content-type') || '').includes('text/html'); await response.body?.cancel(); }
    } catch { /* Return a failure without exposing URL, network details or credentials. */ }
    checks.push({ path, ok, ...(path === '/api/health' ? { revision } : {}) });
  }
  return { kind: 'product_availability', checkedAt: new Date().toISOString(), ok: checks.every(check => check.ok), checks };
}

import { createHmac, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
export async function archiveDigest(file) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}
export async function reportBackup(kind, file) {
  const endpoint = process.env.BACKUP_MONITOR_URL, secret = process.env.BACKUP_MONITOR_SECRET || '';
  if (!endpoint) return; // Existing operator installations keep working; UI reports unknown until configured.
  const url = new URL(endpoint); if (url.protocol !== 'https:' || secret.length < 32) throw new Error('Configure HTTPS backup monitor and a secret of at least 32 characters.');
  const body = JSON.stringify({ kind, archiveSha256: await archiveDigest(file), completedAt: new Date().toISOString(), sentAt: new Date().toISOString() });
  const res = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-Backup-Signature': createHmac('sha256', secret).update(body).digest('hex') }, body, signal: AbortSignal.timeout(15000) });
  await res.body?.cancel(); if (!res.ok) throw new Error('Backup monitor did not accept confirmation.');
}

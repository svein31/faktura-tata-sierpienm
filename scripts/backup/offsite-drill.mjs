import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
const target = process.env.MONITOR_BACKUP_COPY_TARGET || process.env.BACKUP_COPY_TARGET;
if (!target || !/^[\w-]+:[^\s]+$/.test(target) || !process.env.RESTORE_DATABASE_URL || !process.env.BACKUP_KEY) {
  console.error('Set a protected offsite rclone target, isolated RESTORE_DATABASE_URL and BACKUP_KEY.'); process.exit(1);
}
const directory = await mkdtemp(join(tmpdir(), 'fakturo-offsite-drill-'));
try {
  const { stdout } = await exec('rclone', ['lsjson', target, '--files-only', '--include', '*.enc'], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const files = JSON.parse(stdout);
  const candidates = Array.isArray(files) ? files.filter(file => file.Name?.endsWith('.enc') && !/[\/\\]/.test(file.Name)
    && file.Size > 0 && Number.isFinite(Date.parse(file.ModTime)) && Date.parse(file.ModTime) <= Date.now() + 300000) : [];
  candidates.sort((a, b) => Date.parse(b.ModTime) - Date.parse(a.ModTime));
  if (!candidates.length || Date.now() - Date.parse(candidates[0].ModTime) > 36 * 3600000) throw new Error('Missing fresh archive');
  const archive = join(directory, 'offsite.enc');
  await exec('rclone', ['copyto', target.replace(/\/$/, '') + '/' + candidates[0].Name, archive, '--immutable', '--checksum', '--quiet'], { timeout: 600000, maxBuffer: 1024 });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/backup/production-drill.mjs'], { stdio: 'inherit', env: { ...process.env, RESTORE_ARCHIVE: archive, BACKUP_DATABASE_URL: '' } });
    child.once('error', reject); child.once('exit', resolve);
  });
  if (code !== 0) throw new Error('Restore failed');
  console.log(JSON.stringify({ event: 'offsite_restore_drill', success: true, confirmedAt: new Date().toISOString() }));
} catch { console.error('Offsite restore drill failed; no successful offsite proof issued. Inspect operator logs privately.'); process.exitCode = 1; }
finally { await rm(directory, { recursive: true, force: true }); }

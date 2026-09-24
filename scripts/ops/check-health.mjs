import { readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, resolve } from "node:path";
const execFileAsync = promisify(execFile);

// Operator probe: public health endpoint + independently readable encrypted archive.
// Return nonzero for systemd/hosting alerts; do not print tokens or archive contents.
const endpoint = process.env.MONITOR_HEALTH_URL;
const directory = process.env.MONITOR_BACKUP_DIR;
const offsiteTarget = process.env.MONITOR_BACKUP_COPY_TARGET;
const maxHours = Number(process.env.MONITOR_BACKUP_MAX_AGE_HOURS || "36");
const ksefUrl = process.env.MONITOR_KSEF_URL || "https://api-test.ksef.mf.gov.pl/v2";
const nbpUrl = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const problems = [];
if (!endpoint || !/^https:\/\//.test(endpoint)) problems.push("MONITOR_HEALTH_URL must use HTTPS");
if (!directory || !isAbsolute(directory)) problems.push("MONITOR_BACKUP_DIR must be absolute");
if (!Number.isFinite(maxHours) || maxHours <= 0) problems.push("Invalid backup age limit");
const offsiteConfigured = Boolean(offsiteTarget && /^[\w-]+:[^\s]+$/.test(offsiteTarget));
if (!offsiteConfigured) problems.push("MONITOR_BACKUP_COPY_TARGET must point to the offsite rclone directory");
if (!/^https:\/\/api(?:-test|-demo)?\.ksef\.mf\.gov\.pl\/v2\/?$/.test(ksefUrl)) problems.push("Invalid KSeF gateway URL");

if (problems.length === 0 || (problems.length === 1 && !offsiteConfigured)) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.db !== "ok") problems.push("Health probe failed");
  } catch { problems.push("Health probe unavailable"); }
  // A 4xx at the API root still proves gateway reachability; this is not an authenticated KSeF flow.
  try {
    const response = await fetch(ksefUrl, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (response.status >= 500) problems.push("KSeF gateway returned a server error");
  } catch { problems.push("KSeF gateway unavailable"); }
  try {
    const response = await fetch(nbpUrl, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    const body = response.ok ? await response.json() : null;
    if (!Array.isArray(body) || !body[0]?.effectiveDate || !Array.isArray(body[0]?.rates)) problems.push("NBP rates unavailable");
  } catch { problems.push("NBP rates unavailable"); }
  try {
    const files = await readdir(directory);
    const archives = files.filter(file => file.endsWith(".enc"));
    const times = await Promise.all(archives.map(async file => {
      const info = await stat(resolve(directory, file));
      return info.isFile() && info.size > 0 ? info.mtimeMs : 0;
    }));
    if (!times.length || Date.now() - Math.max(...times) > maxHours * 3600000) problems.push("Encrypted backup is missing or stale");
  } catch { problems.push("Cannot inspect backup directory"); }
  if (offsiteConfigured) try {
    const { stdout } = await execFileAsync("rclone", ["lsjson", offsiteTarget, "--files-only", "--include", "*.enc"], { timeout: 12000, maxBuffer: 1024 * 1024 });
    const files = JSON.parse(stdout);
    if (!Array.isArray(files) || !files.some(file => file.Name?.endsWith(".enc") && file.Size > 0 &&
      Number.isFinite(Date.parse(file.ModTime)) && Date.now() - Date.parse(file.ModTime) <= maxHours * 3600000)) {
      problems.push("Offsite encrypted backup is missing or stale");
    }
  } catch { problems.push("Cannot verify offsite backup freshness"); }
}
const event = { kind: "fakturo_health_check", ok: !problems.length, checkedAt: new Date().toISOString(), problems };
console.log(JSON.stringify(event));
if (problems.length && process.env.MONITOR_ALERT_WEBHOOK_URL) {
  const url = process.env.MONITOR_ALERT_WEBHOOK_URL;
  if (!/^https:\/\//.test(url)) {
    console.error("Alert delivery URL must use HTTPS");
  } else {
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(10000) });
      if (!response.ok) console.error("Alert delivery failed");
    } catch { console.error("Alert delivery unavailable"); }
  }
}
if (problems.length) process.exitCode = 1;

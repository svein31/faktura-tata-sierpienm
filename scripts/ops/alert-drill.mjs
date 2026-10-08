import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { deliverAlert } from './check-health.mjs';
const directory = process.env.MONITOR_EVIDENCE_DIR;
if (!directory || !isAbsolute(directory)) { console.error('Set absolute MONITOR_EVIDENCE_DIR owned by the operator.'); process.exit(1); }
const command = process.argv[2];
try {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (command === 'send') {
    const drillId = randomUUID();
    const event = { kind: 'fakturo_alert_drill', ok: false, checkedAt: new Date().toISOString(), drillId, problems: ['Controlled operator alert test; no production failure asserted'] };
    const delivery = await deliverAlert(event);
    if (!delivery.delivered) throw new Error('Alert was not delivered');
    await writeFile(join(directory, `alert-${drillId}.json`), JSON.stringify({ ...event, deliveredAt: new Date().toISOString(), confirmedAt: null }), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ event: 'alert_drill_delivered', drillId, humanConfirmed: false }));
  } else if (command === 'confirm' && /^[a-f0-9-]{36}$/.test(process.argv[3] || '')) {
    const file = join(directory, `alert-${process.argv[3]}.json`);
    const proof = JSON.parse(await readFile(file, 'utf8'));
    if (proof.kind !== 'fakturo_alert_drill' || proof.drillId !== process.argv[3] || !proof.deliveredAt
      || Date.now() - Date.parse(proof.deliveredAt) > 86400000 || Date.parse(proof.deliveredAt) > Date.now() + 300000) throw new Error('Invalid or expired drill');
    await writeFile(file, JSON.stringify({ ...proof, confirmedAt: new Date().toISOString() }), { mode: 0o600 });
    console.log(JSON.stringify({ event: 'alert_drill_confirmed', drillId: proof.drillId, humanConfirmed: true }));
  } else { console.error('Use: alert-drill.mjs send, then confirm <drillId> only after the on-call operator receives the alert.'); process.exitCode = 1; }
} catch { console.error('Alert drill incomplete. A webhook HTTP 2xx alone does not confirm delivery to the on-call operator.'); process.exitCode = 1; }

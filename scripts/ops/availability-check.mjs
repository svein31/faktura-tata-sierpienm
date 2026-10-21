import { availabilityProbe } from './availability-core.mjs';
import { deliverAlert } from './check-health.mjs';
try {
  const event = await availabilityProbe(process.env.MONITOR_SITE_URL || 'https://fakturaprosto.pl');
  console.log(JSON.stringify(event));
  if (!event.ok) { const confirmation = await availabilityProbe(process.env.MONITOR_SITE_URL || 'https://fakturaprosto.pl'); if (!confirmation.ok) { console.log(JSON.stringify(await deliverAlert(confirmation))); process.exitCode = 1; } }
} catch { console.error('Availability monitor could not run. Check the explicit HTTPS origin and alert configuration.'); process.exitCode = 1; }

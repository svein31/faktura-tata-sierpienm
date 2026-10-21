import nodemailer from 'nodemailer';
import { availabilityProbe } from '../../scripts/ops/availability-core.mjs';
export const config = { schedule: '*/5 * * * *' };
const recipient = () => process.env.OPS_ALERT_EMAIL || process.env.SUPPORT_EMAIL || 'wwwyczek@gmail.com';
async function alert(event) {
  const to = recipient(), from = process.env.EMAIL_FROM || 'FakturaProsto <faktury@fakturaprosto.pl>';
  const subject = 'FakturaProsto — monitor nie potwierdził dostępności';
  const text = `Nie potwierdzono dostępności strony lub bazy po dwóch próbach.\nGodzina UTC: ${event.checkedAt.slice(0, 13)}\nSprawdź wdrożenie i logi. Wiadomość nie potwierdza utraty danych.`;
  if (process.env.RESEND_API_KEY?.trim()) {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `availability-${new Date().toISOString().slice(0, 13)}` }, body: JSON.stringify({ from, to: [to], subject, text }), redirect: 'error', signal: AbortSignal.timeout(12000) });
    await response.body?.cancel(); if (!response.ok) throw new Error('Availability alert was not accepted');
    return;
  }
  if (!process.env.SMTP_HOST?.trim()) throw new Error('Availability alert email provider is not configured');
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: true, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined, connectionTimeout: 10000, socketTimeout: 12000 });
  try { await transport.sendMail({ from, to, subject, text }); } finally { transport.close(); }
}
export default async function handler() {
  const base = process.env.APP_URL || process.env.URL;
  if (!base) throw new Error('APP_URL/URL is required for the monitor');
  let event = await availabilityProbe(base);
  if (!event.ok) { event = await availabilityProbe(base); if (!event.ok) { await alert(event); throw new Error('Product availability check failed'); } }
  const secret = process.env.CRON_SECRET || process.env.KSEF_QUEUE_SECRET;
  if (!secret || secret.length < 24) throw new Error('CRON_SECRET is required for product notification processing');
  const response = await fetch(new URL('/api/ops/product-health', base), { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('Product notification processing failed');
  const notifications = await response.json();
  if (notifications.configured !== true) throw new Error('Product notification email is not configured');
  console.log(JSON.stringify({ event: 'product_monitor', ok: true, checkedAt: event.checkedAt, notifications }));
  return new Response(null, { status: 204 });
}

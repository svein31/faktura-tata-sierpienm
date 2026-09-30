import "server-only";
export function smsConfigured() { return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM); }
export function validSmsPhone(value: unknown): value is string { return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value); }
/** Single provider request: an uncertain result must be reconciled before retrying. */
export async function sendReminderSms(to: string, text: string) {
  if (!smsConfigured() || !validSmsPhone(to)) throw new Error("Skonfiguruj Twilio i numer odbiorcy w formacie +48….");
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  if (!/^AC[a-zA-Z0-9]{32}$/.test(sid)) throw new Error("Nieprawidłowa konfiguracja dostawcy SMS.");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(sid + ":" + process.env.TWILIO_AUTH_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: text.slice(0, 480) }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Dostawca SMS odrzucił wiadomość (HTTP " + response.status + ").");
  const result = await response.json();
  if (typeof result.sid !== "string") throw new Error("Brak potwierdzenia przyjęcia SMS.");
  return { success: true, messageId: result.sid as string };
}

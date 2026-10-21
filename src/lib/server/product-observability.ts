import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { MongoClient } from "mongodb";
import { getEmailConfigStatus, sendEmail } from "@/lib/email/sender";
import { isValidEmail } from "@/lib/email/validation";
import type { DiagnosticEvent, SupportInput } from "@/lib/product-diagnostics";
const globalState = globalThis as unknown as { productObservabilityMongo?: Promise<MongoClient>; productObservabilityIndexes?: Promise<void> };
export async function productDb() {
  if (!process.env.DATABASE_URL?.startsWith("mongodb")) throw new Error("product_store_unavailable");
  if (!globalState.productObservabilityMongo) globalState.productObservabilityMongo = new MongoClient(process.env.DATABASE_URL, { maxPoolSize: 2, maxConnecting: 1, serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 }).connect().catch(error => { globalState.productObservabilityMongo = undefined; throw error; });
  const db = (await globalState.productObservabilityMongo).db();
  if (!globalState.productObservabilityIndexes) globalState.productObservabilityIndexes = Promise.all([
    db.collection("ProductDiagnostic").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("ProductDiagnostic").createIndex({ receivedAt: -1 }),
    db.collection("SupportReport").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("SupportReport").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("SupportReport").createIndex({ notification: 1, expiresAt: 1 }),
    db.collection("ProductNotification").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => {}).catch(error => { globalState.productObservabilityIndexes = undefined; throw error; });
  await globalState.productObservabilityIndexes;
  return db;
}
export const productRevision = () => /^[a-f0-9]{7,64}$/.test(process.env.APP_BUILD_REVISION || "") ? process.env.APP_BUILD_REVISION! : "unknown";
export async function persistDiagnostic(event: DiagnosticEvent, incident: string = randomUUID()) {
  const now = new Date(), db = await productDb();
  await db.collection("ProductDiagnostic").insertOne({ ...event, incident, receivedAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) });
  return incident;
}
export async function saveSupportReport(userId: string, input: SupportInput) {
  const db = await productDb(), now = new Date();
  const id = `${userId}:${input.requestId}`;
  // A retry with the same key cannot create a second ticket or notify twice.
  const result = await db.collection<{ _id: string; userId: string; reference: string; description: string; createdAt: Date; expiresAt: Date }>("SupportReport").findOneAndUpdate({ _id: id }, { $setOnInsert: { ...input, _id: id, userId, reference: randomUUID(), revision: productRevision(), createdAt: now, expiresAt: new Date(now.getTime() + 90 * 86400000), status: "new", notification: "pending" } }, { upsert: true, returnDocument: "after" });
  if (!result) throw new Error("support_store_unavailable");
  if (result.description !== input.description) throw new Error("support_key_conflict");
  return { reference: result.reference, createdAt: result.createdAt };
}
export function operatorAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.KSEF_QUEUE_SECRET || "", supplied = Buffer.from(req.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  return secret.length >= 24 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export async function notifySupport(reference: string) {
  const target = operatorNotifyTo();
  if (!isValidEmail(target) || !getEmailConfigStatus().configured) return;
  const db = await productDb();
  const report = await db.collection("SupportReport").findOneAndUpdate({ reference, notification: "pending" }, { $set: { notification: "sending", notificationClaimedAt: new Date() } }, { returnDocument: "after" });
  if (!report) return;
  try {
    // The notification contains no customer message, invoice, attachment or account email.
    await sendEmail({ singleAttempt: true, idempotencyKey: `support-${reference}`, to: target, subject: "FakturaProsto — nowe zgłoszenie", text: `Zapisano zgłoszenie ${reference}.\nEkran: ${report.screen}\nKategoria: ${report.category}\nPrzeczytaj opis w chronionym panelu: https://fakturaprosto.pl/help/reports . Panel wymaga zweryfikowanego konta operatora.` });
    await db.collection("SupportReport").updateOne({ reference }, { $set: { notification: "accepted" } });
  } catch { await db.collection("SupportReport").updateOne({ reference }, { $set: { notification: "verify_needed" } }); }
}

export const operatorNotifyTo = () => process.env.OPS_ALERT_EMAIL || process.env.SUPPORT_EMAIL || "wwwyczek@gmail.com";
export async function productHealthSummary() {
  const db = await productDb(), now = new Date(), from = new Date(now.getTime() - 86400000);
  const errors = await db.collection("ProductDiagnostic").countDocuments({ receivedAt: { $gte: from }, expiresAt: { $gt: now } });
  const tickets = await db.collection("SupportReport").countDocuments({ status: "new", expiresAt: { $gt: now } });
  const recent = await db.collection("ProductDiagnostic").find({ receivedAt: { $gte: from }, expiresAt: { $gt: now } }, { projection: { _id: 0, name: 1, kind: 1, screen: 1, fingerprint: 1, revision: 1, receivedAt: 1 }, maxTimeMS: 2000 }).sort({ receivedAt: -1 }).limit(10).toArray();
  return { ok: true, generatedAt: now.toISOString(), revision: productRevision(), errors24h: errors, openSupportReports: tickets, notificationConfigured: isValidEmail(operatorNotifyTo()) && getEmailConfigStatus().configured, pilotConfigured: (process.env.PILOT_METRICS_SECRET?.length || 0) >= 32, recent };
}
/** At most one error digest per hour; ambiguous sends are recorded, never blindly retried. */
export async function processProductNotifications() {
  const db = await productDb(), now = new Date();
  await db.collection("SupportReport").updateMany({ notification: "sending", notificationClaimedAt: { $lt: new Date(now.getTime() - 15 * 60000) } }, { $set: { notification: "verify_needed" } });
  for (const row of await db.collection("SupportReport").find({ notification: "pending", expiresAt: { $gt: now } }, { projection: { reference: 1 }, maxTimeMS: 2000 }).limit(10).toArray()) await notifySupport(row.reference);
  const target = operatorNotifyTo();
  if (!isValidEmail(target) || !getEmailConfigStatus().configured) return { configured: false, diagnosticAlert: "not-configured" };
  const from = new Date(now.getTime() - 3600000);
  const count = await db.collection("ProductDiagnostic").countDocuments({ receivedAt: { $gte: from }, expiresAt: { $gt: now } });
  if (!count) return { configured: true, diagnosticAlert: "no-errors" };
  const id = `diagnostic-alert:${now.toISOString().slice(0, 13)}`;
  try { await db.collection<{ _id: string; status: string; expiresAt: Date }>("ProductNotification").insertOne({ _id: id, status: "sending", expiresAt: new Date(now.getTime() + 7 * 86400000) }); }
  catch (error) { if ((error as { code?: number }).code === 11000) return { configured: true, diagnosticAlert: "already-claimed" }; throw error; }
  try {
    await sendEmail({ singleAttempt: true, idempotencyKey: id, to: target, subject: "FakturaProsto — błędy wymagające sprawdzenia", text: `W ostatniej godzinie zapisano ${count} technicznych zgłoszeń błędów.\nWersja: ${productRevision()}\nSzczegóły odczytasz poleceniem product-report opisanym w docs/PRODUCT-OPERATIONS.md.\nZgłoszenie błędu przeglądarki nie oznacza potwierdzonej awarii całej strony.` });
    await db.collection<{ _id: string }>("ProductNotification").updateOne({ _id: id }, { $set: { status: "accepted" } });
    return { configured: true, diagnosticAlert: "accepted-by-provider" };
  } catch { await db.collection<{ _id: string }>("ProductNotification").updateOne({ _id: id }, { $set: { status: "verify_needed" } }); return { configured: true, diagnosticAlert: "verify-needed" }; }
}

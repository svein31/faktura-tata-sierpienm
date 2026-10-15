import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MongoClient } from "mongodb";
import { after } from "next/server";
import { COOKIE_CONSENT_NAME, COOKIE_CONSENT_VERSION } from "./cookie-consent";

export const PILOT_CONSENT_VERSION = COOKIE_CONSENT_VERSION;
export const PILOT_COOKIE = "fakturo_pilot";
export const PILOT_RETENTION_MS = 30 * 86400000;
export const PILOT_EVENTS = ["visit", "register", "first_invoice", "ksef", "pro"] as const;
export type PilotEvent = typeof PILOT_EVENTS[number];
export type PilotVital = { metric: "TTFB" | "LCP" | "INP" | "CLS"; metricId: string; value: number; pageClass: "public" | "app"; device: "mobile" | "desktop" };
type Metric = { _id: string; stages?: Partial<Record<PilotEvent, Date>>; createdAt?: Date; expiresAt: Date; revoked?: boolean; vitalFence?: number };
const globalPilot = globalThis as unknown as { pilotMongo?: Promise<MongoClient> };

export function cookieValue(req: Request, name: string) {
  const match = req.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  try { return match ? decodeURIComponent(match.slice(name.length + 1)) : null; } catch { return null; }
}

export function hasPilotConsent(req: Request) {
  try {
    const consent = JSON.parse(cookieValue(req, COOKIE_CONSENT_NAME) || "null");
    return consent?.version === PILOT_CONSENT_VERSION && consent.analytics === true;
  } catch { return false; }
}

export function pilotConfigured() {
  return (process.env.PILOT_METRICS_SECRET?.length || 0) >= 32 && Boolean(process.env.DATABASE_URL?.startsWith("mongodb"));
}

function digest(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }

export function issuePilotCookie(secret: string, now = Date.now()) {
  const payload = `${randomBytes(16).toString("hex")}.${now}`;
  return `${payload}.${digest(`cookie:${payload}`, secret)}`;
}

export function pilotIdentity(value: string | null, secret: string, now = Date.now()) {
  if (secret.length < 32 || !value || !/^[a-f0-9]{32}\.\d{13}\.[a-f0-9]{64}$/.test(value)) return null;
  const [token, created, signature] = value.split(".");
  const timestamp = Number(created);
  if (timestamp > now + 60000 || now - timestamp >= PILOT_RETENTION_MS) return null;
  const expected = digest(`cookie:${token}.${created}`, secret);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return null;
  return { visitor: digest(`visitor:${token}.${created}`, secret), expiresAt: new Date(timestamp + PILOT_RETENTION_MS) };
}

async function metricsClient() {
  if (!globalPilot.pilotMongo) {
    globalPilot.pilotMongo = new MongoClient(process.env.DATABASE_URL!, {
      maxPoolSize: 2, maxConnecting: 1, serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000,
    }).connect().catch(error => { globalPilot.pilotMongo = undefined; throw error; });
  }
  return globalPilot.pilotMongo;
}
async function metricsCollection() { return (await metricsClient()).db().collection<Metric>("PilotMetric"); }

export async function persistPilotEvent(value: string, event: PilotEvent) {
  const identity = pilotIdentity(value, process.env.PILOT_METRICS_SECRET || "");
  if (!identity || !PILOT_EVENTS.includes(event)) return;
  const collection = await metricsCollection();
  try {
    await collection.updateOne({ _id: identity.visitor, revoked: { $ne: true } }, [{ $set: {
      [`stages.${event}`]: { $ifNull: [`$stages.${event}`, new Date()] },
      createdAt: { $ifNull: ["$createdAt", new Date()] }, expiresAt: { $ifNull: ["$expiresAt", identity.expiresAt] },
    } }], { upsert: true, maxTimeMS: 1000 });
  } catch (error) {
    // A revoked visitor already owns this _id. Never recreate stages after withdrawal.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

/** Called only after successful server-side writes. Next's after keeps it off the response path. */
export function recordPilotEvent(req: Request, event: Exclude<PilotEvent, "visit">) {
  if (!pilotConfigured() || !hasPilotConsent(req)) return;
  const value = cookieValue(req, PILOT_COOKIE);
  if (!pilotIdentity(value, process.env.PILOT_METRICS_SECRET!)) return;
  try {
    after(async () => {
      try { await persistPilotEvent(value!, event); }
      catch { console.warn(JSON.stringify({ event: "pilot_metric_unavailable" })); }
    });
  } catch { /* A metrics failure never changes an invoice, signup or payment result. */ }
}

export function normalisePilotVital(body: unknown): PilotVital | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "device,metric,metricId,pageClass,value"
    || !["TTFB", "LCP", "INP", "CLS"].includes(String(value.metric)) || !["public", "app"].includes(String(value.pageClass))
    || !["mobile", "desktop"].includes(String(value.device)) || typeof value.value !== "number"
    || typeof value.metricId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.metricId)
    || !Number.isFinite(value.value) || value.value < 0 || value.value > (value.metric === "CLS" ? 100 : 120000)) return null;
  return { metric: value.metric as PilotVital["metric"], metricId: value.metricId, value: value.metric === "CLS" ? value.value : Math.round(value.value),
    pageClass: value.pageClass as PilotVital["pageClass"], device: value.device as PilotVital["device"] };
}

export async function persistPilotVital(value: string, vital: PilotVital) {
  const secret = process.env.PILOT_METRICS_SECRET || "", identity = pilotIdentity(value, secret);
  if (!identity) return;
  const client = await metricsClient(), session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const guard = await client.db().collection<Metric>("PilotMetric").updateOne({ _id: identity.visitor, revoked: { $ne: true },
        "stages.visit": { $exists: true }, expiresAt: { $gt: new Date() } }, { $inc: { vitalFence: 1 } }, { session, maxTimeMS: 1000 });
      if (!guard.matchedCount) return;
      const { metric, pageClass, device } = vital;
      await client.db().collection<{ _id: string; visitor: string; metric: PilotVital["metric"]; value: number; pageClass: PilotVital["pageClass"]; device: PilotVital["device"]; createdAt: Date; expiresAt: Date }>("PilotVital").updateOne({
        _id: digest(`vital:${identity.visitor}:${metric}:${vital.metricId}`, secret),
      }, { $set: { value: vital.value }, $setOnInsert: { visitor: identity.visitor, metric, pageClass, device, createdAt: new Date(), expiresAt: identity.expiresAt } }, { upsert: true, session, maxTimeMS: 1000 });
    }, { maxCommitTimeMS: 1000 });
  } finally { await session.endSession(); }
}

export function recordPilotVital(req: Request, vital: PilotVital) {
  if (!pilotConfigured() || !hasPilotConsent(req)) return;
  const value = cookieValue(req, PILOT_COOKIE);
  if (!pilotIdentity(value, process.env.PILOT_METRICS_SECRET!)) return;
  try {
    after(async () => { try { await persistPilotVital(value!, vital); } catch { console.warn(JSON.stringify({ event: "pilot_metric_unavailable" })); } });
  } catch { /* Measurements never change application responses. */ }
}

export async function withdrawPilotMetrics(req: Request) {
  const identity = pilotIdentity(cookieValue(req, PILOT_COOKIE), process.env.PILOT_METRICS_SECRET || "");
  if (!identity || !pilotConfigured()) return;
  const client = await metricsClient(), session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await client.db().collection<Metric>("PilotMetric").updateOne({ _id: identity.visitor }, {
        $set: { revoked: true, expiresAt: identity.expiresAt }, $unset: { stages: "", createdAt: "", vitalFence: "" },
      }, { upsert: true, session, maxTimeMS: 1000 });
      await client.db().collection("PilotVital").deleteMany({ visitor: identity.visitor }, { session, maxTimeMS: 1000 });
    }, { maxCommitTimeMS: 1000 });
  } finally { await session.endSession(); }
}

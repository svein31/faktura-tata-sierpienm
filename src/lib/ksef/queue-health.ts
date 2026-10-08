import { prisma } from "@/lib/db";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : [];
const total = (value: unknown) => Number(rows(value)[0]?.total || 0);
function oldest(value: unknown, now: Date) {
  const raw = rows(value)[0]?.oldestDueAt;
  const date = typeof raw === "string" ? raw : record(raw).$date;
  const parsed = typeof date === "string" ? Date.parse(date) : Number(record(date).$numberLong);
  return Number.isFinite(parsed) ? { oldestDueAt: new Date(parsed).toISOString(), oldestDueAgeSeconds: Math.max(0, Math.floor((now.getTime() - parsed) / 1000)) }
    : { oldestDueAt: null, oldestDueAgeSeconds: 0 };
}

/** Global aggregates contain counts and dates only. The database never returns invoice/customer data. */
export async function getQueueHealth(now = new Date()) {
  const date = { $date: now.toISOString() };
  const due = { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: date } }] };
  const unlocked = { $or: [{ lockedUntil: null }, { lockedUntil: { $lt: date } }] };
  const emailDue = { $or: [{ autoKsefEmailNextAttemptAt: null }, { autoKsefEmailNextAttemptAt: { $lte: date } }] };
  const readyEmail = {
    autoSendEmailOnKsef: true, type: "sale", isProforma: { $ne: true }, ksefStatus: "accepted",
    "ksef.environment": { $in: ["production", "test"] },
    ksefNumber: { $type: "string", $ne: "" }, upoXml: { $type: "string", $ne: "" },
    $and: [
      { $or: [{ autoKsefEmailStatus: { $in: [null, "queued", "retry"] } }, { autoKsefEmailStatus: "preparing", autoKsefEmailLockedUntil: { $lt: date } }] },
      emailDue,
    ],
  };
  const [ksefRaw, emailRaw] = await Promise.all([
    prisma.ksefQueueTask.aggregateRaw({ pipeline: [
      { $match: { status: { $in: ["queued", "processing", "verify_needed", "failed"] } } },
      { $facet: {
        counts: [{ $group: { _id: "$status", total: { $sum: 1 } } }],
        due: [{ $match: { status: "queued", $and: [due, unlocked] } }, { $group: { _id: null, total: { $sum: 1 }, oldestDueAt: { $min: { $ifNull: ["$nextAttemptAt", "$createdAt"] } } } }],
        expired: [{ $match: { status: "processing", lockedUntil: { $lt: date } } }, { $count: "total" }],
      } },
    ] }),
    prisma.invoice.aggregateRaw({ pipeline: [
      { $match: { autoSendEmailOnKsef: true, autoKsefEmailStatus: { $in: [null, "queued", "retry", "preparing", "sending", "verify_needed", "failed"] } } },
      { $facet: {
        counts: [{ $group: { _id: "$autoKsefEmailStatus", total: { $sum: 1 } } }],
        due: [{ $match: readyEmail }, { $group: { _id: null, total: { $sum: 1 }, oldestDueAt: { $min: { $ifNull: ["$autoKsefEmailNextAttemptAt", "$updatedAt"] } } } }],
        expired: [{ $match: { autoKsefEmailStatus: "sending", autoKsefEmailLockedUntil: { $lt: date } } }, { $count: "total" }],
      } },
    ] }),
  ]);
  const ksef = rows(ksefRaw)[0] || {}, email = rows(emailRaw)[0] || {};
  const counts = (value: unknown) => Object.fromEntries(rows(value).map(row => [String(row._id), Number(row.total || 0)]));
  const k = counts(ksef.counts), e = counts(email.counts);
  return {
    ok: true,
    generatedAt: now.toISOString(),
    paused: process.env.KSEF_PAUSE_DISPATCH === "true",
    ksef: { queued: k.queued || 0, due: total(ksef.due), processing: k.processing || 0, expiredProcessing: total(ksef.expired), verifyNeeded: k.verify_needed || 0, failed: k.failed || 0, ...oldest(ksef.due, now) },
    email: { due: total(email.due), sending: e.sending || 0, expiredSending: total(email.expired), verifyNeeded: e.verify_needed || 0, failed: e.failed || 0, ...oldest(email.due, now) },
  };
}

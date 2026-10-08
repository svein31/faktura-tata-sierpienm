import type { Prisma, PrismaClient } from "@prisma/client";
import { invoiceNumberSeries } from "./invoice-numbering";

type NumberingClient = Pick<PrismaClient, "invoice" | "invoiceNumberClaim">;
type CounterResult = Array<{ max: number | null; invalid: number }>;

/** Read at most two counters into Node instead of every historic invoice/reservation.
 * This only proposes a number: the existing transactional number claim remains the authority.
 */
export async function nextPersistedInvoiceNumber(
  db: NumberingClient, companyId: string, pattern: string, date: string, prefix: string,
) {
  const { regex, format } = invoiceNumberSeries(pattern, date, prefix);
  const reservationPrefix = `${companyId}:`;
  const escapedPrefix = reservationPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reservationRegex = `^${escapedPrefix}${regex.source.slice(1)}`;
  const aggregate = (match: Record<string, unknown>, input: string, expression: string) => [
    { $match: match },
    { $project: { found: { $regexFind: { input, regex: expression } } } },
    { $project: { counter: { $convert: { input: { $arrayElemAt: ["$found.captures", 0] }, to: "double", onError: null, onNull: null } } } },
    { $group: { _id: null, max: { $max: "$counter" }, invalid: { $sum: { $cond: [{ $eq: ["$counter", null] }, 1, 0] } } } },
    { $project: { _id: 0, max: 1, invalid: 1 } },
  ] as Prisma.InputJsonObject[];
  const results = await Promise.all([
    db.invoice.aggregateRaw({ pipeline: aggregate({ sellerCompanyId: { $oid: companyId }, number: { $regex: regex.source } }, "$number", regex.source) }),
    db.invoiceNumberClaim.aggregateRaw({ pipeline: aggregate({ _id: { $regex: reservationRegex } }, "$_id", reservationRegex) }),
  ]);
  let max = 0;
  for (const result of results as unknown as CounterResult[]) {
    const counter = result[0];
    if (!counter) continue;
    if (counter.invalid || counter.max === null || !Number.isSafeInteger(counter.max)) throw new Error("Licznik numeracji przekracza obsługiwany zakres.");
    max = Math.max(max, counter.max);
  }
  return format(max + 1);
}

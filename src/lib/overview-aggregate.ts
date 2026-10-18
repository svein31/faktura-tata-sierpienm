import type { Prisma } from "@prisma/client";

const num = (value: unknown) => ({ $convert: { input: value, to: "double", onError: 0, onNull: 0 } });
// MongoDB treats absent fields differently from explicit nulls in some expressions.
// Older invoice lines have neither settlement field; use quantity × price for them.
const hasSettlement = { $and: [
  { $ne: [{ $ifNull: ["$$line.settlementNet", null] }, null] },
  { $ne: [{ $ifNull: ["$$line.settlementVat", null] }, null] },
] };
const lineNet = { $round: [{ $cond: [hasSettlement, num("$$line.settlementNet"), { $multiply: [num("$$line.quantity"), num("$$line.netPrice")] }] }, 2] };
const lineVat = { $round: [{ $cond: [hasSettlement, num("$$line.settlementVat"), { $multiply: [lineNet, { $divide: [num("$$line.vatRate"), 100] }] }] }, 2] };
const lineValues = {
  $map: {
    input: { $cond: [{ $isArray: "$lines" }, "$lines", []] },
    as: "line",
    in: { rate: { $ifNull: ["$$line.vatRate", "23"] }, net: lineNet, vat: lineVat },
  },
};
const valued = [
  { $set: { lineValues, documentStatus: { $cond: [
    { $and: [{ $eq: ["$documentStatus", "draft"] }, { $ne: ["$status", "draft"] }, { $ne: [{ $ifNull: ["$issuedAt", null] }, null] }] },
    "issued", { $ifNull: ["$documentStatus", "$status"] },
  ] } } },
  { $set: {
    net: { $cond: [{ $ne: [num("$totalNet"), 0] }, num("$totalNet"), { $sum: "$lineValues.net" }] },
    vat: { $cond: [{ $ne: [num("$totalVat"), 0] }, num("$totalVat"), { $sum: "$lineValues.vat" }] },
    gross: { $cond: [{ $ne: [num("$totalGross"), 0] }, num("$totalGross"), { $add: [{ $sum: "$lineValues.net" }, { $sum: "$lineValues.vat" }] }] },
    month: { $substrBytes: ["$issueDate", 0, 7] },
  } },
];
const moneyGroup = (id: unknown) => ({ $group: { _id: id, net: { $sum: "$net" }, vat: { $sum: "$vat" }, gross: { $sum: "$gross" }, count: { $sum: 1 } } });
const yes = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });
const action = (condition: unknown, kind: string, label: unknown, detail: unknown, priority: number) => ({
  $cond: [condition, [{ id: { $concat: [kind, ":", { $toString: "$_id" }] }, kind, label, detail, href: { $concat: ["/invoices/", { $toString: "$_id" }] }, priority }], []],
});

/**
 * Every read reflects committed invoice writes, regardless of which route performed them.
 * The database groups rows before crossing the API boundary; no client-visible invoice scan.
 */
export function overviewPipeline(companyId: string, today: string, months: string[]): Prisma.InputJsonObject[] {
  const financeMatch = { $match: { type: "sale", status: { $ne: "draft" }, documentStatus: { $ne: "draft" }, isProforma: { $ne: true } } };
  const rejected = { $or: [{ $eq: ["$ksefStatus", "rejected"] }, { $eq: ["$status", "ksef_rejected"] }] };
  const uncertain = { $eq: ["$ksefStatus", "verify_needed"] };
  const offline = { $and: [{ $eq: ["$isOffline", true] }, { $eq: [{ $ifNull: ["$ksefNumber", ""] }, ""] }, { $ne: ["$ksefStatus", "accepted"] }] };
  const missingUpo = { $and: [{ $eq: ["$ksefStatus", "accepted"] }, { $gt: [{ $ifNull: ["$ksefNumber", ""] }, ""] }, { $eq: [{ $ifNull: ["$upoXml", ""] }, ""] }] };
  const draft = { $or: [{ $eq: ["$status", "draft"] }, { $eq: ["$documentStatus", "draft"] }] };
  const overdue = { $and: [{ $eq: ["$type", "sale"] }, { $ne: ["$isProforma", true] }, { $ne: ["$documentStatus", "draft"] }, { $ne: ["$status", "draft"] }, { $ne: ["$status", "paid"] }, { $ne: ["$paymentStatus", "paid"] }, { $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] };
  return [
    { $match: { sellerCompanyId: { $oid: companyId }, status: { $ne: "cancelled" }, documentStatus: { $ne: "cancelled" } } },
    ...valued,
    { $facet: {
      counts: [{ $group: { _id: null, rejected: yes(rejected), uncertain: yes(uncertain), overdue: yes(overdue), drafts: yes(draft), offline: yes(offline), missingUpo: yes(missingUpo) } }],
      actions: [
        { $project: { entries: { $concatArrays: [
          action(rejected, "KSeF", { $concat: ["Odrzucono ", "$number"] }, "Sprawdź dokument i powód odrzucenia", 0),
          action(uncertain, "KSeF", { $concat: ["Sprawdź wynik ", "$number"] }, "Zweryfikuj stan w KSeF przed ponowieniem", 0),
          action(missingUpo, "UPO", "$number", "Przyjęto w KSeF — pobierz potwierdzenie UPO", 1),
          action(offline, "Offline", { $concat: ["Do wysłania: ", "$number"] }, "Dokument utworzony offline", 1),
          action(overdue, "Po terminie", "$number", { $concat: ["Termin: ", "$dueDate"] }, 2),
          action(draft, "Szkic", "$number", "Dokończ dokument", 3),
        ] } } },
        { $unwind: "$entries" }, { $replaceRoot: { newRoot: "$entries" } },
        { $sort: { priority: 1, label: 1 } }, { $limit: 8 },
      ],
      recent: [{ $sort: { _id: -1 } }, { $limit: 5 }, { $project: { _id: 0, id: { $toString: "$_id" }, number: 1, currency: 1, gross: 1, issueDate: 1 } }],
      onboarding: [
        { $match: { type: "sale", isCorrection: { $ne: true }, isProforma: { $ne: true } } },
        { $sort: { _id: -1 } }, { $limit: 1 },
        { $project: { _id: 0, id: { $toString: "$_id" }, number: 1 } },
      ],
      totals: [financeMatch, moneyGroup("$currency")],
      months: [financeMatch, { $match: { month: { $in: months } } }, moneyGroup({ month: "$month", currency: "$currency" })],
      rates: [financeMatch, { $unwind: "$lineValues" }, { $group: { _id: { currency: "$currency", rate: "$lineValues.rate" }, value: { $sum: "$lineValues.vat" } } }],
      contractors: [financeMatch, { $group: { _id: { currency: "$currency", contractorId: "$contractorId" }, count: { $sum: 1 }, gross: { $sum: "$gross" } } }, { $setWindowFields: { partitionBy: "$_id.currency", sortBy: { gross: -1 }, output: { rank: { $documentNumber: {} } } } }, { $match: { rank: { $lte: 8 } } }],
      status: [financeMatch, { $group: { _id: { $cond: [rejected, "KSeF: odrzucona", { $cond: [{ $or: [{ $eq: ["$paymentStatus", "paid"] }, { $eq: ["$status", "paid"] }] }, "Opłacona", { $cond: [overdue, "Po terminie", "Wystawiona"] }] }] }, value: { $sum: 1 } } }],
    } },
  ] as Prisma.InputJsonObject[];
}

export type OverviewRaw = {
  counts: { rejected: number; uncertain: number; overdue: number; drafts: number; offline: number; missingUpo: number }[];
  actions: { id: string; kind: string; label: string; detail: string; href: string; priority: number }[];
  recent: { id: string; number: string; currency: string; gross: number | null; issueDate: string }[];
  onboarding?: { id: string; number: string }[];
  totals: { _id: string; net: number; vat: number; gross: number; count: number }[];
  months: { _id: { month: string; currency: string }; net: number; vat: number; gross: number; count: number }[];
  rates: { _id: { currency: string; rate: string }; value: number }[];
  contractors: { _id: { currency: string; contractorId: string }; count: number; gross: number }[];
  status: { _id: string; value: number }[];
};

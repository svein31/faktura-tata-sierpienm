import type { Invoice } from "@/lib/types";

export function ksefProgress(invoice: Invoice) {
  const number = invoice.ksefNumber || invoice.ksef?.number;
  const accepted = Boolean(number);
  const hasUpo = accepted && Boolean(invoice.hasUpo ?? invoice.upoXml?.trim());
  const rejected = !accepted && (invoice.ksefStatus === "rejected" || String(invoice.status) === "ksef_rejected");
  const sending = !accepted && !rejected && (Boolean(invoice.referenceNumber) || ["sending", "verify_needed", "processing"].includes(invoice.ksefStatus || "") || (invoice.status === "ksef_sent" && invoice.ksefStatus !== "queued"));
  const queued = !accepted && !rejected && !sending && invoice.ksefStatus === "queued";
  return { number, accepted, hasUpo, rejected, sending, queued, polling: sending || queued || (accepted && !hasUpo) };
}
